// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JoinOffer } from '../../lib/join-offer'
import { useJoinMembership } from './use-join-membership'

/**
 * What this hook promises, none of which is visible from its call site: the two guards block at
 * their own step, the write lands on the account that was active when it was pressed, a `200` that
 * asks for a card is reported as *not* a purchase — it is handed to the checkout — and the three things
 * the purchase moves are all invalidated.
 *
 * The card case is the reason this is a hook test rather than a lib test. "The backend answered success
 * and we must not say success" is a statement about ordering and about what reaches the screen, and a
 * comment cannot pin either.
 */

const subscribe = vi.hoisted(() => vi.fn())
const refreshBalance = vi.hoisted(() => vi.fn())
const authed = vi.hoisted(() => ({ value: true }))
const affordable = vi.hoisted(() => ({ value: true }))
const activeId = vi.hoisted(() => ({ value: 'acct-1' }))

/* Only `subscribe` is replaced; the keys and the rest of the model are the real ones. */
vi.mock('../../api/subscription-api', async () => {
    const actual = await vi.importActual<typeof import('../../api/subscription-api')>(
        '../../api/subscription-api',
    )
    return { ...actual, membershipApi: { ...actual.membershipApi, subscribe } }
})

/**
 * The checkout, stubbed. `hasProvider` is what a `/app/*` webview looks like from in here: no provider
 * above the dialog, so a card tier is a dead end and the reader has to be told rather than left
 * looking at a dialog that did nothing.
 */
const checkout = vi.hoisted(() => vi.fn())
const hasProvider = vi.hoisted(() => ({ value: true }))

vi.mock('@features/payment', () => ({
    usePaymentOptional: () => (hasProvider.value ? { checkout } : null),
}))

vi.mock('@features/auth', () => ({
    useAuth: () => ({ activeId: activeId.value }),
    useRequireAuth:
        () =>
        (cb: (...a: unknown[]) => void) =>
        (...a: unknown[]) => {
            if (authed.value) cb(...a)
        },
}))

vi.mock('@features/balance', () => ({
    balanceKeys: { all: ['balance'] },
    useBalance: () => ({ refresh: refreshBalance }),
    useRequireStars:
        () =>
        (_cost: number, cb: (...a: unknown[]) => void) =>
        (...a: unknown[]) => {
            if (affordable.value) cb(...a)
        },
}))

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

const OFFER: JoinOffer = {
    packageId: 'pkg_1',
    name: 'Gold',
    description: null,
    priceId: 'price_tvs',
    stars: 500,
    usd: 5,
    cashPriceId: 'price_usd',
}

function renderFlow(offer: JoinOffer | null = OFFER) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let api!: ReturnType<typeof useJoinMembership>
    function Probe() {
        api = useJoinMembership({ slug: 'ada', channelId: 'ch_1', offer })
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { read: () => api, run: (fn: (a: typeof api) => void) => act(() => fn(api)), invalidate }
}

beforeEach(() => {
    hasProvider.value = true
    vi.clearAllMocks()
    authed.value = true
    affordable.value = true
    activeId.value = 'acct-1'
    subscribe.mockResolvedValue(undefined)
})

describe('opening', () => {
    it('does not reach the form when signed out — the login dialog comes first', () => {
        authed.value = false
        const flow = renderFlow()

        flow.run(f => f.open())

        expect(flow.read().step).toBe('closed')
    })

    it('opens for a signed-in reader', () => {
        const flow = renderFlow()
        flow.run(f => f.open())
        expect(flow.read().step).toBe('details')
    })
})

describe('the write', () => {
    it('sends the tier and the Star price line, on the account that was active', async () => {
        const flow = renderFlow()
        flow.run(f => f.open())
        flow.run(f => f.review())

        flow.run(f => f.confirm())

        await waitFor(() => expect(subscribe).toHaveBeenCalled())
        expect(subscribe).toHaveBeenCalledWith({
            slug: 'ada',
            packageId: 'pkg_1',
            priceId: 'price_tvs',
            accountId: 'acct-1',
        })
    })

    it('lands on the thank-you and moves the three things a purchase moves', async () => {
        const flow = renderFlow()
        flow.run(f => f.open())
        flow.run(f => f.confirm())

        await waitFor(() => expect(flow.read().step).toBe('success'))
        expect(refreshBalance).toHaveBeenCalled()
        // The membership list, this space's button state, and the balance — but **not** the
        // space's tiers, which a purchase cannot change (`mine`, not `all`).
        expect(flow.invalidate).toHaveBeenCalledWith({ queryKey: ['my-membership', 'mine'] })
        expect(flow.invalidate).toHaveBeenCalledWith({ queryKey: ['balance'] })
    })

    it('does not spend when the balance is short, and leaves the screen standing', () => {
        affordable.value = false
        const flow = renderFlow()
        flow.run(f => f.open())
        flow.run(f => f.review())

        flow.run(f => f.confirm())

        expect(subscribe).not.toHaveBeenCalled()
        expect(flow.read().step).toBe('confirm')
    })

    it('hands a card tier to the checkout, and reports no purchase', async () => {
        /*
         * `subscribe/` answers 200 with a `{ action, action_data }` envelope for a USD price. Nothing
         * has been bought at that point, so there is no success screen and no invalidation — saying
         * "you are a member" over an unpaid intent is the outcome this guards.
         */
        const action = { kind: 'card', clientSecret: 'pi_1_secret' }
        /* `subscribe` answers the action **and** what the gateway will take — see `SubscribeResult`. */
        subscribe.mockResolvedValue({ action, charge: { amount: 5.63, currency: 'USD' } })
        const flow = renderFlow()
        flow.run(f => f.open())
        flow.run(f => f.review())

        flow.run(f => f.confirm())

        await waitFor(() =>
            expect(checkout).toHaveBeenCalledWith({
                kind: 'handoff',
                source: 'membership',
                action,
                // The Pay button names the **total**, fee included — what the card is charged.
                // (0.059 × 5 + 0.30) / 0.941 = 0.63, so $5.63.
                amountLabel: '$5.63',
            }),
        )
        expect(flow.read().step).toBe('closed')
        expect(flow.read().needsCard).toBe(false)
        expect(refreshBalance).not.toHaveBeenCalled()
    })

    it('with no provider above it, says the tier needs a card instead of doing nothing', async () => {
        hasProvider.value = false
        subscribe.mockResolvedValue({
            action: { kind: 'card', clientSecret: 'pi_1_secret' },
            charge: null,
        })
        const flow = renderFlow()
        flow.run(f => f.open())
        flow.run(f => f.review())

        flow.run(f => f.confirm())

        await waitFor(() => expect(flow.read().needsCard).toBe(true))
        expect(checkout).not.toHaveBeenCalled()
        expect(flow.read().step).toBe('confirm')
        expect(refreshBalance).not.toHaveBeenCalled()
    })

    it('stays put on an ordinary failure', async () => {
        subscribe.mockRejectedValue(new Error('boom'))
        const flow = renderFlow()
        flow.run(f => f.open())
        flow.run(f => f.review())

        flow.run(f => f.confirm())

        await waitFor(() => expect(subscribe).toHaveBeenCalled())
        expect(flow.read().step).toBe('confirm')
        expect(flow.read().needsCard).toBe(false)
    })

    it('has nothing to press without an offer', () => {
        const flow = renderFlow(null)
        expect(flow.read().canJoin).toBe(false)
        flow.run(f => f.confirm())
        expect(subscribe).not.toHaveBeenCalled()
    })
})

describe('paying by card', () => {
    it('sends the **cash** price line, not the Star one', async () => {
        const flow = renderFlow()
        flow.run(f => f.open())
        flow.run(f => f.changeCurrency('cash'))

        flow.run(f => f.confirm())

        await waitFor(() => expect(subscribe).toHaveBeenCalled())
        expect(subscribe).toHaveBeenCalledWith(
            expect.objectContaining({ priceId: 'price_usd', packageId: 'pkg_1' }),
        )
    })

    it('does not spend Star for a card press', async () => {
        // The Star guard must not fire here: weighing a dollar figure against a Star balance would
        // refuse a card payment for being short of Star.
        affordable.value = false
        const flow = renderFlow()
        flow.run(f => f.open())
        flow.run(f => f.changeCurrency('cash'))

        flow.run(f => f.confirm())

        await waitFor(() => expect(subscribe).toHaveBeenCalled())
        expect(subscribe.mock.calls[0][0].priceId).toBe('price_usd')
    })

    it('refuses the press when the tier has no cash line', async () => {
        const flow = renderFlow({ ...OFFER, usd: null, cashPriceId: null })
        flow.run(f => f.open())
        flow.run(f => f.changeCurrency('cash'))

        flow.run(f => f.confirm())

        expect(subscribe).not.toHaveBeenCalled()
    })
})
