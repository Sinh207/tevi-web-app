/**
 * What `checkout/` told the client to do next.
 *
 * ## This union is the point of the whole feature
 *
 * Every checkout endpoint on the payments service answers the same envelope —
 * `{ action, action_data }` — and **Stripe is one of four branches**. Legacy handles the union in
 * three different places (`useGetStar`'s `switch`, an `if` in `useMembership`, another in
 * `usePremium`), which is why its Premium flow redirects to a hosted page while its Star flow mounts
 * Elements for the same act of paying. Parsing it once, here, is what lets one state machine drive
 * all of them.
 *
 * ## Fails closed
 *
 * An `action` this client does not know becomes `unsupported` rather than `card`, and the caller says
 * "this payment method is not available here" instead of mounting Elements with an empty secret. A
 * new gateway shipping server-side must not turn into a dialog that cannot be completed and cannot
 * explain itself.
 */

export type CheckoutAction =
    /** Confirm a PaymentIntent in the browser: Stripe Elements. */
    | { kind: 'card'; clientSecret: string }
    /** Leave the app — a hosted checkout page, a bank's 3DS page, a local wallet. */
    | { kind: 'redirect'; url: string }
    /** Coda: a transaction id to embed in their iframe. */
    | { kind: 'embedded'; provider: 'coda'; txnId: string }
    /** NOW Payments: an address/QR payload this client does not model yet. */
    | { kind: 'crypto'; data: Record<string, unknown> }
    /** Understood the envelope, not the instruction. Carries what arrived, for the error copy. */
    | { kind: 'unsupported'; action: string }

/**
 * Only `http(s)` survives.
 *
 * The client **navigates** to this string, so a payload carrying `javascript:` or `data:` would be
 * script execution handed over by the API layer. Legacy assigns `window.location.href` to whatever
 * arrived. A protocol-relative `//host` is rejected too: `new URL` needs a base to resolve it, and
 * anything that ambiguous is not a checkout page.
 */
function safeRedirectUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (trimmed === '') return null
    try {
        const url = new URL(trimmed)
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
    } catch {
        return null
    }
}

function text(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

/**
 * Parse the envelope.
 *
 * `action` is upper-cased before comparison because legacy upper-cases it at every read, which is the
 * only evidence available that the wire is inconsistent about case (**B64**). `action_data` missing
 * the field its action needs is `unsupported`, not a half-built state: a `STRIPE` action without a
 * `clientSecret` is a backend bug, and pretending otherwise moves the failure into Stripe's iframe
 * where nothing can report it.
 */
export function parseCheckoutAction(body: unknown): CheckoutAction {
    const envelope = (body ?? {}) as { action?: unknown; action_data?: unknown }
    const action = text(envelope.action)?.toUpperCase() ?? ''
    const data = (envelope.action_data ?? {}) as Record<string, unknown>

    switch (action) {
        case 'STRIPE': {
            const clientSecret = text(data.clientSecret) ?? text(data.client_secret)
            return clientSecret ? { kind: 'card', clientSecret } : { kind: 'unsupported', action }
        }
        case 'REDIRECT': {
            const url = safeRedirectUrl(data.redirectURL) ?? safeRedirectUrl(data.redirect_url)
            return url ? { kind: 'redirect', url } : { kind: 'unsupported', action }
        }
        case 'CODA': {
            const txnId = text(data.txnId) ?? text(data.txn_id)
            return txnId
                ? { kind: 'embedded', provider: 'coda', txnId }
                : { kind: 'unsupported', action }
        }
        case 'NOW_PAYMENT':
            return Object.keys(data).length > 0
                ? { kind: 'crypto', data }
                : { kind: 'unsupported', action }
        default:
            return { kind: 'unsupported', action }
    }
}

/**
 * **What the gateway is actually going to take** — read off the same envelope, never re-derived.
 *
 * Every checkout response carries a `payment` block beside `action`, and its `amount` is the
 * PaymentIntent's own figure. Confirmed against a live membership response:
 *
 * ```json
 * { "payment": { "amount": "1.38", "amount_currency": "USD", "charge_status": "PENDING",
 *                "payment_method": { "id": "gw.stripe", … } },
 *   "action": "STRIPE", "action_data": { "clientSecret": "pi_…" } }
 * ```
 *
 * ## Why a client should prefer this to its own arithmetic
 *
 * A membership's fee is **hard-coded** in this app (5.9% + $0.30 grossed up — **B71**, answered as
 * "mirror the legacy web app"), and the accepted risk was that the day the platform renegotiates the
 * rate, every confirm screen is quietly wrong by a few cents with no request whose answer would say
 * so. This field *is* that request's answer. Reading it removes the drift entirely: the figure the
 * reader agrees to becomes the figure the intent was created for.
 *
 * ⚠ **`payment_method.fee_percent_rate` / `fee_flat_amount` are not the coefficients that produced
 * it.** The live payload above carries `25.00` and `0.60`, which on a $1.00 tier would give $1.85 —
 * the actual `1.38` is `1.00 + round((0.059·1 + 0.30) / 0.941)`. Those two fields are the *payment
 * method's* own configuration, used on other paths; applying them to a membership would overstate the
 * charge by half. This is exactly the sort of near-miss that looks like the right field.
 *
 * `null` when the block is absent or unreadable — the caller keeps its computed total, which is what
 * every screen did before this existed.
 */
export interface ChargedAmount {
    /** The figure the gateway takes. Always `> 0`. */
    amount: number
    /** ISO 4217, upper-cased. `null` when the payload carried none — the caller decides what to do. */
    currency: string | null
}

export function parseChargedAmount(body: unknown): ChargedAmount | null {
    const payment = (body as { payment?: unknown } | null | undefined)?.payment
    if (!payment || typeof payment !== 'object') return null

    const { amount, amount_currency } = payment as { amount?: unknown; amount_currency?: unknown }
    /* A decimal **string** on the wire (`"1.38"`); a number is accepted because another service on
       this API sends bare numbers for money and neither is evidence for the other. */
    const parsed =
        typeof amount === 'number'
            ? amount
            : typeof amount === 'string'
              ? Number.parseFloat(amount.trim())
              : Number.NaN
    if (!Number.isFinite(parsed) || parsed <= 0) return null

    const currency = typeof amount_currency === 'string' ? amount_currency.trim().toUpperCase() : ''
    return { amount: parsed, currency: currency || null }
}

/**
 * Whether an action can be carried out by this client at all.
 *
 * `crypto` is deliberately **not** completable yet — the panel for it is a later pass — and saying so
 * here rather than at the call site is what keeps the "we cannot finish this" copy in one place.
 */
export function isActionSupported(action: CheckoutAction): boolean {
    return action.kind === 'card' || action.kind === 'redirect' || action.kind === 'embedded'
}
