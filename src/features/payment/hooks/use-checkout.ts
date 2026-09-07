'use client'

import { useAuth } from '@features/auth'
import { ApiError } from '@shared/lib/api/errors'
import type { StripeElements, StripeError } from '@stripe/stripe-js'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { checkoutApi } from '../api/checkout-api'
import type { SettleOutcome } from '../api/types'
import type { CheckoutAction } from '../lib/checkout-action'
import type { CallbackIntent } from '../lib/checkout-callback'
import {
    CHECKOUT_ERROR_KEYS,
    type CheckoutState,
    canDismissCheckout,
    checkoutOrder,
    checkoutReducer,
    IDLE,
    isCheckoutBusy,
} from '../lib/checkout-machine'
import { type CheckoutOrder, mayReachCardStep } from '../lib/checkout-order'
import { checkoutReturnUrls } from '../lib/return-url'
import { runSettlePoll } from '../lib/settle-poll'
import { getStripe } from '../lib/stripe-loader'
import { useStripeConfig } from './use-stripe-config'

/**
 * The checkout engine: one machine, one settle loop, one account.
 *
 * ## What it is responsible for, in order
 *
 * `start(order)` posts the order and turns the answer into a state; a `card` state waits for
 * `submit()`, which hands the intent to Stripe; a `redirect` state hands the browser away; and
 * everything that gets as far as a real charge ends in **one** poll of
 * `payment/v3/stripe/callback/`. `resume(intent)` is the same finish line reached from a URL after a
 * redirect, and it exists here rather than in `use-checkout-callback` for the reason the whole
 * feature exists: legacy has **three** copies of that polling loop
 * (`components/stripe/listCard`, `providers/balance/index.js`, `membershipDetails/useMembershipResult`),
 * and each of the three has its own bugs. There is one here, and both entry points feed it.
 *
 * ## The account is captured on the press, never read at request time
 *
 * `orderAccountRef` is set once, when the order starts, and every request the flow makes afterwards
 * — the create, every poll — carries that id. Switching accounts mid-flight is not exotic: a settle
 * can take the better part of a minute (`lib/settle-poll.ts`), and the account switcher is two
 * presses away in the drawer. Reading "the active account" at request time would attribute a charge,
 * and the ETag scope it is cached under, to whoever happens to be active when the answer arrives.
 * Same rule and the same reasoning as `useUpdateMe`, which pins it with a test for the same reason.
 *
 * ## Every teardown path aborts the poll
 *
 * One `AbortController` per flow, held in a ref, aborted on unmount, on a new order, and on a resume.
 * Legacy starts a `setInterval` per attempt, clears none of them, and starts a second one if its
 * effect re-runs — so leaving the tab open on a payment that never resolves is a request every two
 * seconds until the tab is closed. The controller is also what makes "no timer is left alive after
 * unmount" a thing a test can state.
 *
 * ## Closing the dialog does not cancel anything
 *
 * The money has already left by the time `settling` is on screen, so the poll belongs to this hook
 * and not to the dialog. `close()` returns the machine to `idle` and the loop keeps going; when it
 * lands, the reducer ignores a `SETTLED` arriving from `idle` (that guard is deliberate) and
 * `onSettled` is called with `dismissed: true` so the caller can refresh the balance and say so
 * quietly. Which is the provider's decision to make, so it is the provider that makes it.
 *
 * ## The Stripe seam
 *
 * The instance comes from `getStripe`, which is replaceable (`setStripeLoader`) — that is the only
 * way a unit test can assert what this hook does with `confirmPayment`'s answer, since the real
 * loader fetches a script from another origin.
 */

/**
 * How the reader is paying, on the press.
 *
 * Exactly one of the two, and they are genuinely different Stripe calls rather than two spellings of
 * one: `elements` is a mounted `PaymentElement` (Apple Pay, a local wallet, a card being typed) and
 * goes through `confirmPayment`; `paymentMethodId` is a `pm_…` this account has saved and goes
 * through `confirmCardPayment`, which needs no mounted form at all.
 */
export interface CheckoutSubmission {
    elements?: StripeElements | null
    paymentMethodId?: string | null
}

export interface CheckoutSettledInfo {
    /** The callback response's `type`, for picking the success copy. Never a verdict. */
    purchaseType: string | null
    /**
     * The reader closed the dialog before this landed. The payment still settled — what is gone is
     * the screen that was going to tell them. See the note above.
     */
    dismissed: boolean
}

export interface UseCheckoutOptions {
    /**
     * A payment is known to have settled. Fired **once** per flow, whether or not a dialog is still
     * open — the balance has to be re-read either way, and only the caller knows how to say so.
     */
    onSettled?: (info: CheckoutSettledInfo) => void
}

export interface CheckoutController {
    state: CheckoutState
    /** The order still in play, so "Try again" can restart the same purchase. */
    order: CheckoutOrder | null
    /** Work is in flight; do not offer a second press. */
    isBusy: boolean
    /** Whether the status dialog may be closed. `false` only while `confirming`. */
    canDismiss: boolean
    start: (order: CheckoutOrder) => void
    submit: (submission: CheckoutSubmission) => void
    /** Finish a payment that came back on the URL — see `use-checkout-callback`. */
    resume: (intent: CallbackIntent) => void
    /** Start the same order again, from a terminal state. */
    retry: () => void
    close: () => void
}

/**
 * Last-resort `settleRef` for a gateway round-trip whose query carried neither a `TxnId` nor a
 * `gateway` name.
 *
 * `settling`/`slow` carry a `settleRef` — an opaque handle, deliberately *not* a client secret,
 * because only the Stripe shape has one (see the state's own doc). Nothing builds a request from it;
 * the request lives in the poll's `check` closure. So a nameless gateway settle is still a legitimate
 * settle, and this is what it is filed under.
 */
const GATEWAY_SETTLE_REF = 'gateway'

/**
 * The reader's IANA zone, which every checkout body carries (legacy sends it too — the backend uses
 * it for the receipt). Wrapped because `Intl` can throw on a hostile or ancient runtime, and a
 * missing timezone must not be the reason a payment cannot be started.
 */
function currentTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
        return 'UTC'
    }
}

/**
 * The backend's own sentence, or `null`.
 *
 * **4xx bodies only**, and never `error.message` — which falls back to axios's "Request failed with
 * status code 502" and is not a sentence to show anybody. The same narrow rule
 * `lib/settle-outcome.ts` applies to a refusal and `providerSignInErrorText` applies to a sign-in,
 * stated a third time here because this is a third entry point rather than a shared code path.
 */
function createErrorText(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    if (error.status === undefined || error.status < 400 || error.status >= 500) return null
    const message = (error.data as { message?: unknown } | undefined)?.message
    if (typeof message !== 'string') return null
    const trimmed = message.trim()
    return trimmed === '' ? null : trimmed
}

/**
 * Stripe's own message for a declined card, an expired one, an incorrect CVC.
 *
 * These *are* written for the person paying — "Your card was declined" is better copy than any key
 * of ours — so they are shown. `card_error` and `validation_error` only: an `api_error` or an
 * `invalid_request_error` is a fault on our side or Stripe's, and its message names parameters.
 */
function stripeErrorText(error: StripeError | undefined): string | null {
    if (!error) return null
    if (error.type !== 'card_error' && error.type !== 'validation_error') return null
    const message = error.message?.trim()
    return message ? message : null
}

/**
 * Resolves when the tab is worth polling from again, or when the flow is abandoned.
 *
 * A backgrounded tab that keeps polling is a request every few seconds nobody is looking at, and
 * mobile browsers throttle the timers anyway. It resolves on **abort** as well as on visibility,
 * because a promise that only ever resolves on `visibilitychange` is a listener and a pending
 * continuation left behind on a tab that is never looked at again.
 */
function waitUntilVisible(signal: AbortSignal): Promise<void> {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        return Promise.resolve()
    }
    return new Promise(resolve => {
        const done = () => {
            document.removeEventListener('visibilitychange', onChange)
            signal.removeEventListener('abort', done)
            resolve()
        }
        const onChange = () => {
            if (document.visibilityState !== 'hidden') done()
        }
        document.addEventListener('visibilitychange', onChange)
        signal.addEventListener('abort', done, { once: true })
    })
}

export function useCheckout({ onSettled }: UseCheckoutOptions = {}): CheckoutController {
    const { activeId } = useAuth()
    const [state, dispatch] = useReducer(checkoutReducer, IDLE)
    /*
     * The publishable key, asked for **only once a checkout that can use one is live**.
     *
     * It is read at `submit`, which is a card form and a press away from `creating`, so there is
     * time; and this hook is mounted above every route, where an ungated query is a request per page
     * load for a key almost nobody uses.
     *
     * ⚠ Two further narrowings, and both were requests the answer was thrown away for. The gate was
     * `state.kind !== 'idle'`, which asked for a Stripe key while the browser was **leaving** for a
     * hosted page, and again while a settle polled — neither can mount Elements. And `creating` only
     * counts for an order that can reach a card step at all: Premium and gift Premium are documented
     * `REDIRECT`, so for them the key is never used. Measured by tracing `/gift-premium`'s real
     * traffic; `mayReachCardStep` carries the contract reading.
     *
     * A wrong narrowing costs a prefetch, not correctness — the states that actually mount Elements
     * (`card`, `confirming`) enable it unconditionally, and a query being disabled never clears the
     * data it already has.
     */
    const needsStripeKey =
        state.kind === 'card' ||
        state.kind === 'confirming' ||
        (state.kind === 'creating' && mayReachCardStep(state.order))
    const { publishableKey } = useStripeConfig({ enabled: needsStripeKey })
    const pathname = usePathname()

    /*
     * Mirrors, written during render rather than in an effect.
     *
     * Every handler below is async and has to read the *current* state and the *current* active
     * account at the moment it is entered — an effect-written mirror is a tick behind, which for
     * `start` means a second charge can be created from a state that already forbids it. The writes
     * are idempotent, so a double render (StrictMode) changes nothing.
     */
    const stateRef = useRef(state)
    stateRef.current = state
    const activeIdRef = useRef(activeId)
    activeIdRef.current = activeId
    const pathnameRef = useRef(pathname)
    pathnameRef.current = pathname
    const publishableKeyRef = useRef(publishableKey)
    publishableKeyRef.current = publishableKey
    const onSettledRef = useRef(onSettled)
    onSettledRef.current = onSettled

    /** The account this flow belongs to. Set on `start`/`resume`, read by every request after it. */
    const orderAccountRef = useRef<string | null>(null)
    /** The live flow's controller. Aborting it ends the poll and every request in flight. */
    const flowRef = useRef<AbortController | null>(null)

    const abortFlow = useCallback(() => {
        flowRef.current?.abort()
        flowRef.current = null
    }, [])

    /*
     * Unmount. The only teardown the browser does not tell us about, and the one legacy misses:
     * without it a poll outlives the tree that started it and keeps asking about a payment nobody is
     * waiting on. Deliberately not keyed on anything — this runs once, on the way out.
     */
    useEffect(() => () => abortFlow(), [abortFlow])

    /*
     * **Coming back from the gateway with the Back button.**
     *
     * `leaving` means "the browser is on its way to Stripe", and every consumer treats it as busy:
     * `isCheckoutBusy` is true, so `useSubscribePremium` refuses its own cancel and
     * `PremiumSubscribeConfirm` disables both buttons. That is right *while* the page is being
     * replaced, and the machine's own note used to say the state was one "nobody reaches" — which
     * the **back-forward cache** disproves. Safari and Chrome both restore a page that navigated
     * away cross-origin, and they restore it whole: same React tree, same reducer state. So the
     * reader presses Back at Stripe and lands on a "Purchase Tevi Premium?" dialog with two dead
     * buttons, no overlay dismiss and no Escape. Nothing short of a reload gets rid of it. Measured,
     * reported, and the reason this effect exists.
     *
     * `pageshow` with `persisted` is the one event that means "this document was frozen and is being
     * shown again" — it is fired by both engines, and it is the only signal here, because a *fresh*
     * back navigation re-runs every script and resets the reducer anyway (there is nothing to fix in
     * that case, and Chromium with the cache off is exactly why this bug survives a local test).
     *
     * `CLOSE` and not a new event: the machine already answers "may this be dismissed" and `leaving`
     * is dismissable — it was simply never asked. The guard on the kind keeps the restore from
     * closing a `settling` poll, which is *our* page's work and is correct to resume.
     */
    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (!event.persisted) return
            if (stateRef.current.kind !== 'leaving') return
            dispatch({ type: 'CLOSE' })
        }
        window.addEventListener('pageshow', onPageShow)
        return () => window.removeEventListener('pageshow', onPageShow)
    }, [])

    /**
     * The return URL a gateway or a bank sends the browser back to.
     *
     * Built from the app's configured origin plus the path being paid *from*, so the reader comes
     * back to what they were doing. `window.location.search` rather than `useSearchParams`: this
     * hook is mounted by a provider above every route, and `useSearchParams` makes the whole tree
     * require a Suspense boundary at build time and opts each page into dynamic rendering — the same
     * trade `use-dashboard-analytics.ts` documents. It is read inside a handler, so there is a
     * browser by definition and no hydration to mismatch.
     */
    const returnUrls = useCallback(() => {
        const search = typeof window === 'undefined' ? '' : window.location.search
        return checkoutReturnUrls(pathnameRef.current || '/', search)
    }, [])

    /**
     * The one settle loop.
     *
     * `check` is passed in because the two entry points ask different endpoints — a Stripe intent
     * asks `stripe/callback/`, a gateway round-trip asks `redirect-callback/` — and *nothing else*
     * about settling differs between them.
     */
    const runSettle = useCallback(
        async (check: (signal: AbortSignal) => Promise<SettleOutcome>) => {
            const controller = new AbortController()
            flowRef.current?.abort()
            flowRef.current = controller
            const { signal } = controller

            try {
                const result = await runSettlePoll({
                    check: () => check(signal),
                    signal,
                    onPending: () => dispatch({ type: 'SETTLE_PENDING' }),
                    waitUntilActive: () => waitUntilVisible(signal),
                })

                if (signal.aborted || result.status === 'aborted') return

                if (result.status === 'settled') {
                    /*
                     * Read **before** the dispatch: `dismissed` is "was anybody still watching", and
                     * after the dispatch the machine is in `succeeded` either way (from `settling`)
                     * or still `idle` (the guard) — which answers the question by accident rather
                     * than on purpose. Asking first states it.
                     */
                    const dismissed = stateRef.current.kind === 'idle'
                    dispatch({ type: 'SETTLED', purchaseType: result.purchaseType })
                    onSettledRef.current?.({ purchaseType: result.purchaseType, dismissed })
                    return
                }
                if (result.status === 'rejected') {
                    dispatch({ type: 'REJECTED', text: result.text })
                    return
                }
                dispatch({ type: 'EXHAUSTED' })
            } catch (error) {
                if (signal.aborted || (error instanceof ApiError && error.isCanceled)) return
                /*
                 * The transport gave up (`runSettlePoll` tolerates a few 5xx and then rethrows), and
                 * this is **not** `failed`. A 502 while polling says nothing about whether the charge
                 * landed — `lib/settle-outcome.ts` refuses to call it a decline for exactly this
                 * reason, and telling somebody whose money has left that their payment failed is the
                 * most expensive wrong answer on this path. `slow` is the honest one: still
                 * processing, the balance will update, here is where to watch it.
                 */
                dispatch({ type: 'EXHAUSTED' })
            } finally {
                if (flowRef.current === controller) flowRef.current = null
            }
        },
        [],
    )

    /** Settle a Stripe PaymentIntent. Shared by the confirm path and the returning-URL path. */
    const settlePayment = useCallback(
        (clientSecret: string) => {
            const accountId = orderAccountRef.current
            return runSettle(signal => checkoutApi.settle({ clientSecret, accountId, signal }))
        },
        [runSettle],
    )

    /**
     * Enter the action's state, and — for a redirect — leave.
     *
     * One function, called by **both** entry points, because "dispatch it" and "act on it" are not
     * separable: a `REDIRECT` that is dispatched without navigating is a dead end, which is exactly
     * what the handoff path used to be.
     *
     * The browser leaves *after* the state says so, so the reader sees "taking you to <gateway>"
     * rather than a dialog that vanishes. `assign` and not `replace`: legacy uses
     * `window.open(url, '_seft')` in one place (a typo for `_self`, which opens a stray window) and
     * `location.href` in another. The URL has already been checked for an `http(s)` protocol by
     * `parseCheckoutAction` — a payload carrying `javascript:` would otherwise be script execution
     * handed over by the API layer.
     */
    const applyAction = useCallback((action: CheckoutAction) => {
        dispatch({ type: 'ACTION', action })
        if (action.kind === 'redirect' && typeof window !== 'undefined') {
            window.location.assign(action.url)
        }
    }, [])

    const start = useCallback(
        (order: CheckoutOrder) => {
            const current = stateRef.current
            /*
             * The reducer ignores a `START` that is not from a terminal state, so this guard is not
             * about the machine — it is about the **request**. Without it a second press while a
             * charge is confirming would still POST `checkout/`, creating a PaymentIntent whose
             * answer the machine then discards: a charge nobody can complete and nobody knows about.
             */
            if (isCheckoutBusy(current) || current.kind === 'card' || current.kind === 'embedded') {
                return
            }

            abortFlow()
            // Captured here and nowhere else. See the note on the hook.
            orderAccountRef.current = activeIdRef.current
            dispatch({ type: 'START', order })

            /*
             * A handoff already *has* its action: `features/membership` called its own endpoint
             * and parsed the envelope. There is nothing to post, which is why `checkoutApi.create`
             * throws for this kind rather than inventing a body.
             *
             * It goes through `applyAction` for the same reason the `create` path does: a `REDIRECT`
             * has to *move the browser*. Dispatching alone left the machine in `leaving` — a state
             * with no dialog and `isCheckoutBusy` true — so Subscribe did nothing at all and every
             * later press was dropped until a reload.
             */
            if (order.kind === 'handoff') {
                applyAction(order.action)
                return
            }

            const controller = new AbortController()
            flowRef.current = controller
            const accountId = orderAccountRef.current

            void (async () => {
                try {
                    const action = await checkoutApi.create({
                        order,
                        context: { ...returnUrls(), timezone: currentTimezone() },
                        accountId,
                        signal: controller.signal,
                    })
                    if (controller.signal.aborted) return
                    applyAction(action)
                } catch (error) {
                    if (controller.signal.aborted) return
                    if (error instanceof ApiError && error.isCanceled) return
                    dispatch({
                        type: 'FAILED',
                        messageKey: CHECKOUT_ERROR_KEYS.generic,
                        text: createErrorText(error),
                    })
                }
            })()
        },
        [abortFlow, applyAction, returnUrls],
    )

    const submit = useCallback(
        ({ elements, paymentMethodId }: CheckoutSubmission) => {
            const current = stateRef.current
            if (current.kind !== 'card') return
            const { clientSecret } = current

            const key = publishableKeyRef.current
            if (!key || (!elements && !paymentMethodId)) {
                /*
                 * No Stripe key, or a press with nothing to pay with. Neither is the reader's fault
                 * and neither is a decline, so it is the generic key rather than a message invented
                 * about their card.
                 */
                dispatch({ type: 'FAILED', messageKey: CHECKOUT_ERROR_KEYS.generic, text: null })
                return
            }

            dispatch({ type: 'SUBMIT' })

            void (async () => {
                try {
                    const stripe = await getStripe(key)
                    if (!stripe) {
                        dispatch({ type: 'CONFIRM_FAILED', text: null })
                        return
                    }

                    const { successUrl } = returnUrls()
                    /*
                     * Two calls, and the branch is which one Stripe has: a saved `pm_…` needs no
                     * mounted form, and `confirmPayment` needs the `Elements` instance that holds
                     * one. `return_url` goes to both — a saved card can still be sent through 3DS,
                     * and without it that hop has nowhere to come back to.
                     *
                     * ## `redirect: 'if_required'` — the two branches now behave the same way
                     *
                     * Without it `confirmPayment` defaults to `redirect: 'always'`, so **a new card
                     * always left the page** — even one the bank waves through — while a saved card
                     * confirmed in place. One purchase, two experiences, and the redirect was the
                     * worse of them by some distance: a full document load, the settle poll restarted
                     * from cold, the client secret through the address bar and into history, and the
                     * order **gone** (`RESUME` carries no order, which is why the failure dialog's
                     * Try again had nothing to retry on that path).
                     *
                     * Legacy omits it too (`components/stripe/paymentMethods/index.js`) and this
                     * client copied that; `use-add-card.ts` had it right all along, for exactly this
                     * reasoning. A method that genuinely needs to leave — a 3DS challenge, a wallet,
                     * a local scheme — still does, and `use-checkout-callback` picks that hop up on
                     * the way back. Nothing about the redirect path is removed; it stops being the
                     * *default* for a card that needs nothing.
                     *
                     * Both branches then land on the same two lines below, which is what makes the
                     * backend callback — not Stripe's own answer — the verdict in either case.
                     */
                    const result = paymentMethodId
                        ? await stripe.confirmCardPayment(clientSecret, {
                              payment_method: paymentMethodId,
                              return_url: successUrl,
                          })
                        : await stripe.confirmPayment({
                              elements: elements as StripeElements,
                              confirmParams: { return_url: successUrl },
                              redirect: 'if_required',
                          })

                    /*
                     * `result.error` is checked **before** anything is read off the result. Legacy
                     * reads `error.type` unguarded (`paymentMethods/index.js:handleSubmit`), so a
                     * success that did not redirect is a TypeError — bug #4 in `docs/PAYMENT.md`.
                     */
                    if (result.error) {
                        dispatch({ type: 'CONFIRM_FAILED', text: stripeErrorText(result.error) })
                        return
                    }

                    dispatch({ type: 'CONFIRMED' })
                    await settlePayment(clientSecret)
                } catch {
                    // Stripe's SDK rejects rather than resolving `{ error }` for a few argument
                    // faults, and a network failure mid-confirm rejects too. Neither is a decline, so
                    // neither gets a message of its own — the generic key says what is true.
                    dispatch({ type: 'CONFIRM_FAILED', text: null })
                }
            })()
        },
        [returnUrls, settlePayment],
    )

    const resume = useCallback(
        (intent: CallbackIntent) => {
            /*
             * A `card-setup` intent is a card being **saved**, not money moving. It belongs to the
             * add-card flow, and asking the payment callback about it would ask the backend about a
             * payment that does not exist.
             */
            if (intent.kind === 'card-setup') return

            abortFlow()
            /*
             * The page was reloaded, so the flow's own account is gone with it. Whoever is active now
             * is the only answer available — and it is the right one: the return URL is same-origin
             * and the token store is per-device, so the account that started the payment is the
             * account this tab is on unless it was switched deliberately.
             */
            orderAccountRef.current = activeIdRef.current

            if (intent.kind === 'payment') {
                dispatch({ type: 'RESUME', settleRef: intent.clientSecret })
                void settlePayment(intent.clientSecret)
                return
            }

            const { params } = intent
            dispatch({
                type: 'RESUME',
                settleRef: params.TxnId ?? params.gateway ?? GATEWAY_SETTLE_REF,
            })
            const accountId = orderAccountRef.current
            void runSettle(signal => checkoutApi.settleGateway({ params, accountId, signal }))
        },
        [abortFlow, runSettle, settlePayment],
    )

    const retry = useCallback(() => {
        const order = checkoutOrder(stateRef.current)
        if (order) start(order)
    }, [start])

    const close = useCallback(() => {
        /*
         * The poll is deliberately **not** aborted. The money has left; closing the dialog is the
         * reader saying they do not want to watch, not that they want to cancel — and there is
         * nothing here that could cancel it anyway. `onSettled` fires with `dismissed: true` when it
         * lands.
         */
        dispatch({ type: 'CLOSE' })
    }, [])

    return {
        state,
        order: checkoutOrder(state),
        isBusy: isCheckoutBusy(state),
        canDismiss: canDismissCheckout(state),
        start,
        submit,
        resume,
        retry,
        close,
    }
}
