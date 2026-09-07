// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGiftRecipients } from './use-gift-recipients'

/**
 * The picker's four claims that are **sequences**, not values — the reason this hook exists rather
 * than six `useState`s:
 *
 * - the term is debounced, and clearing applies **at once**;
 * - the followed list is not asked for at all without a real account;
 * - the two lists have **separate** loading states, which is what lets the placeholder reserve the
 *   layout that replaces it (they were merged, and results landing dropped everything 215px);
 * - "no results" waits for **both** lists, not just the one that answered first.
 *
 * None of those can be stated in a comment, and the last two are what a rendered screenshot cannot
 * catch either — they are about *when*.
 */

const api = vi.hoisted(() => ({
    searchRecipients: vi.fn(),
    getFollowedRecipients: vi.fn(),
    resolveReceiverId: vi.fn(),
}))
vi.mock('../api/gift-recipient-api', async importOriginal => ({
    ...(await importOriginal<typeof import('../api/gift-recipient-api')>()),
    giftRecipientApi: api,
}))

const session = vi.hoisted(() => ({ isAuthenticated: true, isAnonymous: false }))
vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: '900001', ...session }) }))

const row = (slug: string) => ({
    id: `${slug}-id`,
    slug,
    name: slug,
    display_name: null,
    images: { thumb: null, avatar_video: null },
    verified_tick_badge: null,
    is_premium: false,
    is_nsfw: false,
    owner_id: null,
})

function probe() {
    const seen: { current: ReturnType<typeof useGiftRecipients> | null } = { current: null }
    function Probe() {
        seen.current = useGiftRecipients()
        return null
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>,
    )
    return { seen }
}

/**
 * Settle a term **without** the debounce — `commit()` is what Enter does, and it sets the query key
 * synchronously.
 *
 * Used by every block except the one that is actually testing the debounce, and the reason is
 * mechanical: `waitFor` polls on real timers, so a suite on `vi.useFakeTimers()` cannot await
 * anything asynchronous — it hangs for the full timeout and then fails. Fake timers are therefore
 * scoped to the one describe that needs them.
 */
async function search(
    seen: { current: ReturnType<typeof useGiftRecipients> | null },
    term: string,
) {
    act(() => seen.current?.setSearch(term))
    act(() => seen.current?.commit())
    await act(async () => {})
}

beforeEach(() => {
    api.searchRecipients.mockReset()
    api.getFollowedRecipients.mockReset()
    api.searchRecipients.mockResolvedValue({ count: 0, results: [], next: null })
    api.getFollowedRecipients.mockResolvedValue([])
    session.isAuthenticated = true
    session.isAnonymous = false
})

describe('useGiftRecipients — the term', () => {
    // The only block that needs them; see `search()` above for why they are not global.
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('asks nothing until the debounce elapses', async () => {
        const { seen } = probe()
        act(() => seen.current?.setSearch('ada'))

        expect(seen.current?.isIdle).toBe(true)
        expect(api.searchRecipients).not.toHaveBeenCalled()

        await act(async () => {
            vi.advanceTimersByTime(400)
        })
        expect(api.searchRecipients).toHaveBeenCalledTimes(1)
    })

    it('sends one request for a word typed a letter at a time', async () => {
        // The debounce *is* the throttle — there is no character floor, which would silently show
        // nothing until the third glyph and is unusable in the CJK locales this app ships.
        const { seen } = probe()
        for (const term of ['a', 'ad', 'ada']) {
            act(() => seen.current?.setSearch(term))
            await act(async () => {
                vi.advanceTimersByTime(100)
            })
        }
        await act(async () => {
            vi.advanceTimersByTime(400)
        })

        expect(api.searchRecipients).toHaveBeenCalledTimes(1)
        expect(api.searchRecipients.mock.calls[0]?.[0]).toMatchObject({ q: 'ada' })
    })

    it('clears immediately, with no request and no 400ms of stale rows', async () => {
        const { seen } = probe()
        act(() => seen.current?.setSearch('ada'))
        await act(async () => {
            vi.advanceTimersByTime(400)
        })
        api.searchRecipients.mockClear()

        act(() => seen.current?.setSearch(''))
        expect(seen.current?.isIdle).toBe(true)
        expect(api.searchRecipients).not.toHaveBeenCalled()
    })

    it('Enter settles the field now, skipping the wait', async () => {
        const { seen } = probe()
        act(() => seen.current?.setSearch('ada'))
        act(() => seen.current?.commit())

        expect(seen.current?.isIdle).toBe(false)
        await act(async () => {})
        expect(api.searchRecipients).toHaveBeenCalledTimes(1)
    })
})

describe('useGiftRecipients — who gets a followed list', () => {
    it('asks for one for a real account', async () => {
        const { seen } = probe()
        await search(seen, 'ada')
        expect(api.getFollowedRecipients).toHaveBeenCalledTimes(1)
    })

    it('never asks for an anonymous session, and reserves no placeholder for it', async () => {
        /*
         * `isAuthenticated` is true for a visitor who has never signed in — this app always keeps a
         * session — and an anonymous account follows nobody, so the request's answer is known in
         * advance. It is also what makes the strip's placeholder exact rather than a guess.
         */
        session.isAnonymous = true
        const { seen } = probe()
        await search(seen, 'ada')

        expect(api.getFollowedRecipients).not.toHaveBeenCalled()
        expect(seen.current?.isFollowingLoading).toBe(false)
    })
})

describe('useGiftRecipients — two loading states, not one', () => {
    it('shows the strip as soon as it answers, without waiting for the slower list', async () => {
        let releaseResults: (v: unknown) => void = () => {}
        api.searchRecipients.mockReturnValue(
            new Promise(resolve => {
                releaseResults = resolve
            }),
        )
        api.getFollowedRecipients.mockResolvedValue([row('ada')])

        const { seen } = probe()
        await search(seen, 'ada')

        await waitFor(() => expect(seen.current?.following).toHaveLength(1))
        // The strip is done; the rows are still coming. Merged, both were held behind the slower.
        expect(seen.current?.isFollowingLoading).toBe(false)
        expect(seen.current?.isResultsLoading).toBe(true)

        await act(async () => {
            releaseResults({ count: 1, results: [row('adam')], next: null })
        })
        await waitFor(() => expect(seen.current?.isResultsLoading).toBe(false))
    })

    it('does not call it empty while the followed list is still in flight', async () => {
        /*
         * The mirror case the split created: with the global list settled empty and the followed one
         * unanswered, `following` is `[]` because it has not replied — not because there is nothing.
         * Without the guard the screen drew "no results found" over a strip about to arrive.
         */
        let releaseFollowed: (v: unknown) => void = () => {}
        api.getFollowedRecipients.mockReturnValue(
            new Promise(resolve => {
                releaseFollowed = resolve
            }),
        )

        const { seen } = probe()
        await search(seen, 'zzz')

        await waitFor(() => expect(seen.current?.isResultsLoading).toBe(false))
        expect(seen.current?.isEmpty).toBe(false)

        await act(async () => {
            releaseFollowed([])
        })
        await waitFor(() => expect(seen.current?.isEmpty).toBe(true))
    })

    it('a failed followed list is silent; only the global one reaches the screen', async () => {
        api.getFollowedRecipients.mockRejectedValue(new Error('502'))
        api.searchRecipients.mockResolvedValue({ count: 1, results: [row('adam')], next: null })

        const { seen } = probe()
        await search(seen, 'ada')

        await waitFor(() => expect(seen.current?.results).toHaveLength(1))
        // The part the reader asked for survives a followed list that 502s.
        expect(seen.current?.isError).toBe(false)
        expect(seen.current?.following).toEqual([])
    })
})

describe('useGiftRecipients — the rows', () => {
    it('drops a space the paginated list returned twice', async () => {
        /*
         * A numbered `?page=` list over a dataset the backend may re-rank can return the same space
         * on two pages, and React is then handed two children with one key. It does **not**
         * de-duplicate against the strip: a space you follow appearing in both sections is not a
         * duplicate — the two answer different questions.
         */
        api.searchRecipients.mockResolvedValue({
            count: 2,
            results: [row('ada'), row('ada'), row('adam')],
            next: null,
        })
        const { seen } = probe()
        await search(seen, 'ada')

        await waitFor(() => expect(seen.current?.results).toHaveLength(2))
        expect(seen.current?.results.map(r => r.slug)).toEqual(['ada', 'adam'])
    })

    it('does not expose the settled term, because nothing on this screen quotes it', () => {
        /*
         * `useChannelSearch` publishes `query` so `/search` can print "No results for X". This
         * picker deliberately does not quote the term back — it is four lines up in a field the
         * reader is still looking at — so there is no reader for the field and it is not on the
         * result. A field with no reader is what this repo argues against; the assertion is here so
         * adding one is a deliberate act rather than a drive-by.
         */
        const { seen } = probe()
        expect(seen.current && 'query' in seen.current).toBe(false)
    })
})
