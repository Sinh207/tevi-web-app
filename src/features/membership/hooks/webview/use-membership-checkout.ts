'use client'

import {
    CHECKOUT_ERROR_KEYS,
    type ChargedAmount,
    type CheckoutState,
    type CheckoutSubmission,
    checkoutReducer,
    getStripe,
    IDLE,
    isCheckoutBusy,
    normalizeSavedCards,
    PENDING_SETTLEMENT_CODE,
    parseChargedAmount,
    parseCheckoutAction,
    parseCheckoutCallback,
    runSettlePoll,
    type SavedCard,
    type SettleOutcome,
    settledFrom,
    useStripeConfig,
} from '@features/payment'
import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import {
    hasNativeBridge,
    NativeBridgeError,
    type NativeReply,
    nativeBridge,
} from '@shared/lib/native-bridge'
import type { StripeElements } from '@stripe/stripe-js'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { creatorApi } from '../../api/creator-api'
import { membershipApi } from '../../api/subscription-api'
import type { MembershipChannel } from '../../api/types'
import { type CashOffer, cashOffer } from '../../lib/cash-offer'

/**
 * The `/app/[channelSlug]/membership/[packageId]` webview checkout, as one controller.
 *
 * Legacy: `../tevi-web-app/src/containers/app/membershipDetails` — a provider, three hooks and an
 * injected `<script>` SDK. Same screen, same integration, without the parts of it that were bugs.
 *
 * ## The host owns the session, so this screen has no account of its own
 *
 * The native app opens this webview to collect a card for a tier the reader already picked. The
 * account, its saved cards and its money are the **app's**; this page is a renderer. So there is no
 * `AuthProvider` above it, no bearer, and no `useAuth` anywhere below — the three account-scoped
 * operations are *asked of the host* over the JS bridge:
 *
 * ```
 * TeviJS.membershipCheckout({ packageId, priceInfo })  → the PaymentIntent
 * TeviJS.myPaymentMethods({})                          → the saved cards
 * TeviJS.createStripeCallback({ clientSecret })        → has it settled?
 * TeviJS.membershipResult({ status })                  → dismiss me   (the screen sends this)
 * ```
 *
 * What stays on HTTP is what needs no session: the tier
 * (`billy/v3/subscription/channel/{slug}/packages/{id}/`), the creator
 * (`core/v3/channel/channels/{slug}/`) and the Stripe publishable key — all three of which legacy
 * also fetches directly. Routing a public read through another process would be a round trip to fetch
 * something anyone can fetch.
 *
 * ## What is **not** duplicated from `features/payment`
 *
 * The transport differs; nothing else does. This hook reuses that feature's
 * `checkoutReducer` (so there is one definition of "what is happening right now"),
 * `runSettlePoll` (so there is **one** settle schedule in the app — legacy's three copies are the
 * reason the feature exists), `settledFrom`, `parseCheckoutAction`, `parseCheckoutCallback`,
 * `normalizeSavedCards`, `getStripe` and `useStripeConfig`. The screen reuses `PayWithCardPanel` and
 * `StripeElementsScope`.
 *
 * What it cannot reuse is `useCheckout` itself, and for exactly one reason: that hook calls
 * `useAuth()`, which throws outside `AuthProvider`. So the ~60 lines of glue around the shared
 * pieces — one `AbortController`, the visibility pause, the two `stripe.confirm*` branches — are
 * written here against the bridge. That is a marked seam: if a third transport ever appears, the
 * right move is to lift a transport-agnostic engine out of `use-checkout.ts` and have both wrap it,
 * rather than to write this a third time.
 *
 * ## The intent is minted on arrival, and exactly once
 *
 * The app has already shown its tier picker; the reader pressed pay there. So this opens on the card
 * form, not on a Continue button — legacy's behaviour and the app's expectation. Two guards:
 *
 * - **a returning redirect mints nothing.** `?payment_intent_client_secret=` means a payment exists
 *   and is coming back to be settled; a second would charge twice. Read on the **first render**,
 *   before the parameters are stripped.
 * - **once per screen**, via a ref rather than the query's own state, so StrictMode's double effect
 *   cannot ask the host twice.
 */

/** What the screen is showing. One value — the same reason `CheckoutState` is one. */
export type MembershipCheckoutStep =
    /** The tier, the cards or the intent is still being fetched. */
    | 'loading'
    /** No native host is listening. Nothing on this screen can work; see `hasBridge`. */
    | 'unsupported'
    /** The tier cannot be charged to a card: no package, or no USD price line. */
    | 'unavailable'
    /** The host refused, or the tier could not be read. `errorText` may carry the reason. */
    | 'error'
    /** The card form. `state.kind` is `card` or `confirming`. */
    | 'paying'
    /** A verdict, or the wait for one: `settling` · `slow` · `succeeded` · `failed`. */
    | 'status'

export interface MembershipCheckoutController {
    step: MembershipCheckoutStep
    /** The live checkout, for the status panel to render. */
    state: CheckoutState
    /** The tier being bought, once it resolves to something chargeable. */
    offer: CashOffer | null
    /**
     * The three figures the order card prints, reconciled — see `chargeOf`.
     *
     * `null` until the tier resolves. The **total** is the backend's own once the intent exists, so
     * what the reader agrees to is what the gateway was asked for.
     */
    charge: MembershipCharge | null
    /**
     * The space being paid: the tier payload's copy when it has one (B85), else the public profile
     * this hook fetches. `null` only while that is in flight or if it could not be read — the header
     * falls back to the handle then, and nothing else on the screen depends on it.
     */
    channel: MembershipChannel | null
    /** From the URL. The header's fallback identity when `channel` is `null`. */
    slug: string
    /** The host's saved cards. Empty until it answers, and empty is a legitimate answer. */
    cards: SavedCard[]
    /** Whether a native host is listening at all. */
    hasBridge: boolean
    /** Work is in flight; the pay button must not offer a second press. */
    isBusy: boolean
    /** The total, formatted — for the pay button and the order summary. `''` before the offer lands. */
    amountLabel: string
    /** The host's own sentence for a refused checkout, or `null`. */
    errorText: string | null
    /** The reader pressed Pay, with a saved card or the mounted `Elements`. */
    pay: (submission: CheckoutSubmission) => void
    /** Start the whole purchase again — a fresh intent, not a replay of the refused one. */
    retry: () => void
}

/** What the order card prints. See `chargeOf` for where each figure comes from. */
export interface MembershipCharge {
    /** The tier price the creator set — always the tier payload's. */
    price: number
    /** The processor's cut. Derived from `total` once that is authoritative. */
    fee: number
    /** What the card is charged. */
    total: number
}

/**
 * Reconcile the tier's arithmetic with the backend's own figure.
 *
 * `cashOffer` computes a total from a **hard-coded** rate (5.9% + $0.30 grossed up — **B71**). The
 * checkout envelope states the real one in `payment.amount`, and a live response confirms the two
 * agree today: a $1.00 tier answered `"1.38"`, which is exactly `1.00 + round((0.059 + 0.30)/0.941)`.
 *
 * So this prefers the backend's total whenever it exists and is **in the currency being displayed**,
 * and derives the fee as the difference — which keeps the three lines adding up and makes a future
 * rate change show through instead of being quietly wrong by a few cents.
 *
 * Two guards, both for payloads that should not happen and would be ugly if they did:
 * - a **different currency** falls back to the computed figures rather than printing someone else's
 *   number with a `$` in front of it;
 * - a total **below** the tier price would render a negative fee, so the fee is clamped at `0`.
 */
export function chargeOf(offer: CashOffer, charged: ChargedAmount | null): MembershipCharge {
    if (!charged || (charged.currency !== null && charged.currency !== USD)) {
        return { price: offer.usd, fee: offer.fee, total: offer.total }
    }
    return {
        price: offer.usd,
        fee: Math.max(0, Math.round((charged.amount - offer.usd) * 100) / 100),
        total: charged.amount,
    }
}

/** The one currency this screen displays. `payment_price_usd` is USD-only too — `docs/PAYMENT.md`. */
const USD = 'USD'

/**
 * One `createStripeCallback` reply → one of three answers.
 *
 * The same three rules `settle-outcome.ts` states for the HTTP path, against the bridge's envelope
 * instead of an `ApiError`: a success is settled (`settledFrom` reads the `type` for the copy),
 * `PM0003` is *not yet*, and anything else the host actually answered is a refusal. A **transport**
 * failure is not mapped at all — it is rethrown, so `runSettlePoll` tolerates a few and then lands
 * the flow in `slow`. Telling somebody whose money has left that their payment failed, because the
 * host was slow to answer, is the most expensive wrong answer on this path.
 */
function settleOutcomeFromReply(reply: NativeReply): SettleOutcome {
    if (reply.success) return settledFrom(reply.data)
    if (reply.code === PENDING_SETTLEMENT_CODE) return { status: 'pending' }
    return { status: 'rejected', text: reply.message, code: reply.code }
}

/**
 * Resolves when the tab is worth polling from again, or when the flow is abandoned.
 *
 * Lifted from `use-checkout.ts` for the reason in the hook's note. It resolves on **abort** as well
 * as on visibility, because a promise that only ever resolves on `visibilitychange` is a listener and
 * a pending continuation left behind on a tab nobody looks at again.
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

/** Stripe's own message for a declined card. Written for the person paying, so it is shown. */
function stripeErrorText(error: { type?: string; message?: string } | undefined): string | null {
    if (!error) return null
    if (error.type !== 'card_error' && error.type !== 'validation_error') return null
    const message = error.message?.trim()
    return message ? message : null
}

export function useMembershipCheckout({
    slug,
    packageId,
}: {
    slug: string
    packageId: string
}): MembershipCheckoutController {
    const { currentLanguage } = useTranslation()
    const [state, dispatch] = useReducer(checkoutReducer, IDLE)

    /**
     * Whether a native host is listening — read **once**, on the first render.
     *
     * A snapshot rather than a live read, so the screen cannot change its mind halfway through a
     * payment because a handler was replaced. It also gates every query below: without a host there
     * is nothing to buy with, and asking the API for a tier nobody can pay for is a request for a
     * screen that is about to say "unsupported".
     */
    const [hasBridge] = useState(hasNativeBridge)

    /**
     * Whether this document was **entered** carrying a payment coming back to be settled.
     *
     * A lazy `useState` initialiser, so it is evaluated during the first render — before the effect
     * below strips the parameters. A ref written in an effect would be a render too late, which is
     * exactly long enough to ask the host for a second PaymentIntent.
     *
     * **`card-setup` does not count**: a `setup_intent_…` secret is a card being *saved*, and nothing
     * on this screen creates one. Treating it as a payment in flight would leave the screen waiting
     * for a settle nobody is going to start.
     */
    const [entryIntent] = useState(() => {
        if (typeof window === 'undefined') return null
        const intent = parseCheckoutCallback(window.location.search)
        return intent && intent.kind === 'payment' ? intent : null
    })

    /*
     * The publishable key, asked for only once a checkout is live. `StripeElementsScope` asks for it
     * too and the two share one query.
     */
    const { publishableKey } = useStripeConfig({ enabled: state.kind !== 'idle' })

    /**
     * The tier — **plain HTTP, no account**.
     *
     * Legacy fetches this the same way for the same reason: the offer is public, and the key is the
     * slug and the package, not the reader. There is no `accountId` to scope it to on this screen,
     * so the ETag store files it under its anonymous scope, which is correct — everybody sees the
     * same prices.
     */
    const packageQuery = useQuery({
        queryKey: ['webview-membership', 'package', slug, packageId],
        queryFn: ({ signal }) => membershipApi.getChannelPackage({ slug, packageId, signal }),
        enabled: hasBridge && Boolean(slug) && Boolean(packageId),
    })

    /**
     * The creator being paid — **its own public GET, in parallel with the tier.**
     *
     * It used to lean on `membershipPackageSchema.channel` alone and fall back to `@{slug}` from the
     * URL, which meant the header of a *checkout* screen showed a handle instead of the space
     * whenever that field turned out not to exist — and whether it exists is still **B85**. Guessing
     * is the wrong trade here: this is the line that tells somebody who they are about to pay.
     *
     * Legacy makes the same call from the same screen for the same reason. It is public, so it needs
     * no bearer — which is what makes it available to a webview that has none.
     *
     * **Not gated on the tier's answer.** Waiting to see whether the package carried a channel would
     * serialise two requests and delay the header behind the price; the tier's copy is still preferred
     * when it is there, so the day B85 says it always is, this query can simply be dropped.
     */
    const creatorQuery = useQuery({
        queryKey: ['webview-membership', 'creator', slug],
        queryFn: ({ signal }) => creatorApi.getCreator({ slug, signal }),
        enabled: hasBridge && Boolean(slug),
        staleTime: Number.POSITIVE_INFINITY,
    })

    const offer = cashOffer(packageQuery.data)
    const channel = packageQuery.data?.channel ?? creatorQuery.data ?? null

    /**
     * What the backend said this flow will charge, once the intent exists.
     *
     * State rather than a ref: the order card and the Pay button both render from it. Cleared when a
     * new intent is asked for, so a retry cannot print the previous attempt's figure.
     */
    const [charged, setCharged] = useState<ChargedAmount | null>(null)

    /*
     * One reconciliation, read by both the summary and the button — they must never name two
     * different numbers for the same purchase.
     */
    const charge = offer ? chargeOf(offer, charged) : null
    const amountLabel = charge
        ? formatFiatAmount(charge.total, DEFAULT_CURRENCY, currentLanguage)
        : ''

    /**
     * The saved cards — **from the host**, not from `payment/v3/my-payment-methods/`.
     *
     * `retry: false`: the bridge's failures are not transient in the way an HTTP 5xx is. No host, a
     * refused message, or a deadline passed will all be the same on a second ask, and a payment
     * screen should not spend its first seconds retrying something that cannot change.
     *
     * A failure is **not** fatal here and does not gate the screen: with no list the card panel opens
     * on its new-method form, which can complete the payment on its own. Legacy blocks the whole
     * checkout behind this call returning.
     */
    const cardsQuery = useQuery({
        queryKey: ['webview-membership', 'cards'],
        queryFn: async () => {
            const reply = await nativeBridge.getPaymentMethods()
            return reply.success ? normalizeSavedCards(reply.data) : []
        },
        enabled: hasBridge,
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
    })

    /*
     * Mirrors, written during render. Every handler below is async and has to read the *current*
     * value at the moment it is entered; an effect-written mirror is a tick behind.
     */
    const stateRef = useRef(state)
    stateRef.current = state
    const publishableKeyRef = useRef(publishableKey)
    publishableKeyRef.current = publishableKey

    /** The live flow's controller. Aborting it ends the poll and everything in flight. */
    const flowRef = useRef<AbortController | null>(null)
    const abortFlow = useCallback(() => {
        flowRef.current?.abort()
        flowRef.current = null
    }, [])

    /*
     * Unmount — the one teardown the browser does not announce, and the one legacy misses. Without it
     * a poll outlives the tree that started it and keeps asking the host about a payment nobody is
     * waiting on.
     */
    useEffect(() => () => abortFlow(), [abortFlow])

    /** The one settle loop, shared with the website through `runSettlePoll`. */
    const settle = useCallback(async (clientSecret: string) => {
        const controller = new AbortController()
        flowRef.current?.abort()
        flowRef.current = controller
        const { signal } = controller

        try {
            const result = await runSettlePoll({
                check: async () => {
                    const reply = await nativeBridge.stripeCallback({ clientSecret })
                    return settleOutcomeFromReply(reply)
                },
                signal,
                onPending: () => dispatch({ type: 'SETTLE_PENDING' }),
                waitUntilActive: () => waitUntilVisible(signal),
            })

            if (signal.aborted || result.status === 'aborted') return
            if (result.status === 'settled') {
                dispatch({ type: 'SETTLED', purchaseType: result.purchaseType })
                return
            }
            if (result.status === 'rejected') {
                dispatch({ type: 'REJECTED', text: result.text })
                return
            }
            dispatch({ type: 'EXHAUSTED' })
        } catch {
            /*
             * The transport gave up. This is **not** `failed`: the host being unreachable says nothing
             * about whether the charge landed. `slow` is the honest state — still processing.
             */
            if (!signal.aborted) dispatch({ type: 'EXHAUSTED' })
        } finally {
            if (flowRef.current === controller) flowRef.current = null
        }
    }, [])

    /** Ask the host to mint the intent, and enter the state its answer describes. */
    const begin = useCallback(
        async (order: CashOffer) => {
            abortFlow()
            setCharged(null)
            dispatch({
                type: 'START',
                order: {
                    kind: 'membership',
                    packageId: order.packageId,
                    priceId: order.priceId,
                    amountLabel: amountLabelRef.current,
                },
            })

            try {
                const reply = await nativeBridge.membershipCheckout({
                    packageId: order.packageId,
                    priceInfo: {
                        id: order.price.id ?? order.priceId,
                        amount: order.price.amount,
                        amount_currency: order.price.amount_currency ?? 'USD',
                    },
                })

                if (!reply.success) {
                    dispatch({
                        type: 'FAILED',
                        messageKey: CHECKOUT_ERROR_KEYS.generic,
                        text: reply.message,
                    })
                    return
                }

                setCharged(parseChargedAmount(reply.data))
                dispatch({ type: 'ACTION', action: parseCheckoutAction(reply.data) })
            } catch (error) {
                /*
                 * A bridge failure, not a payment failure. It gets the generic key and, for the one case
                 * worth naming, nothing else: `unavailable` means the screen should not have got this far
                 * and `resolveStep` already draws `unsupported` for it.
                 */
                dispatch({
                    type: 'FAILED',
                    messageKey: CHECKOUT_ERROR_KEYS.generic,
                    text: error instanceof NativeBridgeError ? null : null,
                })
            }
        },
        [abortFlow],
    )

    const amountLabelRef = useRef(amountLabel)
    amountLabelRef.current = amountLabel

    /** The one intent this screen may mint. A ref, so StrictMode's double effect cannot ask twice. */
    const startedRef = useRef(false)

    useEffect(() => {
        if (entryIntent || startedRef.current) return
        if (!hasBridge || !offer) return
        startedRef.current = true
        void begin(offer)
    }, [entryIntent, hasBridge, offer, begin])

    /**
     * Finish a payment that came back from 3DS, and take the secret off the URL.
     *
     * The inline version of `useCheckoutCallback`, which cannot be used here for the same reason
     * `useCheckout` cannot: it reads `useAuth`. `history.replaceState` rather than the router, because
     * this is housekeeping on a screen with no navigation — and every second the secret stays in the
     * address bar is a second it can be reloaded into a second settle.
     */
    /**
     * The secret this screen has resumed. Not a plain "done" flag — see the effect.
     */
    const resumedRef = useRef<string | null>(null)

    useEffect(() => {
        if (!entryIntent) return
        /*
         * ⚠ The guard is **"already resumed *and* still polling"**, not "already resumed".
         *
         * A plain once-flag deadlocks under React's development double-mount: the first pass starts
         * the poll, the simulated unmount runs the teardown below and aborts it, and the second pass
         * sees the flag and does not restart — leaving the screen on *Processing your payment* for
         * ever, with no request in flight. Found in the browser, not by a test: the bridge log showed
         * `myPaymentMethods` and never a `createStripeCallback`.
         *
         * Keying on the secret keeps the property that matters (one settle per payment, never a second
         * intent) while letting a torn-down flow be picked back up, which is also the right answer for
         * any future remount.
         */
        if (resumedRef.current === entryIntent.clientSecret && flowRef.current) return
        resumedRef.current = entryIntent.clientSecret
        /* Blocks the auto-start effect too: a returning payment must never mint a second intent. */
        startedRef.current = true
        dispatch({ type: 'RESUME', settleRef: entryIntent.clientSecret })
        void settle(entryIntent.clientSecret)

        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href)
            for (const key of [
                'payment_intent',
                'payment_intent_client_secret',
                'redirect_status',
            ]) {
                url.searchParams.delete(key)
            }
            window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
        }
    }, [entryIntent, settle])

    /** The reader pressed Pay. Two Stripe calls, and the branch is which one Stripe has. */
    const pay = useCallback(
        ({ elements, paymentMethodId }: CheckoutSubmission) => {
            const current = stateRef.current
            if (current.kind !== 'card') return
            const { clientSecret } = current

            const key = publishableKeyRef.current
            if (!key || (!elements && !paymentMethodId)) {
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

                    const returnUrl =
                        typeof window === 'undefined'
                            ? ''
                            : `${window.location.origin}${window.location.pathname}`

                    /*
                     * `return_url` goes to both: a saved card can still be sent through 3DS, and
                     * without it that hop has nowhere to come back to.
                     */
                    const result = paymentMethodId
                        ? await stripe.confirmCardPayment(clientSecret, {
                              payment_method: paymentMethodId,
                              return_url: returnUrl,
                          })
                        : await stripe.confirmPayment({
                              elements: elements as StripeElements,
                              confirmParams: { return_url: returnUrl },
                          })

                    /*
                     * Checked **before** anything is read off the result. Legacy reads `error.type`
                     * unguarded, so a success that did not redirect is a TypeError — bug #4 in
                     * `docs/PAYMENT.md`.
                     */
                    if (result.error) {
                        dispatch({ type: 'CONFIRM_FAILED', text: stripeErrorText(result.error) })
                        return
                    }

                    dispatch({ type: 'CONFIRMED' })
                    await settle(clientSecret)
                } catch {
                    dispatch({ type: 'CONFIRM_FAILED', text: null })
                }
            })()
        },
        [settle],
    )

    const retry = useCallback(() => {
        /*
         * Two different retries behind one control, because the reader pressed the same button for the
         * same reason. With no offer the tier is what failed, so the fix is to read it again — and the
         * auto-start effect then mints the intent on its own. With one, the *payment* failed.
         */
        if (!offer) {
            void packageQuery.refetch()
            return
        }
        /*
         * Back to `idle` first: the reducer refuses a `START` from a non-terminal state, so a retry
         * pressed from `slow` would otherwise be swallowed with no indication. And it is a **new**
         * intent, never a replay — the old one has been confirmed and refused. Legacy's Retry is
         * `router.reload()`, which achieves this by throwing the whole document away.
         */
        dispatch({ type: 'CLOSE' })
        void begin(offer)
    }, [begin, offer, packageQuery.refetch])

    const errorText = state.kind === 'failed' ? state.text : null

    return {
        step: resolveStep({
            state,
            hasBridge,
            enteredOnCallback: entryIntent !== null,
            isPackageLoading: packageQuery.isPending,
            isPackageError: packageQuery.isError,
            hasOffer: Boolean(offer),
        }),
        state,
        offer,
        charge,
        channel,
        slug,
        cards: cardsQuery.data ?? [],
        hasBridge,
        isBusy: isCheckoutBusy(state),
        amountLabel,
        errorText,
        pay,
        retry,
    }
}

/**
 * Which of the six the screen draws — one function, so the precedence is stated once rather than
 * re-derived by every branch of the JSX.
 *
 * **The machine wins over everything below it.** Once a payment exists, what happened to it is the
 * only thing worth saying: a tier refetch that fails while the money is settling must not replace the
 * outcome with "this tier could not be loaded". Legacy has no ordering at all — its provider tests
 * `errorMsg`, then loading, then the result, so a late error blanks a success.
 */
function resolveStep({
    state,
    hasBridge,
    enteredOnCallback,
    isPackageLoading,
    isPackageError,
    hasOffer,
}: {
    state: CheckoutState
    hasBridge: boolean
    enteredOnCallback: boolean
    isPackageLoading: boolean
    isPackageError: boolean
    hasOffer: boolean
}): MembershipCheckoutStep {
    switch (state.kind) {
        case 'card':
        case 'confirming':
            return 'paying'
        case 'settling':
        case 'slow':
        case 'succeeded':
        case 'failed':
            return 'status'
        case 'creating':
        case 'leaving':
            return 'loading'
        case 'embedded':
            /*
             * A membership intent is always Stripe today. If billy ever answers `CODA`, this screen has
             * no iframe to host it — and saying so is better than a blank panel over a live checkout.
             */
            return 'unavailable'
        default:
            break
    }

    /* Nothing on this screen works without a host, so it outranks the tier entirely. */
    if (!hasBridge) return 'unsupported'
    /*
     * A returning redirect is a payment in flight even before the effect above has run. Without this
     * the first frame after the hop renders the *tier* branches — briefly "unavailable" on a slow
     * fetch — over a payment about to be settled.
     */
    if (enteredOnCallback) return 'loading'
    if (isPackageLoading) return 'loading'
    if (isPackageError) return 'error'
    if (!hasOffer) return 'unavailable'
    return 'loading'
}
