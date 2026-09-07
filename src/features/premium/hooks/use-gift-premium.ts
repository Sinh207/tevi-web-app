'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { DEFAULT_GATEWAY_ID, usePayment } from '@features/payment'
import { useQueryClient } from '@tanstack/react-query'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { giftRecipientApi, giftRecipientKeys } from '../api/gift-recipient-api'
import { type GiftRecipient, giftRecipientName } from '../api/gift-types'
import type { PremiumPackage } from '../api/types'
import { type GiftPlan, giftPlanOf } from '../lib/gift-plans'
import { decodeGiftToken, encodeGiftToken, type SentGift } from '../lib/gift-token'

/**
 * `/gift-premium`'s whole machine — **three steps, and every one of them derived.**
 *
 * ## The step is not stored
 *
 * Legacy holds `statusPage` in a `useState` beside `sendGiftSuccess`, `channelSelected`,
 * `packageSelected`, `confirmPurchase`, `purchasedFailed` and four loading booleans, then keeps them
 * in step by hand: `handleSendAnotherGift` and `handleBackToSearchCreator` are two identical
 * five-line functions whose job is to put four of those back, and a missed line in either is a
 * screen showing the wrong step's content. Here the step is a **function of the two facts that
 * matter**, so it cannot disagree with them:
 *
 * ```
 * a gift just settled  → 'sent'
 * a recipient is chosen → 'offer'
 * otherwise             → 'recipient'
 * ```
 *
 * "Send another gift" is therefore one line — drop the settled gift and the recipient — and so is
 * Back. There is no fourth state to forget.
 *
 * ## The settled gift comes off the URL, once, and then the URL is swept
 *
 * A gift checkout is a **hosted redirect**: the browser leaves for Stripe and returns to
 * `/gift-premium` as a fresh document with none of this state. `?gift_token=` is the only thing
 * that crosses — see `lib/gift-token.ts` for what may and may not be trusted in it, and why it
 * expires.
 *
 * Read in an effect from `window.location`, not through `useSearchParams()`, for the two reasons
 * this repo has already written down twice (`useGetStar`, `useCheckoutCallback`): that hook opts the
 * whole route into dynamic rendering or demands a Suspense boundary, and reading a URL parameter
 * *during* render makes the server's HTML disagree with the first client paint. Then swept, so a
 * reload is an ordinary arrival rather than a second congratulation — and so the recipient's handle
 * is not left in the address bar for the next screenshot.
 *
 * ⚠ The **ref** is what makes "once" true, and it is not belt-and-braces: `router` is a dependency,
 * and `replace` does not necessarily change `window.location.search` synchronously, so a re-run
 * would re-read the token and put the success screen back over whatever the reader had moved on to.
 * The same trap `useGetStar` documents for `?need=`.
 *
 * ## This hook does not take the money, and must not
 *
 * `usePayment().checkout` does, with `{ kind: 'gift-premium', … }` — an order `features/payment` has
 * carried since its first pass. The request body, the gateway, the return URLs, the timezone, the
 * `REDIRECT` branch and the account pinned at the press all belong there. What this feature knows
 * and that one does not is **which package, for whom**.
 *
 * `savePaymentInfo` is `false`, as legacy sends it: a hosted Stripe Checkout collects and stores the
 * card itself, so asking the backend to save it here would be a second consent taken on a page that
 * never showed a card field.
 *
 * ## What a failed charge looks like, and why there is no dialog for it here
 *
 * Legacy special-cases HTTP 422 into its own "Purchase failed / This user already has Tevi Premium"
 * modal. That sentence is now the **backend's**: `useCheckout` puts a 4xx body's `message` on the
 * machine and `CheckoutStatusDialog` prints it, which is `docs/API_ERRORS.md`'s rule — the API is
 * the only party that knows why *that* charge was refused, and hard-coding one reason means every
 * other 422 is described wrongly. So the confirmation steps aside on `failed` and the payment
 * feature's own dialog says what happened.
 */

/** Which of the three screens is in front of the reader. Derived — see the note above. */
export type GiftPremiumStep = 'recipient' | 'offer' | 'sent'

/**
 * Why a press could not become a charge, as a translation key — **before** any money moved.
 *
 * Its own channel rather than the checkout machine's, because these two failures happen on *this*
 * side of the request and the payment feature has no vocabulary for them: one is a recipient whose
 * user id could not be resolved, the other a recipient whose handle cannot be encoded into a return
 * URL. Both leave the reader on the confirmation with something to read and a Close button, rather
 * than in a payment dialog about a payment that was never created.
 */
export type GiftPremiumErrorKey = 'giftpremium_error_recipient'

export interface GiftPremiumFlow {
    step: GiftPremiumStep
    /** The gift that just settled, off the URL. `null` on an ordinary arrival. */
    sent: SentGift | null
    /** Who the gift is for. `null` until somebody is picked. */
    recipient: GiftRecipient | null

    /** A row in the picker was pressed. Choosing costs nothing and is not gated. */
    select: (recipient: GiftRecipient) => void
    /** Back from the offer to the picker. */
    back: () => void
    /** "Send another gift" — from the success screen back to an empty picker. */
    again: () => void

    /** The package awaiting confirmation, or `null` when no dialog is up. */
    pending: PremiumPackage | null
    /** Which card raised it — decides the plan's name in the confirmation sentence. */
    pendingPlan: GiftPlan | null
    /** A charge is being created, or the browser is leaving. Every button must be inert. */
    isBusy: boolean
    /** A "Send gift" button was pressed. Gated: a guest gets the sign-in dialog instead. */
    request: (pkg: PremiumPackage) => void
    /** "Yes" — resolves the recipient's user id and starts the checkout. */
    confirm: () => void
    /** Dismiss without buying. Refused while busy. */
    cancel: () => void

    /** Something failed before the charge existed. See {@link GiftPremiumErrorKey}. */
    errorKey: GiftPremiumErrorKey | null
    dismissError: () => void
}

/** `?gift_token=` — already in `features/payment`'s `SCREEN_PARAMS`, so a return URL keeps it. */
const GIFT_TOKEN_PARAM = 'gift_token'

/**
 * The checkout states in which this screen's own confirmation must step aside.
 *
 * The same rule, and the same list, `useSubscribePremium` and `useStarPurchase` write down: `card`
 * and `confirming` belong to `CardCheckoutDialog`, the four after them to `CheckoutStatusDialog`.
 *
 * **`leaving` is deliberately not in it.** No other dialog renders for that state, so closing would
 * leave a blank page while the browser navigates to Stripe. The confirmation keeps its pending state
 * until the page goes.
 */
const HANDED_OVER_STATES = new Set([
    'card',
    'confirming',
    'settling',
    'slow',
    'succeeded',
    'failed',
])

export function useGiftPremium(): GiftPremiumFlow {
    const { activeId } = useAuth()
    const requireAuth = useRequireAuth()
    const router = useRouter()
    const pathname = usePathname()
    const queryClient = useQueryClient()
    const { checkout, state, isBusy: isCheckoutBusy } = usePayment()

    const [sent, setSent] = useState<SentGift | null>(null)
    const [recipient, setRecipient] = useState<GiftRecipient | null>(null)
    const [pending, setPending] = useState<PremiumPackage | null>(null)
    const [errorKey, setErrorKey] = useState<GiftPremiumErrorKey | null>(null)
    /** The receiver-id lookup between "Yes" and the checkout. Part of `isBusy`, so nothing races. */
    const [isResolving, setResolving] = useState(false)

    /** See the ⚠ in this hook's note: this is what makes the token be read exactly once. */
    const readToken = useRef(false)

    useEffect(() => {
        if (readToken.current) return
        readToken.current = true

        const params = new URLSearchParams(window.location.search)
        const token = params.get(GIFT_TOKEN_PARAM)
        if (!token) return

        params.delete(GIFT_TOKEN_PARAM)
        const rest = params.toString()
        router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false })

        /*
         * The sweep happens whether or not the token was readable. An expired or malformed one has
         * been consumed either way, and leaving it on the URL means every reload re-runs a decode
         * that has already failed — with the handle still sitting in the address bar.
         */
        const gift = decodeGiftToken(token)
        if (gift) setSent(gift)
    }, [pathname, router])

    /*
     * The confirmation steps aside once another dialog owns the flow — and closes when the reader
     * comes back from Stripe with the browser's back button, which resets the machine to `idle`.
     * `startedRef` is what tells that reset apart from `idle` *before* anything was pressed, which
     * is exactly when the dialog is supposed to be open.
     */
    const startedRef = useRef(false)

    useEffect(() => {
        if (!pending) return
        if (HANDED_OVER_STATES.has(state.kind)) {
            startedRef.current = false
            setPending(null)
            return
        }
        if (startedRef.current && state.kind === 'idle') {
            startedRef.current = false
            setPending(null)
        }
    }, [pending, state.kind])

    const isBusy = isCheckoutBusy || isResolving

    /**
     * Choosing somebody, and **warming the one thing the charge will need.**
     *
     * `receiver_user_id` is a *user* id and neither list carries it reliably, so it has to be asked
     * for (`resolveReceiverId`). Asked for here rather than at the press, the round trip happens
     * while the reader is reading three prices instead of standing on a spinner after saying "Yes" —
     * and because it is the same query key, `confirm`'s `fetchQuery` is then a cache read.
     *
     * A failed prefetch is silent: `confirm` asks again and *that* is where a failure is worth
     * telling somebody about.
     */
    const select = useCallback(
        (next: GiftRecipient) => {
            setErrorKey(null)
            setRecipient(next)
            if (next.owner_id) return
            void queryClient.prefetchQuery({
                queryKey: giftRecipientKeys.receiver(next.slug, activeId),
                queryFn: ({ signal }) =>
                    giftRecipientApi.resolveReceiverId(next.slug, { accountId: activeId, signal }),
            })
        },
        [activeId, queryClient],
    )

    /** Back and "send another gift" are the same reset, minus one field. Hence two lines, not ten. */
    const back = useCallback(() => {
        if (isBusy) return
        setRecipient(null)
        setPending(null)
        setErrorKey(null)
    }, [isBusy])

    const again = useCallback(() => {
        setSent(null)
        back()
    }, [back])

    /*
     * `useCallback` on the *wrapper*, which is the idiom `useSubscribePremium` uses: three plan
     * cards take this as a prop, so its identity has to be stable.
     */
    const request = useCallback(
        (pkg: PremiumPackage) =>
            requireAuth(() => {
                /*
                 * A second press while a charge is live is dropped here as well as in the machine.
                 * `useCheckout.start` guards the *request*; this guards the **dialog**, which would
                 * otherwise re-open on the package pressed second and confirm a charge for the first.
                 */
                if (isBusy) return
                setErrorKey(null)
                setPending(pkg)
            })(),
        [requireAuth, isBusy],
    )

    const cancel = useCallback(() => {
        if (isBusy) return
        startedRef.current = false
        setPending(null)
    }, [isBusy])

    const confirm = useCallback(() => {
        if (!pending || !recipient || isBusy) return
        /*
         * `normalizePremiumPackages` drops a row with no `product_id`, so this is unreachable from
         * the screen — and it is checked rather than coerced with `?? ''`, because an empty
         * `price_id` fails as a 4xx from `checkout/` that reads to the reader as a payment problem.
         */
        const priceId = pending.product_id
        if (!priceId) return

        /*
         * Minted **before** the charge, and a `null` stops the press.
         *
         * The token is how the return trip knows who the gift was for; without it the reader comes
         * back to a success screen that can congratulate nobody. Legacy bails out here too, and it
         * is the one piece of its error handling on this screen worth keeping verbatim.
         */
        const giftToken = encodeGiftToken({
            slug: recipient.slug,
            name: giftRecipientName(recipient),
            days: pending.duration_days,
        })
        if (!giftToken) {
            setErrorKey('giftpremium_error_recipient')
            return
        }

        /*
         * Already in hand ⇒ no request at all. The prefetch in `select` means the `fetchQuery` below
         * is normally a cache read too; it is still `await`ed rather than read synchronously, so a
         * cold cache (a reload on the offer step, a prefetch that failed) is *correct* rather than
         * merely unlikely.
         */
        setResolving(true)
        void (async () => {
            try {
                const receiverUserId =
                    recipient.owner_id ??
                    (await queryClient.fetchQuery({
                        queryKey: giftRecipientKeys.receiver(recipient.slug, activeId),
                        queryFn: ({ signal }) =>
                            giftRecipientApi.resolveReceiverId(recipient.slug, {
                                accountId: activeId,
                                signal,
                            }),
                    }))

                if (!receiverUserId) {
                    setErrorKey('giftpremium_error_recipient')
                    return
                }

                startedRef.current = true
                checkout({
                    kind: 'gift-premium',
                    gatewayId: DEFAULT_GATEWAY_ID,
                    priceId,
                    receiverUserId,
                    giftToken,
                    savePaymentInfo: false,
                })
            } catch {
                /*
                 * The lookup itself failed — a 404 for a space that has just been renamed, a 502,
                 * an offline browser. Deliberately **not** routed through the checkout machine's
                 * failure state: nothing was charged, so a dialog headed by a payment error would
                 * describe the wrong thing. The reader is told the recipient could not be reached
                 * and the confirmation is still there to try again from.
                 */
                setErrorKey('giftpremium_error_recipient')
            } finally {
                setResolving(false)
            }
        })()
    }, [activeId, checkout, isBusy, pending, queryClient, recipient])

    const dismissError = useCallback(() => setErrorKey(null), [])

    return {
        /*
         * `sent` outranks `recipient`, and the order is load-bearing: returning from Stripe on a
         * page whose picker was still mounted must show the congratulation, not the offer.
         */
        step: sent ? 'sent' : recipient ? 'offer' : 'recipient',
        sent,
        recipient,
        select,
        back,
        again,
        pending,
        pendingPlan: pending ? giftPlanOf(pending) : null,
        isBusy,
        request,
        confirm,
        cancel,
        errorKey,
        dismissError,
    }
}
