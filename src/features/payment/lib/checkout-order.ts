import { STRIPE_GATEWAY_ID } from '../api/types'
import type { CheckoutAction } from './checkout-action'

/**
 * What is being bought — and, for four of the five kinds, the request that buys it.
 *
 * ## An order, not a payload
 *
 * Every surface that takes money (the Star sheet, the donation dialog, a membership tier, Premium)
 * builds one of these and hands it over. None of them knows a URL, a `timezone`, a `clientSecret`,
 * or that Stripe exists — legacy has each screen assemble its own body, which is how its Premium
 * flow ended up sending `payment_method: 'gw.stripe'` hard-coded while the Star flow sends the
 * gateway the reader actually picked.
 *
 * ## `handoff` is the boundary, not a special case
 *
 * A membership is bought from **billy** (`v3/subscription/.../subscribe/`), which is
 * `features/membership`'s endpoint, not this feature's. So that feature calls its own API, gets
 * the same `{ action, action_data }` envelope back, parses it with `parseCheckoutAction`, and hands
 * the *action* over. This feature completes payments; it does not own every endpoint that starts one.
 * Without that kind, `features/payment` would have to import another feature's API surface to do its
 * job — exactly the coupling the boundary rules in CLAUDE.md exist to prevent.
 */
/**
 * The amount, formatted, for the Pay button — and the **only** display field on an order.
 *
 * The button that takes money has to say how much, and the currency, the decimals and the symbol
 * position are all things only the surface that built the order knows: a Star package's total comes
 * out of `gatewayTotal` in the gateway's currency, a donation is USD, a membership tier is whatever
 * its price line says. Deriving it in the card panel would mean the panel knowing all three.
 *
 * Optional, because a `handoff` created by another feature may genuinely not have one, and a button
 * reading `Pay` is better than one reading `Pay undefined`.
 */
interface OrderLabel {
    amountLabel?: string
}

export type CheckoutOrder = OrderLabel &
    /**
     * Star. ⚠ `quantity` is the **Star count**, which is what legacy sends and what the backend
     * prices — the package id is never transmitted. See **B63**.
     */
    (
        | { kind: 'stars'; gatewayId: string; quantity: number }
        /** A card donation. `channelId`, not the slug: legacy's `checkout/donation/` takes the id. */
        | {
              kind: 'donation'
              gatewayId: string
              channelId: string
              amountUsd: number
              message?: string
          }
        /** Premium for oneself. */
        | { kind: 'premium'; gatewayId: string; priceId: string; savePaymentInfo?: boolean }
        /** Premium for somebody else. `giftToken` is carried back on the success URL, as legacy does. */
        | {
              kind: 'gift-premium'
              gatewayId: string
              priceId: string
              receiverUserId: string
              giftToken: string
              savePaymentInfo?: boolean
          }
        /** Another feature already created the intent; this one only finishes it. See above. */
        | { kind: 'handoff'; source: 'membership'; action: CheckoutAction }
        /**
         * A membership tier being bought inside the **native app's webview**, where the host owns the
         * session and mints the intent over the JS bridge (`features/membership`'s webview checkout).
         *
         * Its own kind rather than a `handoff`, because a handoff *already has* its action and this one
         * does not: the order exists from the moment the reader arrives, while the bridge is still being
         * asked. Reusing `handoff` would mean parking a placeholder action in the order for the whole
         * `creating` state — a field that is a lie until it is replaced, which is the class of mistake
         * `settleRef` was introduced to fix.
         *
         * `checkoutRequest` builds nothing for it, exactly as for a handoff: billy owns the endpoint and
         * the host makes the call. Nothing on the website can construct one.
         */
        | { kind: 'membership'; packageId: string; priceId: string }
    )

/** Everything the request needs that the *order* has no business knowing. */
export interface CheckoutContext {
    /** Absolute, same-origin. Built by `lib/return-url.ts` — never from raw `window.location`. */
    successUrl: string
    failUrl: string
    /** IANA zone. Passed in rather than read here so a test is not at the mercy of the host clock. */
    timezone: string
}

/** The endpoint each kind posts to, relative to `${W_API}/paymee`. */
const PATHS = {
    stars: 'checkout/v3/checkout/',
    donation: 'checkout/v3/checkout/donation/',
    premium: 'checkout/v3/checkout/premium/',
    'gift-premium': 'checkout/v3/checkout/gift-premium/',
} as const

/** `?gift_token=` on the success URL — how legacy tells the returning page which gift settled. */
function withGiftToken(successUrl: string, giftToken: string): string {
    try {
        const url = new URL(successUrl)
        url.searchParams.set('gift_token', giftToken)
        return url.toString()
    } catch {
        return successUrl
    }
}

/**
 * The request that starts this order, or `null` for a `handoff` (there is nothing to send).
 *
 * `payment_method` carries the **gateway** id, not a saved card: which card pays is decided later, in
 * the browser, against the PaymentIntent this call returns. The two are different things wearing the
 * same field name in legacy's code, and conflating them is how a `gw.stripe` string ends up where a
 * `pm_…` belongs.
 *
 * A blank `message` is omitted rather than sent as `''` — `createApiModel` strips empty params but
 * not empty body fields, and an empty note on a donation is not a note.
 */
export function checkoutRequest(
    order: CheckoutOrder,
    { successUrl, failUrl, timezone }: CheckoutContext,
): { path: string; body: Record<string, unknown> } | null {
    /*
     * Two kinds this feature does not create: a `handoff` already has its action, and a `membership`
     * is minted by the native host over the bridge. `checkoutApi.create` turns a `null` into
     * `NoCheckoutRequestError`, which is the honest failure for a caller that tried.
     */
    if (order.kind === 'handoff' || order.kind === 'membership') return null

    const common = {
        payment_method: order.gatewayId,
        success_url: successUrl,
        fail_url: failUrl,
        timezone,
    }

    switch (order.kind) {
        case 'stars':
            return { path: PATHS.stars, body: { ...common, quantity: order.quantity } }
        case 'donation':
            return {
                path: PATHS.donation,
                body: {
                    ...common,
                    channel_id: order.channelId,
                    donation_usd_amount: order.amountUsd,
                    ...(order.message?.trim() ? { message: order.message.trim() } : {}),
                },
            }
        case 'premium':
            return {
                path: PATHS.premium,
                body: {
                    ...common,
                    price_id: order.priceId,
                    save_payment_info: order.savePaymentInfo ?? false,
                },
            }
        case 'gift-premium':
            return {
                path: PATHS['gift-premium'],
                body: {
                    ...common,
                    success_url: withGiftToken(successUrl, order.giftToken),
                    price_id: order.priceId,
                    receiver_user_id: order.receiverUserId,
                    save_payment_info: order.savePaymentInfo ?? false,
                },
            }
    }
}

/**
 * Whether this order can only be paid by card.
 *
 * Donation and Premium send `gw.stripe` in legacy and have never been seen with another gateway;
 * Star genuinely offers the whole list. Used by the sheet to decide whether to draw a gateway picker
 * at all, and stated here so that decision is not re-derived per screen.
 */
export function isCardOnlyOrder(order: CheckoutOrder): boolean {
    return order.kind !== 'stars' && order.kind !== 'handoff' && order.kind !== 'membership'
}

/**
 * Whether this order can reach the **in-page card step** at all.
 *
 * Not a style question: two queries are prefetched the moment a checkout starts — the saved-card list
 * (`PaymentProvider`) and Stripe's publishable key (`useCheckout`) — because `creating` is the window
 * in which they are free, and both are needed only if the backend answers with a `card` action.
 *
 * For **Premium and gift Premium it never does.** `docs/PAYMENT.md`'s own table of action branches
 * pins those two as `REDIRECT` — Stripe's *hosted* page — so the two requests were spent on every
 * such purchase and their answers thrown away. Measured on `/gift-premium` by tracing the screen's
 * real traffic: `my-payment-methods/` and `stripe/config/` went out immediately after the checkout
 * POST, on a flow that hands the browser to Stripe a moment later.
 *
 * ## It answers `true` for everything the doc does not pin, on purpose
 *
 * `stars` takes all four branches, `donation` and `membership` are `STRIPE`, and a `handoff` already
 * *has* its action — so those keep the prefetch. The only behaviour that changes is for the two kinds
 * whose branch is documented, which is what keeps this a reading of the contract rather than a guess
 * about a response. A wrong `false` here would cost a prefetch, not correctness: the queries are
 * enabled again the moment the machine actually reaches `card`.
 */
export function mayReachCardStep(order: CheckoutOrder): boolean {
    if (order.kind === 'premium' || order.kind === 'gift-premium') return false
    // A handoff carries the answer already; anything else has not been asked yet.
    if (order.kind === 'handoff') return order.action.kind === 'card'
    return true
}

/** The default gateway for the card-only kinds. */
export const DEFAULT_GATEWAY_ID = STRIPE_GATEWAY_ID
