// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PremiumPackage } from '../api/types'
import { useSubscribePremium } from './use-subscribe-premium'

/**
 * What no comment can pin about pressing Subscribe: **who is allowed to**, **what is sent**, and
 * **when the confirmation gets out of the way**.
 *
 * All three are sequences rather than values, and two of them are now pressed from *two* places —
 * a plan card and the benefit dialog's footer — through one flow. So "a second press while a
 * checkout is live does nothing" and "the dialog steps aside exactly when another one takes over"
 * are claims about state over time, which is the case the repo's `Probe` idiom exists for.
 */

const payment = vi.hoisted(() => ({
    checkout: vi.fn(),
    isBusy: false,
    state: { kind: 'idle' } as { kind: string },
}))
vi.mock('@features/payment', async importOriginal => ({
    ...(await importOriginal<typeof import('@features/payment')>()),
    usePayment: () => payment,
}))

const session = vi.hoisted(() => ({ isAuthenticated: true, openLoginDialog: vi.fn() }))
/** The real wrapper's shape, so the test pins that `request` goes *through* the gate, not around. */
vi.mock('@features/auth', () => ({
    useRequireAuth:
        () =>
        <A extends unknown[]>(cb: (...args: A) => void) =>
        (...args: A) => {
            if (!session.isAuthenticated) {
                session.openLoginDialog()
                return
            }
            cb(...args)
        },
}))

const ANNUAL = {
    id: '3',
    product_id: 'price_year',
    price: 89.99,
    duration_days: 365,
} as PremiumPackage
const WEEKLY = {
    id: '1',
    product_id: 'price_week',
    price: 4.99,
    duration_days: 7,
} as PremiumPackage

function probe() {
    const seen: { current: ReturnType<typeof useSubscribePremium> | null } = { current: null }
    function Probe() {
        seen.current = useSubscribePremium()
        return null
    }
    const view = render(<Probe />)
    return { seen, rerender: () => view.rerender(<Probe />) }
}

beforeEach(() => {
    payment.checkout.mockReset()
    payment.isBusy = false
    payment.state = { kind: 'idle' }
    session.isAuthenticated = true
    session.openLoginDialog.mockReset()
})

describe('useSubscribePremium', () => {
    it('raises the confirmation rather than charging, and names the plan pressed', () => {
        const { seen } = probe()

        act(() => seen.current?.request(ANNUAL))

        expect(seen.current?.pending).toBe(ANNUAL)
        expect(seen.current?.pendingPlan).toBe('annual')
        // Nothing is sent until the second press. This is the step legacy interposes too, and the
        // reason it exists is that the purchase is non-refundable.
        expect(payment.checkout).not.toHaveBeenCalled()
    })

    it('sends the package’s price id, the card-only gateway, and no saved-card consent', () => {
        const { seen } = probe()

        act(() => seen.current?.request(ANNUAL))
        act(() => seen.current?.confirm())

        expect(payment.checkout).toHaveBeenCalledWith({
            kind: 'premium',
            gatewayId: 'gw.stripe',
            priceId: 'price_year',
            /*
             * `false`, as legacy sends it: a hosted Stripe Checkout stores the card itself under the
             * customer, so asking the backend to also save it would be a second consent taken on a
             * page that never showed a card field.
             */
            savePaymentInfo: false,
        })
    })

    /** A guest reading the price list gets the sign-in dialog and stays where they were. */
    it('gates the press on a real session', () => {
        session.isAuthenticated = false
        const { seen } = probe()

        act(() => seen.current?.request(ANNUAL))

        expect(session.openLoginDialog).toHaveBeenCalledTimes(1)
        expect(seen.current?.pending).toBeNull()
        expect(payment.checkout).not.toHaveBeenCalled()
    })

    /**
     * The guard the machine cannot make: `useCheckout.start` protects the *request*, this protects
     * the **dialog** — without it a second press while a charge is confirming re-opens it on the
     * package pressed second and confirms a charge for the first.
     */
    it('drops a second press while a checkout is live', () => {
        const { seen, rerender } = probe()

        act(() => seen.current?.request(ANNUAL))
        payment.isBusy = true
        rerender()

        act(() => seen.current?.request(WEEKLY))
        expect(seen.current?.pending).toBe(ANNUAL)

        // Cancel is refused for the same reason: the browser is already leaving for Stripe.
        act(() => seen.current?.cancel())
        expect(seen.current?.pending).toBe(ANNUAL)
    })

    it('confirms nothing when there is no pending package', () => {
        const { seen } = probe()
        act(() => seen.current?.confirm())
        expect(payment.checkout).not.toHaveBeenCalled()
    })

    /**
     * The hand-over. `card`/`confirming` belong to `CardCheckoutDialog` and the four after them to
     * `CheckoutStatusDialog`; two layers of chrome stacked on each other is the bug this closes.
     */
    it.each(['card', 'confirming', 'settling', 'slow', 'succeeded', 'failed'])(
        'steps aside once the machine reaches %s',
        kind => {
            const { seen, rerender } = probe()
            act(() => seen.current?.request(ANNUAL))
            expect(seen.current?.pending).toBe(ANNUAL)

            payment.state = { kind }
            act(() => rerender())

            expect(seen.current?.pending).toBeNull()
        },
    )

    /**
     * `leaving` is deliberately **not** in that list: no other dialog renders for it, so closing
     * would leave a blank screen while the browser navigates to Stripe. The confirmation keeps its
     * pending state until the page goes.
     */
    it('stays open while the browser is leaving for the gateway', () => {
        const { seen, rerender } = probe()
        act(() => seen.current?.request(ANNUAL))

        payment.state = { kind: 'leaving' }
        act(() => rerender())

        expect(seen.current?.pending).toBe(ANNUAL)
    })
})

/**
 * **The reader pressed Back at Stripe.** Reported from a real browser, and the reason
 * `useCheckout` now resets a `leaving` machine on a persisted `pageshow`: the back-forward cache
 * hands the page back whole, so this flow's `pending` and the machine's `leaving` both survive.
 * `isBusy` then refuses `cancel` and the dialog disables both of its buttons — a "Purchase Tevi
 * Premium?" nothing but a reload could close.
 *
 * `useCheckout`'s own test pins the reset. These pin what this flow does with it: the dialog is not
 * merely closable again, it is **gone**, because the question has already been answered at Stripe.
 */
describe('after the machine is reset from under it', () => {
    it('drops the confirmation once the checkout it started goes back to idle', () => {
        const { seen, rerender } = probe()

        act(() => seen.current?.request(ANNUAL))
        act(() => seen.current?.confirm())

        // Where the browser goes to Stripe. The dialog is deliberately still up and inert.
        payment.state = { kind: 'leaving' }
        payment.isBusy = true
        act(() => rerender())
        expect(seen.current?.pending).toBe(ANNUAL)

        // The restore: `useCheckout` dispatches CLOSE, so the machine is idle and nothing is busy.
        payment.state = { kind: 'idle' }
        payment.isBusy = false
        act(() => rerender())

        expect(seen.current?.pending).toBeNull()
        expect(seen.current?.isBusy).toBe(false)
    })

    it('does not close a confirmation that has not been confirmed yet', () => {
        const { seen, rerender } = probe()

        /*
         * The machine is `idle` for the whole of this — which is exactly when the dialog is supposed
         * to be open, waiting for the second press. Keying the rule on `idle` alone closed the
         * dialog in the frame it opened; hence the ref, and hence this test.
         */
        act(() => seen.current?.request(ANNUAL))
        act(() => rerender())
        act(() => rerender())

        expect(seen.current?.pending).toBe(ANNUAL)
    })

    it('lets the same package be bought again afterwards', () => {
        const { seen, rerender } = probe()

        act(() => seen.current?.request(ANNUAL))
        act(() => seen.current?.confirm())
        payment.state = { kind: 'idle' }
        act(() => rerender())
        payment.checkout.mockClear()

        act(() => seen.current?.request(ANNUAL))
        act(() => seen.current?.confirm())

        expect(payment.checkout).toHaveBeenCalledTimes(1)
    })
})
