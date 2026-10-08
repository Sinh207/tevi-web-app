// @vitest-environment jsdom
import { normalizePost, type Post } from '@features/post'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { groupKey, type PostGroup } from '../lib/post-groups'

/**
 * The claims here are the ones the pure `post-groups` tests cannot make, because each is about the
 * hook's behaviour **over time or over pages** rather than about a fold:
 *
 * - a guest asks for nothing — their page is the server's (`publicFeed`), and with none they get the
 *   same empty state as anybody
 * - a run of posts that straddles a page boundary is **one** group (the fold is across all pages,
 *   not per page and concatenated)
 * - `needsMore` is expressed in *cards drawn* — the number legacy computes inconsistently with its
 *   own renderer, and the reason a feed of collapsed groups stops asking for pages too early
 * - blocking a space removes its posts **without a refetch**, which is the one thing an
 *   invalidation cannot deliver in time
 */
const getFeed = vi.fn()
vi.mock('../api/home-api', () => ({
    FEED_PAGE_SIZE: 20,
    homeApi: { getFeed: (...a: unknown[]) => getFeed(...a) },
    homeKeys: { all: ['home'], feed: (id: string | null) => ['home', 'feed', id ?? 'anon'] },
}))

const auth = { isAuthenticated: true, activeId: 'acc-1' as string | null }
vi.mock('@features/auth', () => ({ useAuth: () => auth }))

const { useHomeFeed } = await import('./use-home-feed')

/** An arbitrary fixed instant; every offset below is relative to it. */
const BASE = 1_760_000_000_000
const MINUTES = (n: number) => BASE + n * 60_000

/**
 * A `next` the cursor parser accepts.
 *
 * It has to be a URL carrying a **query**: `paramsFromNextUrl` returns `null` for a bare token, so
 * a fixture like `'p2'` would silently end the feed and every pagination claim below would pass
 * against a one-page list.
 */
const NEXT = 'https://api.test/core/v3/channel/followed-channels/threads/?limit=20&offset=20'

/** Parsed, for the reason `post-groups.test.ts` states — `created_at` is normalised, not raw. */
function post(id: string, channel = 'ch-1', at: number = BASE): Post {
    const parsed = normalizePost({ id, created_at: at, channel: { id: channel } })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

function mount(publicFeed: Post[] | null = null) {
    const out = { current: null as ReturnType<typeof useHomeFeed> | null }
    function Probe() {
        out.current = useHomeFeed({ publicFeed })
        return null
    }
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    render(
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>,
    )
    return out
}

beforeEach(() => {
    getFeed.mockReset().mockResolvedValue({ results: [], next: null })
    auth.isAuthenticated = true
    auth.activeId = 'acc-1'
})

describe('useHomeFeed', () => {
    it('asks for the first page with no cursor, scoped to the active account', async () => {
        const probe = mount()

        await waitFor(() => expect(probe.current?.isLoading).toBe(false))
        expect(getFeed).toHaveBeenCalledTimes(1)
        expect(getFeed.mock.calls[0][0]).toMatchObject({ cursor: null, accountId: 'acc-1' })
    })

    it('is empty only once the first page has come back holding nothing', async () => {
        const probe = mount()

        // While the request is in flight nobody knows the feed is empty, and saying so is the
        // failure this flag exists to prevent.
        expect(probe.current?.isEmpty).toBe(false)
        await waitFor(() => expect(probe.current?.isEmpty).toBe(true))
    })

    it('folds a run that straddles a page boundary into one group', async () => {
        getFeed
            .mockResolvedValueOnce({
                results: [post('a'), post('b', 'ch-1', MINUTES(1))],
                next: NEXT,
            })
            .mockResolvedValueOnce({ results: [post('c', 'ch-1', MINUTES(2))], next: null })

        const probe = mount()
        await waitFor(() => expect(probe.current?.hasNextPage).toBe(true))
        await act(async () => {
            await probe.current?.fetchNextPage()
        })

        await waitFor(() => expect(probe.current?.groups).toHaveLength(1))
        expect(probe.current?.groups[0].posts.map(p => p.id)).toEqual(['a', 'b', 'c'])
    })

    it('counts cards rather than posts when deciding it needs another page', async () => {
        // Twenty posts from one space inside five minutes: a full page that draws exactly **one**
        // card. Counting posts would say the screen is full; counting cards says it is not.
        getFeed.mockResolvedValueOnce({
            results: Array.from({ length: 20 }, (_, i) => post(`p${i}`, 'ch-1', BASE + i * 1000)),
            next: NEXT,
        })

        const probe = mount()

        await waitFor(() => expect(probe.current?.groups).toHaveLength(1))
        expect(probe.current?.needsMore).toBe(true)
    })

    it('stops asking once there is no next page, however few cards it drew', async () => {
        getFeed.mockResolvedValueOnce({ results: [post('a')], next: null })

        const probe = mount()

        await waitFor(() => expect(probe.current?.groups).toHaveLength(1))
        // One card, which is under the threshold — but the feed is genuinely over, so the check
        // must not loop.
        expect(probe.current?.needsMore).toBe(false)
    })

    it('drops a blocked space immediately, without a refetch', async () => {
        getFeed.mockResolvedValueOnce({
            results: [post('a', 'ch-1'), post('b', 'ch-2')],
            next: null,
        })

        const probe = mount()
        await waitFor(() => expect(probe.current?.groups).toHaveLength(2))

        act(() => probe.current?.hideChannel('ch-1'))

        expect(probe.current?.groups.map(g => g.channelId)).toEqual(['ch-2'])
        expect(getFeed).toHaveBeenCalledTimes(1)
    })

    it('toggles a group open and closed by index', async () => {
        getFeed.mockResolvedValueOnce({
            results: Array.from({ length: 5 }, (_, i) => post(`p${i}`, 'ch-1', BASE + i * 1000)),
            next: null,
        })

        const probe = mount()
        await waitFor(() => expect(probe.current?.groups).toHaveLength(1))

        const key = groupKey(probe.current?.groups[0] as PostGroup)

        act(() => probe.current?.toggleGroup(key))
        expect(probe.current?.expanded.has(key)).toBe(true)

        act(() => probe.current?.toggleGroup(key))
        expect(probe.current?.expanded.has(key)).toBe(false)
    })

    /**
     * The bug the key exists for. Legacy records the expanded set by **index**, so removing a group
     * above an opened one closes it and opens whichever slid into its place.
     */
    it('keeps the opened group open when a space above it is blocked', async () => {
        getFeed.mockResolvedValueOnce({
            results: [
                post('a', 'ch-1'),
                ...Array.from({ length: 5 }, (_, i) => post(`b${i}`, 'ch-2', MINUTES(10 + i))),
            ],
            next: null,
        })

        const probe = mount()
        await waitFor(() => expect(probe.current?.groups).toHaveLength(2))

        const opened = groupKey(probe.current?.groups[1] as PostGroup)
        act(() => probe.current?.toggleGroup(opened))
        expect(probe.current?.expanded.has(opened)).toBe(true)

        act(() => probe.current?.hideChannel('ch-1'))

        // The opened group is now at index 0, and is still the one that is open.
        expect(probe.current?.groups).toHaveLength(1)
        expect(groupKey(probe.current?.groups[0] as PostGroup)).toBe(opened)
        expect(probe.current?.expanded.has(opened)).toBe(true)
    })

    describe('the public page, for a reader who is not signed in', () => {
        it('shows the server’s page to a guest, without a request and without more pages', async () => {
            auth.isAuthenticated = false
            auth.activeId = null

            const probe = mount([post('a'), post('b', 'ch-2', MINUTES(10))])

            await waitFor(() => expect(probe.current?.groups).toHaveLength(2))
            expect(probe.current?.isPublic).toBe(true)
            expect(probe.current?.isEmpty).toBe(false)
            // The gateway answers a guest's bearer with an empty list, so there is no page two.
            expect(probe.current?.hasNextPage).toBe(false)
            expect(probe.current?.needsMore).toBe(false)
            expect(getFeed).not.toHaveBeenCalled()
        })

        it('is legacy’s NoPost — plain empty — when the server had nothing', async () => {
            auth.isAuthenticated = false
            auth.activeId = null

            const probe = mount([])

            await waitFor(() => expect(probe.current?.isEmpty).toBe(true))
            expect(probe.current?.isPublic).toBe(false)
            expect(probe.current?.isLoading).toBe(false)
            expect(getFeed).not.toHaveBeenCalled()
        })

        it('is never shown to a signed-in reader, whose feed is their own', async () => {
            getFeed.mockResolvedValue({ results: [post('mine', 'ch-9')], next: null })

            const probe = mount([post('public', 'ch-1')])

            await waitFor(() => expect(probe.current?.isLoading).toBe(false))
            expect(probe.current?.isPublic).toBe(false)
            expect(probe.current?.groups.flatMap(group => group.posts.map(p => p.id))).toEqual([
                'mine',
            ])
        })
    })
})
