// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePost, type Post } from '../api/types'

const addBookmark = vi.fn()
const removeBookmark = vi.fn()
vi.mock('../api/post-api', () => ({
    postApi: {
        addBookmark: (...a: unknown[]) => addBookmark(...a),
        removeBookmark: (...a: unknown[]) => removeBookmark(...a),
    },
    postKeys: { all: ['post'] },
}))

const auth = { isAuthenticated: true, activeId: 'acc-1' as string | null }
const openLoginDialog = vi.fn()
vi.mock('@features/auth', () => ({
    useAuth: () => auth,
    useRequireAuth:
        () =>
        <A extends unknown[]>(cb: (...args: A) => void) =>
        (...args: A) => {
            if (!auth.isAuthenticated) {
                openLoginDialog()
                return
            }
            cb(...args)
        },
}))

const success = vi.fn()
const error = vi.fn()
vi.mock('sonner', () => ({
    toast: { success: (m: string) => success(m), error: (m: string) => error(m) },
}))

const { usePostBookmark } = await import('./use-post-bookmark')

function fixture(overrides: Record<string, unknown> = {}): Post {
    const parsed = normalizePost({ id: 'p1', ...overrides })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

function mount(post: Post) {
    const out = { current: null as ReturnType<typeof usePostBookmark> | null }
    function Probe({ post }: { post: Post }) {
        out.current = usePostBookmark(post)
        return null
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
        <QueryClientProvider client={client}>
            <Probe post={post} />
        </QueryClientProvider>,
    )
    return out
}

beforeEach(() => {
    addBookmark.mockReset().mockResolvedValue(true)
    removeBookmark.mockReset().mockResolvedValue(true)
    success.mockReset()
    error.mockReset()
    openLoginDialog.mockReset()
    auth.isAuthenticated = true
})

describe('usePostBookmark', () => {
    /**
     * The difference from reacting, and legacy's own behaviour: nothing is animated here, so the
     * icon must not promise a bookmark the server has not taken. A reader who finds out at the
     * bookmarks list is far past being able to do anything about it.
     */
    it('does not flip until the server confirms', async () => {
        let settle: (v: boolean) => void = () => {}
        addBookmark.mockReturnValue(new Promise<boolean>(resolve => (settle = resolve)))

        const out = mount(fixture())
        act(() => out.current?.toggle())
        expect(out.current?.bookmarked).toBe(false)

        await act(async () => settle(true))
        expect(out.current?.bookmarked).toBe(true)
    })

    it('adds with the post id in the body endpoint and removes with the path one', async () => {
        const out = mount(fixture())
        act(() => out.current?.toggle())
        await waitFor(() => expect(addBookmark).toHaveBeenCalledWith('p1', 'acc-1'))

        const saved = mount(fixture({ is_bookmark: true }))
        act(() => saved.current?.toggle())
        await waitFor(() => expect(removeBookmark).toHaveBeenCalledWith('p1', 'acc-1'))
    })

    /**
     * A 2xx whose body says `success: false` is a write that did not land. Flipping on "it did not
     * throw" is exactly what this guards against.
     */
    it('stays put when the response says the write did not land', async () => {
        addBookmark.mockResolvedValue(false)
        const out = mount(fixture())
        act(() => out.current?.toggle())
        await waitFor(() => expect(error).toHaveBeenCalled())
        expect(out.current?.bookmarked).toBe(false)
        expect(success).not.toHaveBeenCalled()
    })

    it('stays put when the request fails', async () => {
        addBookmark.mockRejectedValue(new Error('nope'))
        const out = mount(fixture())
        act(() => out.current?.toggle())
        await waitFor(() => expect(out.current?.isPending).toBe(false))
        expect(out.current?.bookmarked).toBe(false)
        expect(success).not.toHaveBeenCalled()
    })

    /** A bookmark has no other visible consequence on this screen, so both outcomes are announced. */
    it('announces each direction', async () => {
        const out = mount(fixture())
        act(() => out.current?.toggle())
        await waitFor(() => expect(success).toHaveBeenCalledOnce())
        const added = success.mock.calls[0][0]

        const saved = mount(fixture({ is_bookmark: true }))
        act(() => saved.current?.toggle())
        await waitFor(() => expect(success).toHaveBeenCalledTimes(2))
        const removed = success.mock.calls[1][0]
        // The two directions must not share a sentence — "bookmarked" for an un-bookmark is worse
        // than no toast at all.
        expect(added).not.toBe(removed)
    })

    it('raises the sign-in dialog for a guest and sends nothing', () => {
        auth.isAuthenticated = false
        const out = mount(fixture())
        act(() => out.current?.toggle())
        expect(openLoginDialog).toHaveBeenCalledOnce()
        expect(addBookmark).not.toHaveBeenCalled()
    })

    /** `isPending` only turns true after a render, so the guard has to be a ref. */
    it('ignores a second press while one is in flight', async () => {
        addBookmark.mockReturnValue(new Promise(() => {}))
        const out = mount(fixture())
        act(() => out.current?.toggle())
        act(() => out.current?.toggle())
        await waitFor(() => expect(addBookmark).toHaveBeenCalledOnce())
    })
})
