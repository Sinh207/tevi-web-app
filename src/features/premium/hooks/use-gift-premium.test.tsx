// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GiftRecipient } from '../api/gift-types'
import type { PremiumPackage } from '../api/types'
import { useGiftPremium } from './use-gift-premium'

/**
 * What no comment can pin about this screen: **the step is derived**, **the charge names the person
 * who was chosen**, and **a receiver that cannot be resolved does not become a payment error**.
 *
 * All three are sequences rather than values. The first two are the whole reason the hook exists in
 * this shape — legacy holds the step in a `useState` beside nine other pieces and keeps them in
 * agreement by hand — and the third is the case where the *absence* of a dialog is the correct
 * behaviour, which is not something a rendered tree can assert on its own.
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
    useAuth: () => ({ activeId: '900001' }),
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

/**
 * The router, with both writers the hook uses: `push` for choosing somebody (so the browser's Back
 * has an entry to come back to) and `replace` for un-choosing and for sweeping `?gift_token=`.
 *
 * Neither fires `popstate`, which is why the hook sets its own state as well — the tests below rely
 * on that, and the listener is exercised by dispatching the event directly.
 */
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
vi.mock('next/navigation', () => ({
    useRouter: () => router,
    usePathname: () => '/gift-premium',
}))

const api = vi.hoisted(() => ({ getRecipient: vi.fn() }))
vi.mock('../api/gift-recipient-api', async importOriginal => ({
    ...(await importOriginal<typeof import('../api/gift-recipient-api')>()),
    giftRecipientApi: api,
}))

function recipient(over: Partial<GiftRecipient> = {}): GiftRecipient {
    return {
        id: 'ch-1',
        slug: 'ada',
        name: 'Ada Lovelace',
        display_name: null,
        images: { thumb: null, avatar_video: null },
        verified_tick_badge: null,
        is_premium: false,
        is_nsfw: false,
        owner_id: null,
        ...over,
    } as GiftRecipient
}

const YEAR = {
    id: '13',
    product_id: 'price_year',
    price: 77.99,
    currency: 'USD',
    duration_days: 365,
} as PremiumPackage

function probe() {
    const seen: { current: ReturnType<typeof useGiftPremium> | null } = { current: null }
    function Probe() {
        seen.current = useGiftPremium()
        return null
    }
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const tree = () => (
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>
    )
    const view = render(tree())
    /*
     * `usePayment()` is a mock returning one stable object, so moving the machine is a *mutation* —
     * which React cannot see. `rerender` is what lets a test say "the checkout state changed" at
     * all; setting state on the hook instead would re-render for the wrong reason (and setting the
     * *same* recipient bails out of rendering entirely, which is how this test first passed
     * vacuously).
     *
     * ⚠ A **fresh element each time** — `rerender` with the identical element object is a bailout in
     * React, so passing a stored `tree` re-renders nothing and the effect never re-runs.
     */
    return { seen, rerender: () => view.rerender(tree()) }
}

beforeEach(() => {
    payment.checkout.mockReset()
    payment.isBusy = false
    payment.state = { kind: 'idle' }
    session.isAuthenticated = true
    session.openLoginDialog.mockReset()
    router.push.mockReset()
    router.replace.mockReset()
    router.back.mockReset()
    api.getRecipient.mockReset()
    api.getRecipient.mockResolvedValue(recipient({ owner_id: '77' }))
    window.history.replaceState({}, '', '/gift-premium')
})

describe('useGiftPremium — the step', () => {
    it('is derived from the two facts that decide it, so it cannot disagree with them', () => {
        const { seen } = probe()
        expect(seen.current?.step).toBe('recipient')

        act(() => seen.current?.select(recipient()))
        expect(seen.current?.step).toBe('offer')

        // One line in the hook, where legacy has two five-line resets that must agree.
        act(() => seen.current?.back())
        expect(seen.current?.step).toBe('recipient')
        expect(seen.current?.recipient).toBeNull()
    })

    it('names the recipient in the URL, and **pushes** so Back has somewhere to go', () => {
        /*
         * The whole reason the step is in the URL: the browser's (and the phone's) Back used to leave
         * `/gift-premium` from the offer step, while the in-page Back un-chose the recipient. One
         * screen, two Backs, different outcomes — and on a phone the gesture is the one people use.
         */
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))
        expect(router.push).toHaveBeenCalledWith('/gift-premium?to=ada', { scroll: false })
    })

    it('pops the entry it pushed, rather than replacing it', () => {
        /*
         * `replace` here leaves the *earlier* plain `/gift-premium` behind, so the browser's Back
         * then lands on the picker again — one press that changes nothing before it leaves the page.
         * Caught by an e2e assertion that failed for the right reason.
         */
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))
        act(() => seen.current?.back())

        expect(router.back).toHaveBeenCalledTimes(1)
        expect(router.replace).not.toHaveBeenCalled()
    })

    it('replaces instead for a reader who arrived on a `?to=` link', async () => {
        // No entry of ours behind them: `back()` would take them off the site.
        window.history.replaceState({}, '', '/gift-premium?to=ada')
        const { seen } = probe()
        await waitFor(() => expect(seen.current?.step).toBe('offer'))

        act(() => seen.current?.back())

        expect(router.replace).toHaveBeenCalledWith('/gift-premium', { scroll: false })
        expect(router.back).not.toHaveBeenCalled()
    })

    it('follows the browser back and forward buttons', async () => {
        // Neither `push` nor `replace` fires `popstate`, so the listener is only ever exercised by
        // the two history buttons — dispatched here directly.
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))
        expect(seen.current?.step).toBe('offer')

        window.history.replaceState({}, '', '/gift-premium')
        await act(async () => {
            window.dispatchEvent(new PopStateEvent('popstate'))
        })
        expect(seen.current?.step).toBe('recipient')
    })

    it('opens on the person a `?to=` link names, fetching them once', async () => {
        window.history.replaceState({}, '', '/gift-premium?to=ada')
        const { seen } = probe()

        await waitFor(() => expect(seen.current?.step).toBe('offer'))
        expect(seen.current?.recipient?.slug).toBe('ada')
        expect(api.getRecipient).toHaveBeenCalledTimes(1)
    })

    it('falls back to the picker for a `?to=` that names nobody', async () => {
        // A renamed or removed space. The picker is the honest answer to a link that resolves to
        // nothing — better than an offer screen with no name on it.
        api.getRecipient.mockResolvedValue(null)
        window.history.replaceState({}, '', '/gift-premium?to=ghost')
        const { seen } = probe()

        await waitFor(() => expect(seen.current?.isResolvingRecipient).toBe(false))
        expect(seen.current?.step).toBe('recipient')
    })

    it('does not fetch a recipient it was handed', () => {
        // Picking hands over the whole row, so the URL only has to record which one — the query
        // stays disabled and the prefetch fires only for a row with no `owner_id`.
        const { seen } = probe()
        act(() => seen.current?.select(recipient({ owner_id: '512' })))
        expect(api.getRecipient).not.toHaveBeenCalled()
    })

    it('shows a settled gift over a recipient that is still chosen', async () => {
        // Returning from Stripe on a page whose picker state survived: the congratulation outranks
        // the offer, which is what the ternary's *order* in the hook states.
        window.history.replaceState({}, '', '/gift-premium?gift_token=oops')
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))
        expect(seen.current?.step).toBe('offer')
    })
})

describe('useGiftPremium — the returning URL', () => {
    /** The token this client mints, encoded the way it mints it. */
    function token(payload: Record<string, unknown>) {
        return btoa(encodeURIComponent(JSON.stringify(payload)))
    }

    it('reads a settled gift and sweeps the parameter', async () => {
        const gift = token({ v: 1, s: 'ada', n: 'Ada Lovelace', d: 365, t: Date.now() })
        window.history.replaceState({}, '', `/gift-premium?gift_token=${encodeURIComponent(gift)}`)

        const { seen } = probe()

        await waitFor(() => expect(seen.current?.step).toBe('sent'))
        expect(seen.current?.sent).toEqual({ slug: 'ada', name: 'Ada Lovelace', plan: 'year' })
        // Swept, so a reload is an ordinary arrival rather than a second congratulation.
        expect(router.replace).toHaveBeenCalledWith('/gift-premium', { scroll: false })
    })

    it('keeps the screen’s other parameters when it sweeps its own', async () => {
        const gift = token({ v: 1, s: 'ada', t: Date.now() })
        window.history.replaceState(
            {},
            '',
            `/gift-premium?utm_campaign=x&gift_token=${encodeURIComponent(gift)}`,
        )

        probe()

        await waitFor(() =>
            expect(router.replace).toHaveBeenCalledWith('/gift-premium?utm_campaign=x', {
                scroll: false,
            }),
        )
    })

    it('sweeps a token it could not read, and stays on the picker', async () => {
        // An expired or malformed token has been consumed either way; leaving it on the URL means
        // every reload re-runs a decode that has already failed, with the handle still in the bar.
        window.history.replaceState({}, '', '/gift-premium?gift_token=not-a-token')

        const { seen } = probe()

        await waitFor(() => expect(router.replace).toHaveBeenCalled())
        expect(seen.current?.step).toBe('recipient')
        expect(seen.current?.sent).toBeNull()
    })

    it('“send another gift” drops both facts at once', async () => {
        const gift = token({ v: 1, s: 'ada', d: 90, t: Date.now() })
        window.history.replaceState({}, '', `/gift-premium?gift_token=${encodeURIComponent(gift)}`)

        const { seen } = probe()
        await waitFor(() => expect(seen.current?.step).toBe('sent'))

        act(() => seen.current?.again())
        expect(seen.current?.step).toBe('recipient')
    })
})

describe('useGiftPremium — the press', () => {
    it('raises the confirmation rather than charging, and names the plan pressed', () => {
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))

        act(() => seen.current?.request(YEAR))

        expect(seen.current?.pending).toBe(YEAR)
        expect(seen.current?.pendingPlan).toBe('year')
        // Nothing is sent until the second press — the step exists because the money is spent on
        // somebody else's account.
        expect(payment.checkout).not.toHaveBeenCalled()
    })

    it('raises the sign-in dialog for a guest instead of a confirmation', () => {
        session.isAuthenticated = false
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))

        act(() => seen.current?.request(YEAR))

        expect(session.openLoginDialog).toHaveBeenCalled()
        expect(seen.current?.pending).toBeNull()
    })

    it('drops a second press while a checkout is live', () => {
        payment.isBusy = true
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))

        act(() => seen.current?.request(YEAR))

        // The machine guards the *request*; this guards the **dialog**, which would otherwise
        // re-open on the package pressed second and confirm a charge for the first.
        expect(seen.current?.pending).toBeNull()
    })
})

describe('useGiftPremium — confirming', () => {
    it('resolves the receiver and sends it with the price id and the gift token', async () => {
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))
        act(() => seen.current?.request(YEAR))

        await act(async () => {
            seen.current?.confirm()
        })

        await waitFor(() => expect(payment.checkout).toHaveBeenCalledTimes(1))
        const order = payment.checkout.mock.calls[0]?.[0]
        expect(order).toMatchObject({
            kind: 'gift-premium',
            priceId: 'price_year',
            receiverUserId: '77',
            // A hosted Stripe Checkout stores the card itself; asking the backend to save it too
            // would be a second consent taken on a page that never showed a card field.
            savePaymentInfo: false,
        })
        // The token is what makes the return trip able to congratulate anybody at all.
        expect(typeof order.giftToken).toBe('string')
        expect(order.giftToken.length).toBeGreaterThan(0)
    })

    it('skips the lookup when the payload already carried an owner', async () => {
        const { seen } = probe()
        act(() => seen.current?.select(recipient({ owner_id: '512' })))
        act(() => seen.current?.request(YEAR))

        await act(async () => {
            seen.current?.confirm()
        })

        await waitFor(() => expect(payment.checkout).toHaveBeenCalled())
        expect(api.getRecipient).not.toHaveBeenCalled()
        expect(payment.checkout.mock.calls[0]?.[0]).toMatchObject({ receiverUserId: '512' })
    })

    it('does not charge when the receiver cannot be resolved, and says so in its own words', async () => {
        // Deliberately **not** routed through the checkout machine: nothing was charged, so a dialog
        // headed by a payment error would describe the wrong event.
        api.getRecipient.mockResolvedValue(recipient({ owner_id: null }))
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))
        act(() => seen.current?.request(YEAR))

        await act(async () => {
            seen.current?.confirm()
        })

        await waitFor(() => expect(seen.current?.errorKey).toBe('giftpremium_error_recipient'))
        expect(payment.checkout).not.toHaveBeenCalled()
        // The confirmation is still there to try again from.
        expect(seen.current?.pending).toBe(YEAR)
    })

    it('does not charge when the lookup itself fails', async () => {
        api.getRecipient.mockRejectedValue(new Error('502'))
        const { seen } = probe()
        act(() => seen.current?.select(recipient()))
        act(() => seen.current?.request(YEAR))

        await act(async () => {
            seen.current?.confirm()
        })

        await waitFor(() => expect(seen.current?.errorKey).toBe('giftpremium_error_recipient'))
        expect(payment.checkout).not.toHaveBeenCalled()
        expect(seen.current?.isBusy).toBe(false)
    })

    it('refuses a handle that cannot be encoded, before any request goes out', async () => {
        const { seen } = probe()
        act(() => seen.current?.select(recipient({ slug: 'a b' })))
        act(() => seen.current?.request(YEAR))
        /*
         * `select` warms the receiver lookup — that is its whole second job — so the mock is cleared
         * here to isolate what `confirm` does. The claim is that the encode check runs **first**: a
         * handle that cannot be written into a return URL costs no request at all.
         */
        api.getRecipient.mockClear()

        await act(async () => {
            seen.current?.confirm()
        })

        expect(seen.current?.errorKey).toBe('giftpremium_error_recipient')
        expect(api.getRecipient).not.toHaveBeenCalled()
        expect(payment.checkout).not.toHaveBeenCalled()
    })
})

describe('useGiftPremium — the confirmation steps aside', () => {
    it('closes once another dialog owns the flow', async () => {
        const { seen, rerender } = probe()
        act(() => seen.current?.select(recipient()))
        act(() => seen.current?.request(YEAR))
        expect(seen.current?.pending).toBe(YEAR)

        // `failed` belongs to `CheckoutStatusDialog`, which prints the backend's own sentence —
        // including legacy's hard-coded "this user already has Tevi Premium".
        payment.state = { kind: 'failed' }
        act(() => rerender())

        await waitFor(() => expect(seen.current?.pending).toBeNull())
    })

    it('stays open while the browser is leaving for the gateway', async () => {
        const { seen, rerender } = probe()
        act(() => seen.current?.select(recipient()))
        act(() => seen.current?.request(YEAR))

        // No other dialog renders for `leaving`, so closing would leave a blank page while the
        // browser navigates to Stripe.
        payment.state = { kind: 'leaving' }
        act(() => rerender())

        expect(seen.current?.pending).toBe(YEAR)
    })
})
