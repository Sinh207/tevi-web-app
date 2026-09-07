// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlockedAccountsPage } from '../lib/blocked-accounts-page'
import { useBlockedAccounts } from './use-blocked-accounts'

/**
 * The search, which is the part of this hook a comment cannot pin.
 *
 * Three of the four things asserted here are *timing*, and each has a failure mode that looks
 * like nothing at all in a browser: a term that reaches the request per keystroke (five
 * requests and five cache entries for one word), a cleared field that waits 400ms before
 * showing the list it already has, and an empty result that claims the reader has blocked
 * nobody when what really happened is that their term matched nothing.
 *
 * The exit choreography and the unblock are not re-tested here — they are covered by
 * `blocked-accounts-page.test.ts` and unchanged by the search.
 */

const getBlockedAccounts = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ state: { activeId: 'acc-1', isAuthenticated: true } }))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))
vi.mock('../api/channel-api', async () => {
    const actual = await vi.importActual<typeof import('../api/channel-api')>('../api/channel-api')
    return { ...actual, channelApi: { ...actual.channelApi, getBlockedAccounts } }
})

/** One row is enough — nothing here reads what is in it. */
function page(count: number): BlockedAccountsPage {
    return {
        results: Array.from({ length: count }, (_, index) => ({
            id: `block-${index}`,
            created_at: null,
            user: { id: `user-${index}`, slug: `user-${index}`, avatar: {} },
        })) as BlockedAccountsPage['results'],
        count,
        next: null,
    }
}

function mount() {
    /*
     * `staleTime` mirrors the app's own client (`shared/lib/api/query-client.ts`), and the
     * "clearing costs no request" assertion below depends on it: at the library default of 0
     * every return to a cached key refetches, which is not what a reader of this screen gets.
     */
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    })
    let api!: ReturnType<typeof useBlockedAccounts>
    function Probe() {
        api = useBlockedAccounts()
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
        /**
         * Let pending promises resolve and React re-render.
         *
         * `waitFor` is not usable here: it polls on timers this file has faked, so it would
         * spin until the test times out. Every request in this file resolves immediately, so
         * advancing by zero is enough to flush the microtask queue.
         */
        flush: async () => {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0)
            })
        },
        /**
         * Past the debounce **and** past the request the new key issues — two flushes, because
         * the timer only sets the term: React then re-renders, the new key subscribes, and the
         * fetch it starts resolves a microtask later.
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

/** The `q` of every call so far. */
const terms = () => getBlockedAccounts.mock.calls.map(([args]) => args.q)

beforeEach(() => {
    vi.useFakeTimers()
    auth.state = { activeId: 'acc-1', isAuthenticated: true }
    getBlockedAccounts.mockReset().mockResolvedValue(page(2))
})

afterEach(() => {
    vi.useRealTimers()
})

describe('useBlockedAccounts search', () => {
    it('sends one request for a typed word, not one per keystroke', async () => {
        const h = mount()
        await h.flush()
        expect(terms()).toEqual([''])

        for (const value of ['a', 'ad', 'ada']) h.type(value)
        // Mid-word: the field has moved three times and nothing has been asked for.
        expect(getBlockedAccounts).toHaveBeenCalledTimes(1)

        await h.settle()
        expect(terms()).toEqual(['', 'ada'])
    })

    it('trims the term before it reaches the request', async () => {
        const h = mount()
        await h.flush()
        h.type('  ada  ')
        await h.settle()
        expect(terms()).toEqual(['', 'ada'])
    })

    /**
     * Clearing is the one path with no debounce: the unfiltered list is already in the cache
     * under its own key, so there is no request to save — and 400ms of stale filtered rows
     * after pressing cancel reads as the button not working.
     */
    it('applies a cleared field at once, from cache, without a new request', async () => {
        const h = mount()
        await h.flush()
        h.type('ada')
        await h.settle()
        expect(getBlockedAccounts).toHaveBeenCalledTimes(2)

        h.type('')
        // No timer advanced: the unfiltered list is back on screen in the same tick.
        expect(h.read().search).toBe('')
        expect(h.read().entries).toHaveLength(2)
        expect(getBlockedAccounts).toHaveBeenCalledTimes(2)
    })

    it('tells a term that matched nothing apart from an empty list', async () => {
        getBlockedAccounts.mockResolvedValue(page(0))
        const h = mount()
        await h.flush()
        expect(h.read().isEmpty).toBe(true)
        expect(h.read().isSearchEmpty).toBe(false)
        // Nothing blocked at all: a field here would be a control with nothing to filter.
        expect(h.read().canSearch).toBe(false)

        getBlockedAccounts.mockResolvedValue(page(1))
        h.type('ada')
        await h.settle()
        expect(h.read().entries).toHaveLength(1)

        getBlockedAccounts.mockResolvedValue(page(0))
        h.type('zzz')
        await h.settle()
        expect(h.read().isSearchEmpty).toBe(true)
        expect(h.read().isEmpty).toBe(false)
        // The field has to survive its own empty result — clearing it is the way out.
        expect(h.read().canSearch).toBe(true)
    })
})
