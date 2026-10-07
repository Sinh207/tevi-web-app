// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchChannel } from '../api/types'
import { SEARCH_PAGE_SIZE, type SearchChannelsPage } from '../lib/search-page'
import { useChannelSearch } from './use-channel-search'

/**
 * The six things about this hook that a comment cannot pin, and every one of them fails
 * *quietly* in a browser:
 *
 * 1. **The debounce.** A term that reaches the request per keystroke is five requests and five
 *    cache entries for one word. It looks like it works.
 * 2. **Clearing applies at once.** 400ms of stale rows after pressing the field's cancel reads as
 *    the button not working.
 * 3. **Recents are written on commit, not from the debounce.** This is the deliberate departure
 *    from legacy, whose `addSearchTerm` inside the debounce records every prefix of a slowly-typed
 *    word — "a", "ad", "ada" — so one search leaves three rows in Recents.
 * 4. **The Following grid is signed-in-only, and its failure is silent.** An anonymous visitor
 *    must not sit in a loading state for a request that was never going to be made, and a
 *    followed-list 502 must not take the global results away with it.
 * 5. **`record` is not `commit`.** Opening a row records the term that *found* it and issues no
 *    request; the difference only appears on a fast typist, and getting it wrong records a term
 *    whose results nobody saw and fetches a page nobody is left to read.
 * 6. **A row returned on two pages appears once.** Offset pagination over a re-rankable set
 *    duplicates rows, and the key is the slug — so the failure is a duplicate-key warning in
 *    development and two identical rows in production.
 *
 * The paging rules themselves are `search-page.test.ts`'s and are not re-tested here.
 */

const searchChannels = vi.hoisted(() => vi.fn())
const getFollowedChannels = vi.hoisted(() => vi.fn())
const remember = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ state: { activeId: 'acc-1', isAuthenticated: true } }))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('../api/search-api', async () => {
    const actual = await vi.importActual<typeof import('../api/search-api')>('../api/search-api')
    return { ...actual, searchApi: { searchChannels, getFollowedChannels } }
})
/*
 * The recents hook is mocked rather than allowed to touch `localStorage`: what is asserted here
 * is *when* a term is recorded, not how it is stored — `shared/lib/search-recents.test.ts` owns
 * the storage rules, and a real one would couple these tests to them.
 */
vi.mock('./use-search-recents', () => ({
    useSearchRecents: () => ({ recents: [], remember, forget: vi.fn(), clear: vi.fn() }),
}))

/** One row is enough — nothing here reads what is in it beyond the slug. */
function rows(count: number, from = 0): SearchChannel[] {
    return Array.from({ length: count }, (_, index) => ({
        slug: `space-${from + index}`,
    })) as SearchChannel[]
}

function page(count: number): SearchChannelsPage {
    return { results: rows(count), count, next: null }
}

function mount(options: Parameters<typeof useChannelSearch>[0] = {}) {
    /*
     * `staleTime` mirrors the app's own client (`shared/lib/api/query-client.ts`), and the
     * "clearing costs no request" assertion depends on it: at the library default of 0 every
     * return to a cached key refetches, which is not what a reader of this screen gets.
     */
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    })
    let api!: ReturnType<typeof useChannelSearch>
    function Probe() {
        api = useChannelSearch(options)
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return {
        read: () => api,
        type: (value: string) => act(() => api.setSearch(value)),
        press: (fn: () => void) => act(() => fn()),
        /**
         * Let pending promises resolve and React re-render.
         *
         * `waitFor` is not usable here: it polls on timers this file has faked, so it would spin
         * until the test times out. Every request resolves immediately, so advancing by zero is
         * enough to flush the microtask queue.
         */
        flush: async () => {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0)
            })
        },
        /**
         * Past the debounce **and** past the requests the new keys issue — two flushes, because
         * the timer only sets the term: React then re-renders, the new keys subscribe, and the
         * fetches they start resolve a microtask later.
         */
        settle: async () => {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(400)
            })
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0)
            })
        },
    }
}

/** The `q` of every global-search call so far. */
const terms = () => searchChannels.mock.calls.map(([args]) => args.q)

beforeEach(() => {
    vi.useFakeTimers()
    auth.state = { activeId: 'acc-1', isAuthenticated: true }
    remember.mockReset()
    searchChannels.mockReset().mockResolvedValue(page(2))
    getFollowedChannels.mockReset().mockResolvedValue(rows(1))
})

afterEach(() => {
    vi.useRealTimers()
})

describe('the term', () => {
    /** Nothing typed is not a search. Legacy fires one anyway on mount. */
    it('asks for nothing while the field is empty', async () => {
        const h = mount()
        await h.flush()
        expect(searchChannels).not.toHaveBeenCalled()
        expect(getFollowedChannels).not.toHaveBeenCalled()
        expect(h.read().isIdle).toBe(true)
    })

    it('sends one request for a typed word, not one per keystroke', async () => {
        const h = mount()
        for (const value of ['a', 'ad', 'ada']) h.type(value)
        // Mid-word: the field has moved three times and nothing has been asked for.
        expect(searchChannels).not.toHaveBeenCalled()

        await h.settle()
        expect(terms()).toEqual(['ada'])
        expect(getFollowedChannels).toHaveBeenCalledTimes(1)
    })

    it('trims the term before it reaches the request', async () => {
        const h = mount()
        h.type('  ada  ')
        await h.settle()
        expect(terms()).toEqual(['ada'])
    })

    /**
     * Clearing is the one path with no debounce: there is no request to save, and stale rows
     * after pressing cancel read as the button not working.
     */
    it('applies a cleared field at once, with no new request', async () => {
        const h = mount()
        h.type('ada')
        await h.settle()
        expect(h.read().results).toHaveLength(2)

        h.type('')
        // Synchronously idle — before any timer has been advanced.
        expect(h.read().isIdle).toBe(true)
        await h.flush()
        expect(terms()).toEqual(['ada'])
    })

    /** Backspacing to a prefix already typed is a cache hit, because the term is in the key. */
    it('costs no request when the reader returns to a term already searched', async () => {
        const h = mount()
        h.type('ada')
        await h.settle()
        h.type('grace')
        await h.settle()
        expect(terms()).toEqual(['ada', 'grace'])

        h.type('ada')
        await h.settle()
        expect(terms()).toEqual(['ada', 'grace'])
    })
})

describe('submit and commit', () => {
    /** A recent row hands over a finished term; there is nothing to throttle. */
    it('submit searches at once, skipping the debounce, and records the term', async () => {
        const h = mount()
        h.press(() => h.read().submit('ada'))
        await h.flush()
        expect(terms()).toEqual(['ada'])
        expect(remember).toHaveBeenCalledWith('ada')
        expect(h.read().search).toBe('ada')
    })

    /**
     * Enter is a commit of what the reader **typed**, so it reads the field rather than the
     * settled term — on a fast typist the debounce has not fired and `q` is still a prefix.
     */
    it('commit settles the field’s own value even mid-debounce', async () => {
        const h = mount()
        h.type('ada')
        expect(searchChannels).not.toHaveBeenCalled()

        h.press(() => h.read().commit())
        await h.flush()
        expect(terms()).toEqual(['ada'])
        expect(remember).toHaveBeenCalledWith('ada')
    })

    /**
     * **Every settle is recorded** — a reader who types a name, reads the results and leaves has
     * searched, and the list should say so. This used to assert the opposite, on the grounds that
     * recording from the debounce is what makes legacy write every prefix of a slowly-typed word.
     * The defect was real and the place to fix it was not here: `addSearchRecent` collapses a term
     * that extends the entry at the top, so the chain below reaches storage as `['ada']` however
     * many times this fires. Its own tests pin that half.
     */
    it('records every settled term, prefixes included — storage collapses them', async () => {
        const h = mount()
        h.type('a')
        await h.settle()
        h.type('ad')
        await h.settle()
        h.type('ada')
        await h.settle()
        expect(terms()).toEqual(['a', 'ad', 'ada'])
        expect(remember.mock.calls).toEqual([['a'], ['ad'], ['ada']])
    })

    /** One settle, one write: the effect keys on the settled term, not on the render. */
    it('records a settled term once, however many times it re-renders', async () => {
        const h = mount()
        h.type('ada')
        await h.settle()
        h.press(() => h.read().setSearch('ada'))
        await h.flush()
        expect(remember).toHaveBeenCalledExactlyOnceWith('ada')
    })

    it('records nothing for an empty or whitespace field', async () => {
        const h = mount()
        h.type('   ')
        h.press(() => h.read().commit())
        await h.flush()
        expect(remember).not.toHaveBeenCalled()
        expect(searchChannels).not.toHaveBeenCalled()
    })

    /**
     * Opening a result records the term that **found** it, not whatever is in the field by then.
     *
     * The distinction only shows up on a fast typist: search "ada", read the results, start typing
     * "adam", press a row before the debounce fires. `commit` would record "adam" — a term whose
     * results nobody has seen — where `record` records "ada", which is the search that worked.
     */
    it('record remembers the settled term, not the field', async () => {
        const h = mount()
        h.type('ada')
        await h.settle()
        // The settle above already recorded "ada"; what is under test is what the *press* records.
        remember.mockClear()

        h.type('adam')
        h.press(() => h.read().record())
        await h.flush()
        expect(remember).toHaveBeenCalledExactlyOnceWith('ada')
    })

    /**
     * And it issues no request. `commit` here would search "adam" as the reader navigates away —
     * a response nobody is left on the page to read.
     */
    it('record settles nothing, so pressing a row costs no request', async () => {
        const h = mount()
        h.type('ada')
        await h.settle()
        expect(terms()).toEqual(['ada'])

        h.type('adam')
        h.press(() => h.read().record())
        await h.flush()
        expect(terms()).toEqual(['ada'])
    })

    it('record is inert before anything has been searched', async () => {
        const h = mount()
        h.type('ada')
        h.press(() => h.read().record())
        await h.flush()
        expect(remember).not.toHaveBeenCalled()
    })
})

describe('the Following grid', () => {
    it('is not fetched for an anonymous visitor, and does not hold the loading state', async () => {
        auth.state = { activeId: 'anon-1', isAuthenticated: false }
        const h = mount()
        h.type('ada')
        await h.settle()

        expect(getFollowedChannels).not.toHaveBeenCalled()
        expect(h.read().following).toEqual([])
        expect(h.read().isLoading).toBe(false)
        expect(h.read().results).toHaveLength(2)
    })

    /**
     * A followed-channels failure is not this screen's error state. The reader asked for search
     * results; they are there, and the grid is a shortcut they never saw.
     */
    it('fails silently, leaving the global results alone', async () => {
        getFollowedChannels.mockRejectedValue(new Error('502'))
        const h = mount()
        h.type('ada')
        await h.settle()

        expect(h.read().isError).toBe(false)
        expect(h.read().following).toEqual([])
        expect(h.read().results).toHaveLength(2)
    })
})

describe('pages', () => {
    /**
     * Offset pagination over a set the server may re-rank between requests returns the same space
     * on two pages. The row's React key is its slug, so a duplicate is a key warning in
     * development and two identical rows in production — in a list whose whole job is to be
     * scanned.
     */
    it('drops a row that arrives on two pages, keeping the first position', async () => {
        const first = {
            results: rows(SEARCH_PAGE_SIZE),
            count: 40,
            next: null,
        } as SearchChannelsPage
        const second = {
            // `space-19` is the last row of page one, returned again at the top of page two.
            results: [first.results[SEARCH_PAGE_SIZE - 1], ...rows(3, SEARCH_PAGE_SIZE)],
            count: 40,
            next: null,
        } as SearchChannelsPage
        searchChannels.mockReset().mockResolvedValueOnce(first).mockResolvedValue(second)

        const h = mount()
        h.type('ada')
        await h.settle()
        expect(h.read().results).toHaveLength(SEARCH_PAGE_SIZE)

        h.press(() => h.read().loadMore())
        await h.flush()

        const slugs = h.read().results.map(row => row.slug)
        expect(new Set(slugs).size).toBe(slugs.length)
        // Page one's ordering survives: the duplicate keeps its original position, not page two's.
        expect(slugs.indexOf('space-19')).toBe(SEARCH_PAGE_SIZE - 1)
    })
})

describe('the states the screen branches on', () => {
    it('reports empty only when both lists came back with nothing', async () => {
        searchChannels.mockResolvedValue(page(0))
        getFollowedChannels.mockResolvedValue([])
        const h = mount()
        h.type('zzz')
        await h.settle()
        expect(h.read().isEmpty).toBe(true)
    })

    /** A grid with a match is not an empty screen, even with no global results at all. */
    it('is not empty when only the Following grid matched', async () => {
        searchChannels.mockResolvedValue(page(0))
        const h = mount()
        h.type('ada')
        await h.settle()
        expect(h.read().isEmpty).toBe(false)
        expect(h.read().following).toHaveLength(1)
    })

    it('is never empty, loading or error while nothing is typed', async () => {
        const h = mount()
        await h.flush()
        const api = h.read()
        expect([api.isEmpty, api.isLoading, api.isError]).toEqual([false, false, false])
    })

    it('surfaces a global-search failure', async () => {
        searchChannels.mockRejectedValue(new Error('502'))
        const h = mount()
        h.type('ada')
        await h.settle()
        expect(h.read().isError).toBe(true)
        expect(h.read().isEmpty).toBe(false)
    })

    /**
     * The account is in both query keys, so a switch refetches rather than showing the previous
     * account's answer — the payloads are personalised (the grid obviously, the results
     * potentially: the backend is free to rank or filter per account).
     */
    it('re-asks under the new account after a switch', async () => {
        const h = mount()
        h.type('ada')
        await h.settle()
        expect(searchChannels.mock.calls.map(([a]) => a.accountId)).toEqual(['acc-1'])

        auth.state = { activeId: 'acc-2', isAuthenticated: true }
        h.type('ada ')
        await h.settle()
        expect(searchChannels.mock.calls.map(([a]) => a.accountId)).toEqual(['acc-1', 'acc-2'])
    })
})

describe('hideNsfw', () => {
    const sensitive = (slug: string) => ({ slug, is_nsfw: true }) as SearchChannel

    it('drops sensitive spaces from both lists', async () => {
        searchChannels.mockResolvedValue({
            results: [...rows(1), sensitive('nsfw-global')],
            count: 2,
            next: null,
        })
        getFollowedChannels.mockResolvedValue([sensitive('nsfw-followed'), ...rows(1, 5)])
        const view = mount({ hideNsfw: true })
        view.type('ada')
        await view.settle()
        expect(view.read().results.map(row => row.slug)).toEqual(['space-0'])
        expect(view.read().following.map(row => row.slug)).toEqual(['space-5'])
    })

    /** Filtered in the hook, not the view, precisely so this reaches the no-results state. */
    it('reports empty when every match was sensitive', async () => {
        searchChannels.mockResolvedValue({ results: [sensitive('a')], count: 1, next: null })
        getFollowedChannels.mockResolvedValue([sensitive('b')])
        const view = mount({ hideNsfw: true })
        view.type('ada')
        await view.settle()
        expect(view.read().isEmpty).toBe(true)
    })

    it('keeps sensitive spaces when the account opted in', async () => {
        searchChannels.mockResolvedValue({ results: [sensitive('a')], count: 1, next: null })
        getFollowedChannels.mockResolvedValue([])
        const view = mount()
        view.type('ada')
        await view.settle()
        expect(view.read().results).toHaveLength(1)
    })
})

describe('followingPageSize', () => {
    it('is what the followed-channels request asks for', async () => {
        searchChannels.mockResolvedValue(page(0))
        getFollowedChannels.mockResolvedValue([])
        const view = mount({ followingPageSize: 10 })
        view.type('ada')
        await view.settle()
        expect(getFollowedChannels).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 10 }))
    })
})
