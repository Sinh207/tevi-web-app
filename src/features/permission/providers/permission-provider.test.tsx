// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { permissionKeys } from '../api/permission-api'
import { normalizeChannelPermission } from '../api/types'
import { PermissionProvider, usePermission } from './permission-provider'

/**
 * What this provider promises that no call site can show:
 *
 * - **the request is pinned to the account it is filed under.** Legacy holds one global state, so a
 *   switch mid-flight files account A's grants under account B — which here is a payout console
 *   offered to an account that has no payout grant;
 * - **an anonymous session costs nothing.** It is mounted above every route, so a query for a guest
 *   would be a wasted round trip on the commonest kind of visit, repeated per navigation;
 * - **`isKnown` separates "no grants" from "no answer".** An all-false payload is a legitimate answer
 *   (an ordinary creator's `{}`), so it cannot itself carry that distinction;
 * - **`can` fails closed and `state` does not.** A list gets a boolean; a screen gets four states, so
 *   a 502 is a retry rather than a permanent "Access denied" — the bug in `containers/starTransfer`;
 * - **`isBootstrapping` reads as loading.** A disabled query is not `isLoading` in TanStack, and
 *   without folding it in a signed-in reader opening a gated screen cold sees a denial for a frame.
 */

const getChannelPermission = vi.hoisted(() => vi.fn())
/** Records the order the two steps happen in — which is the claim, not that both happened. */
const calls = vi.hoisted(() => [] as string[])
const forgetChannelPermissionCache = vi.hoisted(() =>
    vi.fn(async (accountId: string | null) => {
        calls.push(`forget:${accountId}`)
    }),
)

vi.mock('../api/permission-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/permission-api')>('../api/permission-api')
    return {
        ...actual,
        forgetChannelPermissionCache,
        permissionApi: { ...actual.permissionApi, getChannelPermission },
    }
})

const authState = {
    activeId: null as string | null,
    isAuthenticated: false,
    isBootstrapping: false,
}

vi.mock('@features/auth', () => ({ useAuth: () => authState }))

/**
 * The realtime room is stubbed so this stays a unit test — otherwise `useSocketEvent` reaches for the
 * real singleton and pulls `socket.io-client` into every run. The handler is captured, which is what
 * lets the `premium_info` test below fire it.
 */
const socketHandlers = new Map<string, (payload: unknown) => void>()
vi.mock('@features/realtime', () => ({
    useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
        socketHandlers.set(event, handler)
    },
}))

const AGENCY = normalizeChannelPermission({
    transfer_star: { allowed: true },
    fiat_agency: { is_active: true, name: 'Tevi VN', payout_method: [{ id: 3, name: 'Bank' }] },
})
const CREATOR = normalizeChannelPermission({})

function renderPermission() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api: ReturnType<typeof usePermission> | null = null
    function Probe() {
        api = usePermission()
        return null
    }
    /*
     * Built fresh on each call, **not** hoisted: React bails out of a re-render when handed a
     * referentially identical element, so reusing one makes `rerender()` a no-op and the account-switch
     * test silently passes against the old account's grants.
     */
    const tree = () => (
        <QueryClientProvider client={queryClient}>
            <PermissionProvider>
                <Probe />
            </PermissionProvider>
        </QueryClientProvider>
    )
    const view = render(tree())
    return {
        queryClient,
        read: () => api as ReturnType<typeof usePermission>,
        rerender: () => view.rerender(tree()),
    }
}

beforeEach(() => {
    socketHandlers.clear()
    getChannelPermission.mockReset()
    getChannelPermission.mockResolvedValue(AGENCY)
    authState.activeId = null
    authState.isAuthenticated = false
    authState.isBootstrapping = false
})

describe('PermissionProvider', () => {
    it('reports loading while the session bootstraps, and asks for nothing', () => {
        authState.isBootstrapping = true

        const { read } = renderPermission()
        expect(read().isLoading).toBe(true)
        expect(read().isKnown).toBe(false)
        // Not `denied`: a gated screen must show a skeleton here, not an access-denied panel.
        expect(read().state('payout-agency')).toBe('loading')
        expect(getChannelPermission).not.toHaveBeenCalled()
    })

    it('asks for nothing for an anonymous or signed-out session, and denies', () => {
        const { read } = renderPermission()
        expect(read().isLoading).toBe(false)
        expect(read().isKnown).toBe(false)
        expect(read().can('star-transfer')).toBe(false)
        // Denied rather than errored: what a guest is missing is a session, and a retry cannot help.
        expect(read().state('star-transfer')).toBe('denied')
        expect(getChannelPermission).not.toHaveBeenCalled()
    })

    it('fetches for a real account and reports the grants', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true

        const { read } = renderPermission()
        await waitFor(() => expect(read().isKnown).toBe(true))
        expect(read().can('star-transfer')).toBe(true)
        expect(read().can('payout-agency')).toBe(true)
        expect(read().state('payout-agency')).toBe('allowed')
        expect(read().fiatAgency.name).toBe('Tevi VN')
        expect(read().fiatAgency.payoutMethods).toHaveLength(1)
        expect(getChannelPermission).toHaveBeenCalledWith(
            expect.objectContaining({ accountId: '1' }),
        )
    })

    /*
     * The one that matters most. Legacy's provider holds a single state and overwrites it with whatever
     * lands, so a switch mid-flight shows account A's grants under account B — an agency console offered
     * to an account with no agency grant.
     */
    it('files each account answer under its own key', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true
        getChannelPermission.mockImplementation(({ accountId }: { accountId: string }) =>
            Promise.resolve(accountId === '1' ? AGENCY : CREATOR),
        )

        const { read, rerender, queryClient } = renderPermission()
        await waitFor(() => expect(read().can('payout-agency')).toBe(true))

        authState.activeId = '2'
        await act(async () => {
            rerender()
        })
        await waitFor(() => expect(read().can('payout-agency')).toBe(false))

        expect(queryClient.getQueryData(permissionKeys.channel('1'))).toEqual(AGENCY)
        expect(queryClient.getQueryData(permissionKeys.channel('2'))).toEqual(CREATOR)
    })

    /*
     * An ordinary creator. A successful answer with no grants — which must read as a denial, and must be
     * distinguishable from the failure below.
     */
    it('denies, and knows it denies, for an account with no grants', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true
        getChannelPermission.mockResolvedValue(CREATOR)

        const { read } = renderPermission()
        await waitFor(() => expect(read().isKnown).toBe(true))
        expect(read().can('payout-agency')).toBe(false)
        expect(read().state('payout-agency')).toBe('denied')
    })

    /*
     * The failure, which produces the same all-false grants as the case above and must **not** produce
     * the same answer. Legacy conflates the two, and `/star-transfer` shows an agency Access denied
     * after one 502, with no retry.
     */
    it('reports an error state on failure rather than a denial', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true
        getChannelPermission.mockRejectedValue(new Error('gateway'))

        const { read } = renderPermission()
        await waitFor(() => expect(read().isError).toBe(true))
        expect(read().isKnown).toBe(false)
        expect(read().permission).toBeNull()
        // A list hides the row — fail closed…
        expect(read().can('payout-agency')).toBe(false)
        // …and a screen offers a retry instead of accusing the reader of having no access.
        expect(read().state('payout-agency')).toBe('error')
    })

    /*
     * The counterpart of the test above, and the one a call site cannot show: once an answer has arrived,
     * a *failed refetch* must not take the feature away. A screen the reader is already using collapsing
     * into a retry panel because a background revalidation blipped is the same class of bug as legacy's
     * permanent denial, arriving from the other direction.
     */
    it('keeps the grants it holds when a refetch fails', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true

        const { read } = renderPermission()
        await waitFor(() => expect(read().can('payout-agency')).toBe(true))

        getChannelPermission.mockRejectedValue(new Error('gateway'))
        await act(async () => {
            await read().refresh()
        })

        await waitFor(() => expect(read().isError).toBe(true))
        expect(read().isKnown).toBe(true)
        expect(read().can('payout-agency')).toBe(true)
        expect(read().state('payout-agency')).toBe('allowed')
    })

    /*
     * The row of the `isLoading` table (see the provider) that no other test covers: a retry after a
     * failure is a **loading** state, not a lingering error one. Otherwise the retry panel stays up over
     * a request that is already in flight and its button reads as a no-op.
     */
    it('reports loading again while retrying a failed request', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true
        getChannelPermission.mockRejectedValue(new Error('gateway'))

        const { read } = renderPermission()
        await waitFor(() => expect(read().state('payout-agency')).toBe('error'))

        // A request that never settles, so the in-flight state can be observed.
        getChannelPermission.mockReturnValue(new Promise(() => {}))
        void read().refresh()

        await waitFor(() => expect(read().isLoading).toBe(true))
        expect(read().state('payout-agency')).toBe('loading')
    })

    it('reads a grant it has no capability for', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true
        getChannelPermission.mockResolvedValue(
            normalizeChannelPermission({ some_new_feature: { allowed: true } }),
        )

        const { read } = renderPermission()
        await waitFor(() => expect(read().isKnown).toBe(true))
        expect(read().grant('some_new_feature')).toBe(true)
        expect(read().grant('nope')).toBe(false)
    })

    /*
     * Premium is the one entitlement input that changes mid-session on the reader's own action: they buy
     * it and expect the app to stop telling them they cannot do a thing.
     */
    it('re-reads the grants when the Premium state changes', async () => {
        authState.activeId = '1'
        authState.isAuthenticated = true

        const { read } = renderPermission()
        await waitFor(() => expect(read().isKnown).toBe(true))
        expect(getChannelPermission).toHaveBeenCalledTimes(1)

        await act(async () => {
            socketHandlers.get('premium_info')?.({ is_premium: true })
        })
        await waitFor(() => expect(getChannelPermission).toHaveBeenCalledTimes(2))
    })

    /**
     * **The ETag is evicted before the refetch, not after and not never.**
     *
     * The handler used to be a bare `refresh()`, and that is a silent failure: the refetch carries an
     * `If-None-Match`, the service answers `304` because its validator has not moved, and `apiClient`
     * replays the grants this is trying to replace. The test above — "a second request went out" —
     * passes either way, which is exactly why this one exists. **B72.**
     *
     * Order matters as much as presence: `invalidateQueries` starts the request synchronously, so
     * evicting afterwards drops a record the request has already read.
     */
    it('evicts the cached grants before re-reading them', async () => {
        authState.activeId = '7'
        authState.isAuthenticated = true

        const { read } = renderPermission()
        await waitFor(() => expect(read().isKnown).toBe(true))
        calls.length = 0
        getChannelPermission.mockImplementation(async () => {
            calls.push('fetch')
            return {}
        })

        await act(async () => {
            socketHandlers.get('premium_info')?.({ is_premium: true })
        })
        await waitFor(() => expect(calls).toContain('fetch'))

        // The account is the one the frame arrived for, and the eviction is first.
        expect(forgetChannelPermissionCache).toHaveBeenCalledWith('7')
        expect(calls[0]).toBe('forget:7')
    })

    it('throws when used outside the provider', () => {
        function Bare() {
            usePermission()
            return null
        }
        // React logs the thrown error; the assertion is that it throws at all.
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        expect(() => render(<Bare />)).toThrow(/PermissionProvider/)
        spy.mockRestore()
    })
})
