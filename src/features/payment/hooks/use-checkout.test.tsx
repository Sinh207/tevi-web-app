// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import type { Stripe } from '@stripe/stripe-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentKeys } from '../api/keys'
import type { SettleOutcome } from '../api/types'
import type { CheckoutOrder } from '../lib/checkout-order'
import { setStripeLoader } from '../lib/stripe-loader'
import { type CheckoutController, useCheckout } from './use-checkout'

/**
 * The four things this hook promises that no comment can pin, because all four are races or
 * teardowns:
 *
 * 1. **`PM0003` is not an error.** The dialog stays in `settling` and the poll keeps going — the one
 *    contract legacy gets right by accident and wrong by never stopping.
 * 2. **Unmount kills the poll.** Legacy leaves a `setInterval` per attempt running for the life of
 *    the tab; the assertion here is `vi.getTimerCount()`, because "no timer is left alive" is not
 *    something reading the code tells you.
 * 3. **A settle that lands after the dialog was closed does not re-open it** — it reports
 *    `dismissed`, and the provider decides what to do about that.
 * 4. **The charge belongs to the account that was active when the order started**, not to whoever is
 *    active when the answer arrives. Same race, same reasoning, as `use-update-me.test.tsx`.
 *
 * Stripe is injected through `setStripeLoader` — the seam `lib/stripe-loader.ts` exists for, since the
 * real loader fetches a script from another origin and there is no version of that a unit test runs.
 */

const create = vi.hoisted(() => vi.fn())
const settle = vi.hoisted(() => vi.fn())
const settleGateway = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ activeId: '1' as string | null }))

vi.mock('../api/checkout-api', () => ({ checkoutApi: { create, settle, settleGateway } }))
vi.mock('../api/stripe-config-api', () => ({
    stripeConfigApi: { get: async () => ({ publishableKey: 'pk_test' }) },
}))
vi.mock('@features/auth', () => ({ useAuth: () => auth }))
vi.mock('next/navigation', () => ({ usePathname: () => '/live/ada' }))

const ORDER: CheckoutOrder = { kind: 'stars', gatewayId: 'gw.stripe', quantity: 1000 }
const PENDING: SettleOutcome = { status: 'pending' }
const SETTLED: SettleOutcome = { status: 'settled', purchaseType: 'star' }

/** A Stripe stand-in. Only the two confirm calls are ever reached from this hook. */
function fakeStripe(overrides: Partial<Stripe> = {}) {
    return {
        confirmPayment: vi.fn(async () => ({ paymentIntent: { status: 'succeeded' } })),
        confirmCardPayment: vi.fn(async () => ({ paymentIntent: { status: 'succeeded' } })),
        ...overrides,
    } as unknown as Stripe
}

function renderCheckout(
    onSettled?: (info: { purchaseType: string | null; dismissed: boolean }) => void,
) {
    /*
     * `gcTime: Infinity` is not a preference — it is what makes the timer assertion below mean
     * something. TanStack schedules a garbage-collection `setTimeout` when the last observer of a
     * query unsubscribes, which is exactly the moment this test unmounts: the poll's timer would be
     * cleared and the cache's would take its place, and "no timer is left alive" would fail for a
     * reason that has nothing to do with the poll. An infinite gcTime schedules nothing.
     */
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
    })
    // Seeded rather than fetched: the key is read on the press, and a hook test should not be racing
    // a query it is not about.
    queryClient.setQueryData(paymentKeys.stripeConfig(), { publishableKey: 'pk_test' })

    let api: CheckoutController | null = null
    function Probe() {
        api = useCheckout({ onSettled })
        return null
    }
    const tree = (
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>
    )
    const utils = render(tree)
    return {
        ...utils,
        rerender: () => utils.rerender(tree),
        get checkout() {
            if (!api) throw new Error('probe never rendered')
            return api
        },
    }
}

beforeEach(() => {
    vi.useFakeTimers()
    auth.activeId = '1'
    create.mockReset()
    settle.mockReset()
    settleGateway.mockReset()
    setStripeLoader(async () => fakeStripe())
})

afterEach(() => {
    vi.useRealTimers()
    setStripeLoader(null)
})

/** Order → `card` state → Pay pressed. The three steps every test below starts from. */
async function payWithSavedCard(harness: ReturnType<typeof renderCheckout>) {
    create.mockResolvedValue({ kind: 'card', clientSecret: 'pi_1_secret_abc' })
    await act(async () => {
        harness.checkout.start(ORDER)
    })
    await act(async () => {
        harness.checkout.submit({ paymentMethodId: 'pm_1' })
    })
}

describe('useCheckout — settling', () => {
    it('treats PM0003 as pending: stays in settling, keeps polling, and lands on succeeded', async () => {
        settle.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(SETTLED)
        const harness = renderCheckout()

        await payWithSavedCard(harness)

        // One answer in, and it said "not yet". This is the state legacy would have called a failure.
        expect(harness.checkout.state.kind).toBe('settling')
        expect(settle).toHaveBeenCalledTimes(1)
        // The attempt counter moved, which is what a screen counts on to say how long this has run.
        expect(harness.checkout.state).toMatchObject({ kind: 'settling', attempt: 1 })

        // The schedule's first gap. `2000` is `SETTLE_SCHEDULE_MS[0]`.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000)
        })

        expect(settle).toHaveBeenCalledTimes(2)
        expect(harness.checkout.state).toMatchObject({ kind: 'succeeded', purchaseType: 'star' })
    })

    it('confirms a **new** card in place, and only leaves the page if the bank asks', async () => {
        /*
         * `redirect: 'if_required'`. Without it `confirmPayment` defaults to `'always'`, so a new card
         * left the page for every purchase — a full document load, a settle poll restarted from cold,
         * the client secret through the address bar, and the order gone (`RESUME` has none, which is
         * what left the failure dialog's Try again with nothing to retry). A saved card meanwhile
         * confirmed in place: one purchase, two experiences.
         *
         * Legacy omits the option too, so this is the kind of parity worth breaking rather than
         * copying — and `use-add-card.ts` had it right all along.
         */
        settle.mockResolvedValue(SETTLED)
        const stripe = fakeStripe()
        setStripeLoader(async () => stripe)
        const harness = renderCheckout()

        create.mockResolvedValue({ kind: 'card', clientSecret: 'pi_1_secret_abc' })
        await act(async () => {
            harness.checkout.start(ORDER)
        })
        await act(async () => {
            // What the panel passes for "Use a new payment method": the mounted Elements instance.
            harness.checkout.submit({ elements: {} as never })
        })

        expect(stripe.confirmPayment).toHaveBeenCalledWith(
            expect.objectContaining({ redirect: 'if_required' }),
        )
        // A `return_url` is still sent: `if_required` means *this* card did not need it, not that a
        // 3DS challenge has nowhere to come back to.
        expect(stripe.confirmPayment).toHaveBeenCalledWith(
            expect.objectContaining({
                confirmParams: expect.objectContaining({ return_url: expect.any(String) }),
            }),
        )
        // And it lands where a saved card lands — the backend callback is the verdict either way.
        expect(harness.checkout.state).toMatchObject({ kind: 'succeeded', purchaseType: 'star' })
    })

    it('reports the outcome once, with whether anybody was still watching', async () => {
        settle.mockResolvedValue(SETTLED)
        const onSettled = vi.fn()
        const harness = renderCheckout(onSettled)

        await payWithSavedCard(harness)

        expect(onSettled).toHaveBeenCalledTimes(1)
        expect(onSettled).toHaveBeenCalledWith({ purchaseType: 'star', dismissed: false })
    })

    it('goes to slow rather than failed when the schedule runs out', async () => {
        settle.mockResolvedValue(PENDING)
        const harness = renderCheckout()

        await payWithSavedCard(harness)
        // The whole schedule: 54s of backoff, plus slack.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000)
        })

        /*
         * `slow`, not `failed`. The money has left and nothing has refused it — this is the state
         * legacy has no name for, which is why its reader watches a spinner indefinitely.
         */
        expect(harness.checkout.state.kind).toBe('slow')
    })

    it('goes to slow rather than failed when the transport gives up mid-poll', async () => {
        // Four 502s: `runSettlePoll` tolerates three and rethrows the fourth.
        settle.mockRejectedValue(new ApiError({ message: 'bad gateway', status: 502 }))
        const harness = renderCheckout()

        await payWithSavedCard(harness)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(20_000)
        })

        /*
         * A 502 says nothing about whether the charge landed, so it must not be reported as a
         * decline — the mistake `lib/settle-outcome.ts` exists to prevent, one layer up.
         */
        expect(harness.checkout.state.kind).toBe('slow')
    })
})

describe('useCheckout — teardown', () => {
    it('aborts the poll on unmount and leaves no timer alive', async () => {
        settle.mockResolvedValue(PENDING)
        const harness = renderCheckout()

        await payWithSavedCard(harness)
        expect(settle).toHaveBeenCalledTimes(1)
        // Mid-schedule: exactly one sleep is pending.
        expect(vi.getTimerCount()).toBe(1)

        harness.unmount()

        /*
         * The assertion legacy cannot make. Its `setInterval` is never cleared, so this number would
         * be 1 forever and the request below would keep firing on a tree that no longer exists.
         */
        expect(vi.getTimerCount()).toBe(0)
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000)
        })
        expect(settle).toHaveBeenCalledTimes(1)
    })

    it('does not re-open the dialog for a settle that lands after it was closed', async () => {
        settle.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(SETTLED)
        const onSettled = vi.fn()
        const harness = renderCheckout(onSettled)

        await payWithSavedCard(harness)
        expect(harness.checkout.state.kind).toBe('settling')

        // The reader closes it. The money has already left, so the poll carries on.
        act(() => {
            harness.checkout.close()
        })
        expect(harness.checkout.state.kind).toBe('idle')

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000)
        })

        // Still idle: the reducer ignores a `SETTLED` from `idle`, and nothing here works around it.
        expect(harness.checkout.state.kind).toBe('idle')
        // But it *did* settle, and the caller is told — with the fact that nobody was watching, which
        // is what turns a success dialog into a toast.
        expect(onSettled).toHaveBeenCalledWith({ purchaseType: 'star', dismissed: true })
    })
})

describe('useCheckout — the account is captured on the press', () => {
    it('charges the account that was active when the order started, not one switched to mid-flight', async () => {
        let resolveCreate: (action: unknown) => void = () => {}
        create.mockReturnValue(new Promise(resolve => (resolveCreate = resolve)))
        settle.mockResolvedValue(SETTLED)
        const harness = renderCheckout()

        act(() => {
            harness.checkout.start(ORDER)
        })

        // The reader switches accounts while `checkout/` is in flight — two presses away in the
        // drawer, and a settle can run for the better part of a minute.
        auth.activeId = '2'
        act(() => {
            harness.rerender()
        })

        await act(async () => {
            resolveCreate({ kind: 'card', clientSecret: 'pi_1_secret_abc' })
        })
        await act(async () => {
            harness.checkout.submit({ paymentMethodId: 'pm_1' })
        })

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ accountId: '1' }))
        // And the settle too: it is the same payment, so it is cached and attributed under the same
        // account. Reading `activeId` here would file account 1's charge under account 2's ETag scope.
        expect(settle).toHaveBeenCalledWith(expect.objectContaining({ accountId: '1' }))
        expect(harness.checkout.state.kind).toBe('succeeded')
    })

    it('refuses a second start while a payment is confirming', async () => {
        create.mockResolvedValue({ kind: 'card', clientSecret: 'pi_1_secret_abc' })
        settle.mockResolvedValue(PENDING)
        const harness = renderCheckout()

        await act(async () => {
            harness.checkout.start(ORDER)
        })
        await act(async () => {
            harness.checkout.submit({ paymentMethodId: 'pm_1' })
        })

        create.mockClear()
        act(() => {
            harness.checkout.start(ORDER)
        })

        /*
         * Not merely "the machine ignored it": no *request* was made. A second `POST checkout/` here
         * would create a PaymentIntent whose answer is then discarded — a charge nobody can complete.
         */
        expect(create).not.toHaveBeenCalled()
    })
})

describe('useCheckout — how a failure is worded', () => {
    it('shows the backend’s own sentence for a 4xx and its own key for a 5xx', async () => {
        create.mockRejectedValueOnce(
            new ApiError({
                message: 'Request failed',
                status: 400,
                data: { message: 'Card not supported in your country.' },
            }),
        )
        const harness = renderCheckout()

        await act(async () => {
            harness.checkout.start(ORDER)
        })
        expect(harness.checkout.state).toMatchObject({
            kind: 'failed',
            text: 'Card not supported in your country.',
        })

        create.mockRejectedValueOnce(
            new ApiError({
                message: 'Request failed',
                status: 502,
                data: { message: 'Traceback (most recent call last)' },
            }),
        )
        await act(async () => {
            harness.checkout.retry()
        })
        /*
         * The 5xx body is dropped, not shown. That is where stack fragments live — the same narrow
         * rule `providerSignInErrorText` documents in `features/auth`.
         */
        expect(harness.checkout.state).toMatchObject({
            kind: 'failed',
            text: null,
            messageKey: 'payment_error_generic',
        })
    })

    it('shows Stripe’s message for a declined card and does not read the result before checking it', async () => {
        create.mockResolvedValue({ kind: 'card', clientSecret: 'pi_1_secret_abc' })
        setStripeLoader(async () =>
            fakeStripe({
                confirmCardPayment: vi.fn(async () => ({
                    error: { type: 'card_error', message: 'Your card was declined.' },
                })),
            } as unknown as Partial<Stripe>),
        )
        const harness = renderCheckout()

        await payWithSavedCard(harness)

        expect(harness.checkout.state).toMatchObject({
            kind: 'failed',
            text: 'Your card was declined.',
        })
        // No settle was attempted: nothing was charged.
        expect(settle).not.toHaveBeenCalled()
    })

    it('keeps an api_error’s message off the screen', async () => {
        create.mockResolvedValue({ kind: 'card', clientSecret: 'pi_1_secret_abc' })
        setStripeLoader(async () =>
            fakeStripe({
                confirmCardPayment: vi.fn(async () => ({
                    error: { type: 'api_error', message: 'No such payment_intent: pi_1' },
                })),
            } as unknown as Partial<Stripe>),
        )
        const harness = renderCheckout()

        await payWithSavedCard(harness)

        // A fault on our side or Stripe's, whose message names parameters. The key says what is true.
        expect(harness.checkout.state).toMatchObject({
            kind: 'failed',
            text: null,
            messageKey: 'payment_error_generic',
        })
    })

    it('fails closed on an action it cannot carry out', async () => {
        create.mockResolvedValue({ kind: 'crypto', data: { address: 'bc1…' } })
        const harness = renderCheckout()

        await act(async () => {
            harness.checkout.start(ORDER)
        })

        expect(harness.checkout.state).toMatchObject({
            kind: 'failed',
            messageKey: 'payment_error_unsupported_method',
        })
    })
})

describe('useCheckout — resuming from a URL', () => {
    it('settles a payment intent read off the URL, and never asks about a card setup', async () => {
        settle.mockResolvedValue(SETTLED)
        const harness = renderCheckout()

        await act(async () => {
            harness.checkout.resume({
                kind: 'card-setup',
                clientSecret: 'seti_1_secret',
                redirectStatus: 'succeeded',
            })
        })
        // A SetupIntent is a card being saved, not money moving. Asking the payment callback about it
        // would ask the backend about a payment that does not exist.
        expect(settle).not.toHaveBeenCalled()

        await act(async () => {
            harness.checkout.resume({
                kind: 'payment',
                clientSecret: 'pi_9_secret',
                redirectStatus: 'succeeded',
            })
        })

        expect(settle).toHaveBeenCalledWith(
            expect.objectContaining({ clientSecret: 'pi_9_secret', accountId: '1' }),
        )
        expect(harness.checkout.state.kind).toBe('succeeded')
    })

    it('forwards a gateway round-trip’s whole query to the redirect callback', async () => {
        settleGateway.mockResolvedValue({ status: 'settled', purchaseType: null })
        const harness = renderCheckout()

        await act(async () => {
            harness.checkout.resume({ kind: 'gateway', params: { TxnId: 'tx-1', gateway: 'coda' } })
        })

        expect(settleGateway).toHaveBeenCalledWith(
            expect.objectContaining({ params: { TxnId: 'tx-1', gateway: 'coda' } }),
        )
        expect(harness.checkout.state.kind).toBe('succeeded')
    })
})

describe('useCheckout — a handoff', () => {
    it('navigates when the handed-over action is a redirect', async () => {
        /*
         * The bug this pins: the handoff branch dispatched `ACTION` and returned, while the navigation
         * lived only in the `create` path. The machine sat in `leaving` — a state with no dialog and
         * `isCheckoutBusy` true — so Subscribe did nothing at all and every later press was dropped
         * until a reload. `features/membership` is the caller this kind exists for.
         */
        const assign = vi.fn()
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, assign, search: '' },
        })

        const probe = renderCheckout()

        await act(async () => {
            probe.checkout.start({
                kind: 'handoff',
                source: 'membership',
                action: { kind: 'redirect', url: 'https://checkout.stripe.com/c/pay/cs_test' },
            })
        })

        expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test')
        expect(probe.checkout.state.kind).toBe('leaving')
        // Nothing was posted: the intent already existed.
        expect(create).not.toHaveBeenCalled()
    })
})

/**
 * **Back from the gateway.** The bug this pins was reported from a real browser and does not
 * reproduce in this one: pressing Back at Stripe restores the page from the back-forward cache with
 * the reducer still in `leaving`, which every consumer reads as busy — so the Premium confirmation
 * came back with two disabled buttons, no overlay dismiss and no Escape, and nothing but a reload
 * closed it. Chromium here runs with the cache off, so a `goBack()` re-runs every script and the
 * reducer resets by itself; the only faithful test is the event the browser fires on a restore.
 */
describe('restored from the back-forward cache', () => {
    function pageShow(persisted: boolean) {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }))
    }

    async function leaveForGateway() {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, assign: vi.fn(), search: '' },
        })
        const probe = renderCheckout()
        await act(async () => {
            probe.checkout.start({
                kind: 'handoff',
                source: 'membership',
                action: { kind: 'redirect', url: 'https://checkout.stripe.com/c/pay/cs_test' },
            })
        })
        expect(probe.checkout.state.kind).toBe('leaving')
        return probe
    }

    it('resets a leaving machine, so nothing is left busy', async () => {
        const probe = await leaveForGateway()

        await act(async () => pageShow(true))

        expect(probe.checkout.state.kind).toBe('idle')
        // The half of the bug that made it unclosable rather than merely open.
        expect(probe.checkout.isBusy).toBe(false)
        expect(probe.checkout.canDismiss).toBe(true)
    })

    it('ignores a pageshow that is not a restore', async () => {
        const probe = await leaveForGateway()

        // Every ordinary load fires this too, with `persisted: false`. Acting on it would reset the
        // machine on the way *out* — the redirect would be cancelled by its own navigation.
        await act(async () => pageShow(false))

        expect(probe.checkout.state.kind).toBe('leaving')
    })

    it('leaves a settling poll alone', async () => {
        const probe = renderCheckout()
        settle.mockResolvedValue(PENDING)
        await payWithSavedCard(probe)
        expect(probe.checkout.state.kind).toBe('settling')

        /*
         * `settling` is **our** page's work: the money has left and the poll is asking whether it
         * landed. A reader who leaves and comes back should still be told, so the restore must not
         * touch it — which is why the handler is keyed on `leaving` and not on `isBusy`.
         */
        await act(async () => pageShow(true))

        expect(probe.checkout.state.kind).toBe('settling')
    })
})
