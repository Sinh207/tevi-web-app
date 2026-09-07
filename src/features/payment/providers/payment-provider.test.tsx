// @vitest-environment jsdom
import { eventBus } from '@shared/lib/event-bus'
import type { Stripe } from '@stripe/stripe-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentKeys } from '../api/keys'
import type { SettleOutcome } from '../api/types'
import { setStripeLoader } from '../lib/stripe-loader'
import { PaymentProvider, type PaymentValue, usePayment } from './payment-provider'

/**
 * The one decision this provider makes that nothing else can: **what happens when a payment settles
 * and the dialog is gone.**
 *
 * The machine already refuses to re-open it (a `SETTLED` from `idle` is ignored, deliberately), so the
 * question left is what to do instead — and the answer has to be *something*, because the balance is
 * stale either way. Refresh the money, announce it on the bus, and say so in a toast rather than
 * throwing a modal over whatever the reader moved on to.
 */

const create = vi.hoisted(() => vi.fn())
const settle = vi.hoisted(() => vi.fn())
const settleGateway = vi.hoisted(() => vi.fn())
/** Spy, because *when* the card list is fetched is the assertion below. */
const listCards = vi.hoisted(() => vi.fn(async () => []))
const getStripeConfig = vi.hoisted(() => vi.fn(async () => ({ publishableKey: 'pk_test' })))
const toastSuccess = vi.hoisted(() => vi.fn())

vi.mock('../api/checkout-api', () => ({ checkoutApi: { create, settle, settleGateway } }))
vi.mock('../api/stripe-config-api', () => ({
    // Seeded into the cache by `renderProvider` with an infinite `staleTime`, so this is never
    // reached here — the same gate is tested honestly in `use-stripe-config.test.tsx`.
    stripeConfigApi: { get: getStripeConfig },
}))
vi.mock('@features/auth', () => ({
    useAuth: () => ({ activeId: '1', isAuthenticated: true, isBootstrapping: false }),
}))
/*
 * The barrel, narrowed to what this direction of the dependency is for: the keys the provider
 * invalidates, and the balance the purchase sheet prints on its first step.
 */
vi.mock('@features/balance', () => ({
    balanceKeys: { all: ['balance'] },
    useBalance: () => ({ star: 1240, isKnown: true }),
}))
/*
 * The sheet's own catalogues and the saved-card list. Mocked because this file is about the
 * *provider* — the machine, the settle, the toast-versus-dialog decision — and an unmocked model here
 * would put real axios requests behind every one of those assertions (the flake `auth-provider.test`
 * spent a session on). The sheet has its own tests.
 */
vi.mock('../api/payment-methods-api', () => ({
    MAX_SAVED_CARDS: 10,
    paymentMethodsApi: {
        list: listCards,
        createSetupIntent: async () => null,
        remove: async () => undefined,
        setDefault: async () => undefined,
    },
}))
vi.mock('../api/catalog-api', () => ({
    catalogApi: { getStarPackages: async () => [], getGateways: async () => [] },
}))
/*
 * The card form is stubbed out. This file drives the machine through `card` → `confirming` →
 * `settling`, and mounting the real dialog means mounting `<Elements>` — which validates its `stripe`
 * prop and rejects the stand-in this file injects, as an unhandled rejection that has nothing to do
 * with what is being asserted. What the dialog does with a press belongs to its own coverage.
 */
vi.mock('../components/card-checkout-dialog', () => ({ CardCheckoutDialog: () => null }))
/** Mutable, because one rule in this file is *which route the reader is standing on*. */
const nav = vi.hoisted(() => ({ pathname: '/live/ada' }))
vi.mock('next/navigation', () => ({
    usePathname: () => nav.pathname,
    useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }))
vi.mock('@shared/i18n/use-translation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('next/link', () => ({
    default: ({ children, ...props }: { children: React.ReactNode }) => (
        <a {...props}>{children}</a>
    ),
}))

const PENDING: SettleOutcome = { status: 'pending' }
const SETTLED: SettleOutcome = { status: 'settled', purchaseType: 'star' }

function renderProvider() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
    })
    queryClient.setQueryData(paymentKeys.stripeConfig(), { publishableKey: 'pk_test' })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    let api: PaymentValue | null = null
    function Probe() {
        api = usePayment()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <PaymentProvider>
                <Probe />
            </PaymentProvider>
        </QueryClientProvider>,
    )
    return {
        invalidate,
        get payment() {
            if (!api) throw new Error('probe never rendered')
            return api
        },
    }
}

async function payAndSettle(harness: ReturnType<typeof renderProvider>) {
    create.mockResolvedValue({ kind: 'card', clientSecret: 'pi_1_secret' })
    await act(async () => {
        harness.payment.checkout({ kind: 'stars', gatewayId: 'gw.stripe', quantity: 1000 })
    })
    await act(async () => {
        harness.payment.submit({ paymentMethodId: 'pm_1' })
    })
}

beforeEach(() => {
    vi.useFakeTimers()
    create.mockReset()
    settle.mockReset()
    listCards.mockClear()
    toastSuccess.mockReset()
    // The seam `lib/stripe-loader.ts` exists for: the real loader fetches a script from another
    // origin, and a saved card only ever reaches `confirmCardPayment`.
    setStripeLoader(
        async () =>
            ({
                confirmCardPayment: vi.fn(async () => ({ paymentIntent: {} })),
            }) as unknown as Stripe,
    )
})

afterEach(() => {
    vi.useRealTimers()
    setStripeLoader(null)
})

describe('PaymentProvider', () => {
    it('asks for the card list only when a card step is live', async () => {
        /*
         * This provider is mounted above every route — that is what lets a checkout outlive the
         * surface that started it — so anything it fetches unconditionally, it fetches on **every
         * page**. The card list had exactly that shape: one reader (`CardCheckoutDialog`, which
         * renders in `card`) and a query gated only on being signed in, so every page load of every
         * signed-in reader asked for their saved cards. A comment claimed the opposite, which is how it
         * survived review.
         */
        const harness = renderProvider()
        await act(async () => {})
        expect(listCards).not.toHaveBeenCalled()

        create.mockResolvedValue({ kind: 'card', clientSecret: 'pi_1_secret' })
        await act(async () => {
            harness.payment.checkout({ kind: 'stars', gatewayId: 'gw.stripe', quantity: 1000 })
        })
        // `creating` already asks, so the panel opens with the list in hand rather than a spinner.
        expect(listCards).toHaveBeenCalled()
    })

    it('shows the success dialog, refreshes the balance and announces it', async () => {
        settle.mockResolvedValue(SETTLED)
        const succeeded = vi.fn()
        eventBus.on('payment:succeeded', succeeded)
        const harness = renderProvider()

        await payAndSettle(harness)

        expect(harness.payment.state.kind).toBe('succeeded')
        expect(screen.getByText('payment_status_succeeded_title')).toBeTruthy()
        /*
         * `balanceKeys.all`, not the figure alone: Star was added, so the ledgers under it explain it
         * too — the agreement the three wallet features share.
         */
        expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: ['balance'] })
        expect(succeeded).toHaveBeenCalledWith({ purchaseType: 'star' })
        // The dialog is the announcement; a toast over it would be the same news twice.
        expect(toastSuccess).not.toHaveBeenCalled()

        eventBus.off('payment:succeeded', succeeded)
    })

    /**
     * *Get more* after a Star purchase opens the sheet — **unless the reader is already standing on
     * the page that sells Star**, where it only closes.
     *
     * Two tests rather than one, because each direction breaks on its own: a missing guard stacks a
     * 400px copy of `/get-star` on top of `/get-star`, and a guard that matched too widely takes the
     * offer away from every other screen in the app.
     */
    it('offers the sheet after a purchase made anywhere else', async () => {
        nav.pathname = '/live/ada'
        settle.mockResolvedValue(SETTLED)
        const harness = renderProvider()
        await payAndSettle(harness)

        act(() => {
            screen.getByText('payment_action_buy_more').click()
        })

        expect(harness.payment.state.kind).toBe('idle')
        expect(screen.getByText('payment_get_star_title')).toBeTruthy()
    })

    it('only closes on /get-star — the catalogue is already behind the dialog', async () => {
        nav.pathname = '/get-star'
        settle.mockResolvedValue(SETTLED)
        const harness = renderProvider()
        await payAndSettle(harness)

        // Still offered: an absent handler would mean "no Star to be had here", which is the opposite.
        const buyMore = screen.getByText('payment_action_buy_more')
        act(() => {
            buyMore.click()
        })

        expect(harness.payment.state.kind).toBe('idle')
        expect(screen.queryByText('payment_status_succeeded_title')).toBeNull()
        expect(screen.queryByText('payment_get_star_title')).toBeNull()

        nav.pathname = '/live/ada'
    })

    it('toasts instead of re-opening the dialog the reader had closed', async () => {
        settle.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(SETTLED)
        const harness = renderProvider()

        await payAndSettle(harness)
        expect(harness.payment.state.kind).toBe('settling')

        act(() => {
            harness.payment.close()
        })
        harness.invalidate.mockClear()

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000)
        })

        // No dialog came back — the machine ignores a `SETTLED` from `idle`, and nothing here works
        // around that.
        expect(harness.payment.state.kind).toBe('idle')
        expect(screen.queryByText('payment_status_succeeded_title')).toBeNull()
        // But the money is still refreshed, and the reader is told.
        expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: ['balance'] })
        expect(toastSuccess).toHaveBeenCalledWith('payment_settled_toast')
    })
})
