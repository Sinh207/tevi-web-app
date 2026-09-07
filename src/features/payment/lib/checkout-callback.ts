/**
 * Reading a payment's outcome out of the URL — the other half of every redirect.
 *
 * ## Why the URL is a source at all
 *
 * A card payment can leave the page: 3DS sends the browser to the bank, a hosted checkout page sends
 * it to Stripe, a local wallet sends it to the wallet. What comes back is a **plain page load** with
 * parameters on it, and at that point the client's own state is gone. So the URL is the only thing
 * that knows a payment is in flight, and reading it is not optional.
 *
 * ## Three shapes, and one of them is not a payment
 *
 * Legacy branches on `payment_intent_client_secret`, then falls through to `TxnId || gateway` and
 * forwards the **whole query** to `redirect-callback/`. Both are kept. The third —
 * `setup_intent_client_secret` — is a **card being saved**, not money moving; legacy does not model
 * it at all, and sending it to the payment callback would ask the backend about a payment that does
 * not exist.
 *
 * ## A bare `?gateway=` is not a round-trip
 *
 * `TxnId` identifies a transaction, so it is a callback by itself. `gateway` only names a *provider*,
 * and legacy's `TxnId || gateway` therefore fires the settle on any URL carrying one — with nothing
 * for `redirect-callback/` to look a payment up by. That costs a settle poll (13 requests over ~54
 * seconds, `lib/settle-poll.ts`) attributed to the reader's account, a status dialog on a page where
 * nobody paid for anything, and — because the parameters are swept once handled
 * (`hooks/use-checkout-callback.ts`) — a `gateway` parameter removed from the address bar of a screen
 * that may have meant it for itself. So `gateway` is accepted only **with at least one other
 * parameter**, which is what a real return carries (the provider's own reference, its status, its
 * signature) — and *not* one of our own (`redirect_status`, `payment_intent`), which identify no
 * payment to the gateway either. Which parameters a given provider actually sends is still open —
 * §1.4 in [`docs/PAYMENT.md`](../../../../docs/PAYMENT.md) — so the rule asks whether **anything
 * outside our own vocabulary** is present rather than naming a whitelist it would have to guess.
 *
 * ## `redirect_status` is a hint, never the verdict
 *
 * Stripe puts `succeeded` / `processing` / `failed` on the URL. It is attacker-controllable (it is a
 * query parameter) and it does not know whether *our* backend recorded the payment, so it never
 * decides anything — the backend callback does. It is carried only so the first frame can show the
 * right kind of "processing" rather than flashing a neutral spinner.
 */

/** What the URL is telling the client to go and check. */
export type CallbackIntent =
    /** A PaymentIntent to settle against `payment/v3/stripe/callback/`. */
    | { kind: 'payment'; clientSecret: string; redirectStatus: string | null }
    /** A SetupIntent that came back from a redirect — a saved card, not a charge. */
    | { kind: 'card-setup'; clientSecret: string; redirectStatus: string | null }
    /** Anything else that identifies a gateway round-trip. Forwarded whole to `redirect-callback/`. */
    | { kind: 'gateway'; params: Record<string, string> }

/**
 * The parameters this client put on its own return URLs, or that a gateway is known to add.
 *
 * Used to **strip** them once handled, so a reload does not re-run the callback (legacy replaces the
 * whole URL with its pathname, which also throws away parameters the page itself needed — `gift_token`
 * is deliberately absent from this list for that reason: it belongs to the gift screen).
 *
 * ⚠ This list is by name, so it can only sweep the names we know. A gateway's own parameters have no
 * such list — `stripHandledParams` is what clears those, and it is the sweep the callback hook uses.
 */
export const CALLBACK_PARAMS = [
    'payment_intent',
    'payment_intent_client_secret',
    'setup_intent',
    'setup_intent_client_secret',
    'redirect_status',
    'TxnId',
    'gateway',
] as const

/**
 * The same list as a set, for the gateway branch's "is this parameter *ours*" question. Derived, so
 * a parameter added above cannot be forgotten here.
 */
const OWN_PARAMS: ReadonlySet<string> = new Set(CALLBACK_PARAMS)

/**
 * Query parameters that belong to the **screen** rather than to a payment, and therefore survive a
 * sweep.
 *
 * `gift_token` is one this app puts on its own success URL (`lib/checkout-order.ts`), so the returning
 * page knows which gift settled; `tab` is what a reader was looking at when they left; and
 * `utm_campaign` is how the visitor arrived, which `features/mini-app`'s `campaignFromUrl` reads off
 * the page URL later in the session. All three arrive back on the URL alongside a gateway's own
 * parameters and are indistinguishable from them by shape.
 *
 * **The test for adding one** is that the app reads it off its *own* URL and no payment could have
 * produced it. A list by name can be forgotten, so it is worth saying which way the cost falls: a
 * screen parameter missing here is a reader returned to the default tab, while a gateway parameter
 * left on the URL is the wrong settle described in `stripHandledParams`. That is why the sweep is a
 * **denylist of everything else** and this is the exception.
 */
export const SCREEN_PARAMS = ['tab', 'gift_token', 'utm_campaign'] as const

const OWN_SCREEN_PARAMS: ReadonlySet<string> = new Set(SCREEN_PARAMS)

function toParams(search: URLSearchParams | string): URLSearchParams {
    return typeof search === 'string' ? new URLSearchParams(search) : search
}

function value(params: URLSearchParams, key: string): string | null {
    const raw = params.get(key)
    if (raw === null) return null
    const trimmed = raw.trim()
    return trimmed === '' ? null : trimmed
}

/**
 * What, if anything, this URL asks the client to do. `null` for an ordinary page load — which is the
 * overwhelmingly common case, so this runs before anything is fetched and costs nothing.
 *
 * Order is deliberate: a payment outranks a card setup, and both outrank the generic gateway branch.
 * A URL carrying both a payment intent and a `gateway` came back from a Stripe-processed local method,
 * and the intent is the more precise question to ask.
 */
export function parseCheckoutCallback(search: URLSearchParams | string): CallbackIntent | null {
    const params = toParams(search)
    const redirectStatus = value(params, 'redirect_status')

    const paymentSecret = value(params, 'payment_intent_client_secret')
    if (paymentSecret) return { kind: 'payment', clientSecret: paymentSecret, redirectStatus }

    const setupSecret = value(params, 'setup_intent_client_secret')
    if (setupSecret) return { kind: 'card-setup', clientSecret: setupSecret, redirectStatus }

    const txnId = value(params, 'TxnId')
    if (txnId || value(params, 'gateway')) {
        const forwarded: Record<string, string> = {}
        for (const [key, raw] of params.entries()) {
            if (raw.trim() !== '') forwarded[key] = raw
        }
        /*
         * `?gateway=coda` **on its own** is not a round-trip — see the note above. `TxnId` names a
         * transaction and therefore stands alone; `gateway` names a provider and needs company, and
         * the company has to be a parameter that is **not ours**. `redirect_status` is Stripe's hint
         * and `payment_intent` is our own bookkeeping: neither hands `redirect-callback/` anything to
         * look a payment up by, so `?gateway=coda&redirect_status=succeeded` is still nothing to
         * settle — and settling it would answer `rejected`, i.e. tell somebody a payment they never
         * made had failed.
         */
        const hasProviderParam = Object.keys(forwarded).some(key => !OWN_PARAMS.has(key))
        if (!txnId && !hasProviderParam) return null
        return { kind: 'gateway', params: forwarded }
    }

    return null
}

/**
 * The same query string with the callback parameters removed — `''` when nothing is left.
 *
 * Called **after** the callback has been handled, so a reload is an ordinary page load. The client
 * secret in particular must not sit in the address bar any longer than it has to: it is a bearer of
 * the payment, it lands in history, and it gets pasted into support tickets.
 */
export function stripCallbackParams(search: URLSearchParams | string): string {
    const params = new URLSearchParams(toParams(search))
    for (const key of CALLBACK_PARAMS) params.delete(key)
    return params.toString()
}

/**
 * The query string to leave behind once `intent` has been **acted on** — the sweep the callback hook
 * runs.
 *
 * ## A handled callback is spent, and a gateway's parameters have no name list
 *
 * `stripCallbackParams` can only take the names it knows, and for a Stripe return that is all of them.
 * A gateway return is the opposite: the parameters are the *provider's*, we forward them whole
 * precisely because we cannot name them (§1.4 in [`docs/PAYMENT.md`](../../../../docs/PAYMENT.md)),
 * and by the time this runs they have already been posted to `redirect-callback/` and are held in the
 * poll's closure. Nothing reads them off the URL again — so everything that is not the screen's own
 * goes, rather than only the two names we happen to recognise.
 *
 * Leaving them costs two things. The provider's reference and its signature sit in the address bar,
 * in history and in the next support ticket, which is the same argument that takes a client secret
 * off the URL. And they **nest into the next payment's return URL**: `checkoutReturnUrl` keeps
 * whatever it does not recognise, the next gateway appends its own copy of the same key, and
 * `URLSearchParams.get` answers with the **first** — so a stale reference would be forwarded as the
 * new payment's, and the settle would describe the wrong charge.
 */
export function stripHandledParams(
    search: URLSearchParams | string,
    intent: CallbackIntent,
): string {
    // A Stripe return carries only names we know, and `card-setup` is not swept here at all.
    if (intent.kind !== 'gateway') return stripCallbackParams(search)

    const kept = new URLSearchParams()
    for (const [key, raw] of toParams(search).entries()) {
        if (OWN_SCREEN_PARAMS.has(key)) kept.append(key, raw)
    }
    return kept.toString()
}

/** Whether this URL has anything for the payment feature to do. */
export function hasCheckoutCallback(search: URLSearchParams | string): boolean {
    return parseCheckoutCallback(search) !== null
}
