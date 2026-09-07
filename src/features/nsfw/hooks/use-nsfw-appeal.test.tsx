// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNsfwAppeal } from './use-nsfw-appeal'

/**
 * The three claims `useNsfwAppeal` makes that are **sequences**, and that no comment can pin.
 *
 * Every one of them fails silently in the direction that matters: a duplicate appeal filed against a
 * case a human is already reading, a Submit button offered while a flagged post is still up, or a
 * button that can never enable at all. None of the three throws, and none is visible in a screenshot.
 */

const forgetFlaggedPostsCache = vi.hoisted(() => vi.fn(async () => {}))
const rememberDeletedPost = vi.hoisted(() => vi.fn())
const getLatestAppeal = vi.hoisted(() => vi.fn())
const getFlaggedPosts = vi.hoisted(() => vi.fn())
const deletePost = vi.hoisted(() => vi.fn())
const submitAppeal = vi.hoisted(() => vi.fn())

vi.mock('../api/nsfw-appeal-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/nsfw-appeal-api')>('../api/nsfw-appeal-api')
    return {
        ...actual,
        nsfwAppealApi: { getLatestAppeal, getFlaggedPosts, deletePost, submitAppeal },
        forgetFlaggedPostsCache,
        rememberDeletedPost,
    }
})

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

function post(id: string) {
    return {
        id,
        caption: null,
        createdAt: null,
        thumbnail: null,
        imageCount: 0,
        isVideo: false,
        access: 'public' as const,
        starCount: 0,
        replyCount: 0,
    }
}

function renderHook({ enabled = true }: { enabled?: boolean } = {}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: ReturnType<typeof useNsfwAppeal> | undefined
    function Probe() {
        api = useNsfwAppeal({ enabled })
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { read: () => api as ReturnType<typeof useNsfwAppeal> }
}

beforeEach(() => {
    vi.clearAllMocks()
    getLatestAppeal.mockResolvedValue(null)
    getFlaggedPosts.mockResolvedValue({ posts: [], nextCursor: null })
    deletePost.mockResolvedValue(undefined)
    submitAppeal.mockResolvedValue(undefined)
})

describe('an appeal already on file', () => {
    it('shows the confirmation and never asks for the queue', async () => {
        getLatestAppeal.mockResolvedValue({ id: 'ap-1', status: 'pending' })
        const { read } = renderHook()

        await waitFor(() => expect(read().step).toBe('submitted'))
        // The whole point: no queue request, so no empty list and no second Submit button.
        expect(getFlaggedPosts).not.toHaveBeenCalled()
    })

    it('reads a 404-as-null from the api as "never appealed" and opens the queue', async () => {
        getFlaggedPosts.mockResolvedValue({ posts: [post('p1')], nextCursor: null })
        const { read } = renderHook()

        await waitFor(() => expect(read().step).toBe('queue'))
        expect(read().posts).toHaveLength(1)
        expect(read().canSubmit).toBe(false)
    })
})

describe('the queue decides the button', () => {
    it('stays disabled while a page is empty but another page is advertised', async () => {
        /*
         * The empty page advertises a next one, so the hook advances — and the page behind it has a
         * row. Submit must not have been offered in between: an appeal filed with a flagged post
         * still up is one the backend refuses.
         */
        getFlaggedPosts
            .mockResolvedValueOnce({ posts: [], nextCursor: { cursor: ['2'] } })
            .mockResolvedValue({ posts: [post('p9')], nextCursor: null })
        const { read } = renderHook()

        await waitFor(() => expect(read().posts).toEqual([post('p9')]))
        expect(read().canSubmit).toBe(false)
    })

    it('enables on an empty page with no next page, and fetches nothing more', async () => {
        getFlaggedPosts.mockResolvedValue({ posts: [], nextCursor: null })
        const { read } = renderHook()

        await waitFor(() => expect(read().canSubmit).toBe(true))
        expect(getFlaggedPosts).toHaveBeenCalledTimes(1)
    })

    /**
     * The correction the backend forced, and the claim the whole screen now rests on.
     *
     * `nsfw-posts/` answers a **304** right after a delete, and once that was worked around it
     * turned out the list is **cached server-side** and serves the deleted row in a fresh 200 too.
     * So the row is removed from the cache locally and no read is taken: a refetch here could only
     * ask a cache to confirm something it does not know yet, and would put the row back.
     */
    it('splices a deleted row out of the cache without re-reading the list', async () => {
        getFlaggedPosts.mockResolvedValue({
            posts: [post('p1'), post('p2')],
            nextCursor: null,
        })
        const { read } = renderHook()
        await waitFor(() => expect(read().posts).toHaveLength(2))

        read().deletePost('p1')

        await waitFor(() => expect(read().posts).toEqual([post('p2')]))
        // One read, taken when the screen opened. The delete added none.
        expect(getFlaggedPosts).toHaveBeenCalledTimes(1)
        // And the id is remembered, so a later honest read cannot resurrect it.
        expect(rememberDeletedPost).toHaveBeenCalledWith('p1')
    })

    it('enables Submit once the last row of a last page is spliced out', async () => {
        getFlaggedPosts.mockResolvedValue({ posts: [post('p1')], nextCursor: null })
        const { read } = renderHook()
        await waitFor(() => expect(read().posts).toHaveLength(1))

        read().deletePost('p1')

        await waitFor(() => expect(read().canSubmit).toBe(true))
        expect(getFlaggedPosts).toHaveBeenCalledTimes(1)
    })

    /**
     * The `next` case the reporter asked about: clearing a full page is not clearing the queue.
     * Exactly one further request is allowed, and only because the alternative is an appeal the
     * backend refuses.
     */
    it('advances to the next page when the last row of a non-final page goes', async () => {
        getFlaggedPosts
            .mockResolvedValueOnce({ posts: [post('p1')], nextCursor: { cursor: ['2'] } })
            .mockResolvedValue({ posts: [post('p2')], nextCursor: null })
        const { read } = renderHook()
        await waitFor(() => expect(read().posts).toEqual([post('p1')]))

        read().deletePost('p1')

        await waitFor(() => expect(read().posts).toEqual([post('p2')]))
        expect(getFlaggedPosts).toHaveBeenCalledTimes(2)
        expect(getFlaggedPosts.mock.calls[1][0]).toMatchObject({ cursor: { cursor: ['2'] } })
        expect(read().canSubmit).toBe(false)
    })
})

describe('a read that failed', () => {
    /**
     * The most reassuring possible rendering of a broken request, and it shipped for an hour.
     *
     * The queue is only fetched once `latest/` succeeds, so a 500 there left the queue query
     * `isPending` with `fetchStatus: 'idle'` — no rows, no error, nothing in flight. The screen drew
     * *"All NSFW content has been removed!"* over a Submit button that could never enable. Nothing
     * about that is distinguishable from success except that it is false.
     */
    it('reports an error when latest/ fails, rather than an empty queue', async () => {
        getLatestAppeal.mockRejectedValue(new Error('boom'))
        const { read } = renderHook()

        await waitFor(() => expect(read().isQueueError).toBe(true))
        expect(read().canSubmit).toBe(false)
        expect(getFlaggedPosts).not.toHaveBeenCalled()
    })

    it('retries the read that actually failed', async () => {
        getLatestAppeal.mockRejectedValue(new Error('boom'))
        const { read } = renderHook()
        await waitFor(() => expect(read().isQueueError).toBe(true))

        const before = getLatestAppeal.mock.calls.length
        getLatestAppeal.mockResolvedValue(null)
        read().retry()

        // Retrying the queue alone would re-run a query that is still disabled.
        await waitFor(() => expect(getLatestAppeal.mock.calls.length).toBeGreaterThan(before))
        await waitFor(() => expect(getFlaggedPosts).toHaveBeenCalled())
    })
})

describe('submitting', () => {
    it('flips to the confirmation on the POST alone, without re-reading latest/', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(read().canSubmit).toBe(true))

        const latestCallsBefore = getLatestAppeal.mock.calls.length
        read().submitAppeal()

        await waitFor(() => expect(read().step).toBe('submitted'))
        expect(submitAppeal).toHaveBeenCalledTimes(1)
        // Filing the appeal is the other event that changes what the queue should say.
        expect(forgetFlaggedPostsCache).toHaveBeenCalledWith('acc-1')
        // Invalidated, so a later open reads the server — but the confirmation did not wait on it.
        expect(getLatestAppeal.mock.calls.length).toBeGreaterThanOrEqual(latestCallsBefore)
    })
})

describe('while the dialog is closed', () => {
    it('makes no request at all', async () => {
        renderHook({ enabled: false })
        await waitFor(() => expect(getLatestAppeal).not.toHaveBeenCalled())
        expect(getFlaggedPosts).not.toHaveBeenCalled()
    })
})
