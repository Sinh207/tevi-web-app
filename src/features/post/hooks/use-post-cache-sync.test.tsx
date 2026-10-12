// @vitest-environment jsdom
import { eventBus } from '@shared/lib/event-bus'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postKeys } from '../api/post-api'
import { usePostCacheSync } from './use-post-cache-sync'

/**
 * The one listener that keeps cached posts in step with a purchase. Pinned: which event re-reads
 * which posts, that the fresh detail lands in lists this feature does not own, that the validator
 * is dropped first (B72), and that another account's purchase touches nothing.
 */
const getPost = vi.hoisted(() => vi.fn())
const forgetPostDetailCache = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acct-1' }) }))
vi.mock('../api/post-api', async importOriginal => ({
    ...(await importOriginal<typeof import('../api/post-api')>()),
    postApi: { getPost },
    forgetPostDetailCache,
}))

const post = (id: string, slug: string, locked: boolean, packages: string[] = []) => ({
    id,
    channel: { id: `c-${slug}`, slug },
    product_id: packages.length ? null : 'prod',
    required_packages: packages,
    viewer: locked ? 'STARGAZERS' : 'OWNER',
    need_unlock_package: locked,
})

const HOME = ['home', 'feed', 'acct-1']
const BOOKMARKS = postKeys.bookmarks('acct-1')
const pagesOf = (...rows: unknown[]) => ({ pages: [{ results: rows }], pageParams: [null] })

function setup() {
    const queryClient = new QueryClient()
    queryClient.setQueryData(HOME, pagesOf(post('p1', 'ada', true), post('p2', 'bob', true)))
    queryClient.setQueryData(
        BOOKMARKS,
        pagesOf(post('p1', 'ada', true), post('m1', 'ada', true, ['pkg'])),
    )
    function Probe() {
        usePostCacheSync()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    const rows = (key: readonly unknown[]) =>
        (queryClient.getQueryData(key) as ReturnType<typeof pagesOf>).pages[0].results as {
            id: string
            need_unlock_package: boolean
        }[]
    return { queryClient, rows }
}

beforeEach(() => {
    vi.clearAllMocks()
    getPost.mockImplementation(async (id: string) => ({ ...post(id, 'ada', false), fresh: true }))
})

describe('usePostCacheSync', () => {
    it('post:purchased re-reads that post and patches it into home and bookmarks', async () => {
        const { rows } = setup()

        act(() => eventBus.emit('post:purchased', { postId: 'p1', accountId: 'acct-1' }))

        await waitFor(() => expect(rows(HOME)[0].need_unlock_package).toBe(false))
        expect(rows(BOOKMARKS)[0].need_unlock_package).toBe(false)
        expect(rows(HOME)[1].need_unlock_package).toBe(true)
        expect(getPost).toHaveBeenCalledTimes(1)
        expect(forgetPostDetailCache).toHaveBeenCalledWith('p1', 'acct-1')
    })

    it('ignores a purchase made by an account that is no longer active', async () => {
        setup()
        act(() => eventBus.emit('post:purchased', { postId: 'p1', accountId: 'acct-2' }))
        await Promise.resolve()
        expect(getPost).not.toHaveBeenCalled()
    })

    it("membership:joined re-reads every cached post of that space, and only that space's", async () => {
        const { rows } = setup()

        act(() => eventBus.emit('membership:joined', { channelSlug: 'Ada', accountId: 'acct-1' }))

        await waitFor(() => expect(rows(BOOKMARKS)[1].need_unlock_package).toBe(false))
        expect(getPost.mock.calls.map(([id]) => id).sort()).toEqual(['m1', 'p1'])
        expect(rows(HOME)[1].need_unlock_package).toBe(true)
    })

    it('payment:succeeded re-reads only the posts a membership locks', async () => {
        setup()

        act(() => eventBus.emit('payment:succeeded', { purchaseType: null }))

        await waitFor(() => expect(getPost).toHaveBeenCalled())
        expect(getPost.mock.calls.map(([id]) => id)).toEqual(['m1'])
    })
})
