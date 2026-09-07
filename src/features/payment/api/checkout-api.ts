import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type CheckoutAction, parseCheckoutAction } from '../lib/checkout-action'
import type { CheckoutContext, CheckoutOrder } from '../lib/checkout-order'
import { checkoutRequest } from '../lib/checkout-order'
import { settledFrom, settleOutcomeFromError } from '../lib/settle-outcome'
import type { SettleOutcome, StarTransactionPage } from './types'
import { normalizeStarTransactions } from './types'

/**
 * Starting a payment, asking whether it settled, and the billing portal — `paymee`.
 *
 * ## The three calls, and what each is allowed to decide
 *
 * - `create` returns a **`CheckoutAction`**, never a raw body. Whatever the backend answers is parsed
 *   into the union `lib/checkout-action.ts` owns, so no caller branches on `action_data` and an
 *   unknown gateway cannot become a dialog nobody can finish.
 * - `settle` / `settleGateway` return a **`SettleOutcome`**, and the mapping from HTTP to that is in
 *   `lib/settle-outcome.ts` because it is the contract worth testing: `PM0003` is pending, another
 *   4xx is a refusal, and a 5xx is neither — it is rethrown for the poller to ride out.
 * - `getBillingPortal` returns a URL to open, or `null`.
 *
 * ## Nothing here is ever retried
 *
 * `apiClient` replays a `POST` only with `{ retry: true }`, and no call in this file passes it.
 * `create` starts a charge; a 502 arriving *after* the intent was created would create a second one.
 * Legacy has the opposite default — `models/api.js` retries **every** non-GET request on a 5xx or a
 * network error, with no idempotency key anywhere (**B62**), which is a charge-twice waiting for a
 * bad minute on the network.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/paymee` })

/** Raised when a `handoff` order reaches `create` — a programming error, not a payment failure. */
export class NoCheckoutRequestError extends Error {
    constructor() {
        super(
            'A handoff order is created by the feature that owns its endpoint, not by checkoutApi',
        )
        this.name = 'NoCheckoutRequestError'
    }
}

interface Scope {
    accountId?: string | null
    signal?: AbortSignal
}

function config({ accountId, signal }: Scope) {
    return { signal, ...(accountId ? { accountId } : {}) }
}

/**
 * Legacy's page size for the history dialog, kept so a page boundary lands where it always has.
 * Ten rows is also about a dialog's worth before it scrolls.
 */
export const TRANSACTIONS_PAGE_SIZE = 10

export const checkoutApi = {
    /**
     * This account's Star purchases, newest first — the **same path** `create` posts to.
     *
     * That collision is the backend's, not a mistake here: `checkout/v3/checkout/` is a collection,
     * so `POST` starts one and `GET` lists them. Worth saying out loud because the two could not be
     * more different in consequence, and a reader skimming this file will see the same string twice.
     *
     * `page` is 1-based, as legacy sends it. `accountId` is pinned by every caller for the reason
     * `starLedgerApi` states: the account is derived from the bearer, so a reader with ten of them
     * gets whichever was active when the request left, filed under whichever key it was asked for.
     */
    async list({
        page,
        accountId,
        signal,
    }: Scope & { page: number }): Promise<StarTransactionPage> {
        const body = await api.get<unknown>(
            'checkout/v3/checkout/',
            { page, page_size: TRANSACTIONS_PAGE_SIZE },
            config({ accountId, signal }),
        )
        return normalizeStarTransactions(body)
    },

    /**
     * Start a payment. Answers what to do next.
     *
     * `context` carries the return URLs and the timezone — built by `lib/return-url.ts` from the
     * app's configured origin, never from `window.location`, because this string is handed to a third
     * party and comes back as a navigation.
     */
    async create({
        order,
        context,
        accountId,
        signal,
    }: { order: CheckoutOrder; context: CheckoutContext } & Scope): Promise<CheckoutAction> {
        const request = checkoutRequest(order, context)
        if (!request) throw new NoCheckoutRequestError()

        const body = await api.post<unknown>(
            request.path,
            request.body,
            config({ accountId, signal }),
        )
        return parseCheckoutAction(body)
    },

    /**
     * Has this PaymentIntent settled? — `payment/v3/stripe/callback/`.
     *
     * Called once after `stripe.confirm*` resolves and then on the schedule in `lib/settle-poll.ts`.
     * The backend, not Stripe's own `redirect_status`, is the authority: it is what recorded the
     * purchase, and the URL parameter is attacker-controllable.
     *
     * ⚠ **`enveloped: false`, and this is the one endpoint in the app that needs it.** Both callbacks
     * answer a **flat** body — `{ code, payment, type, data }` — while every other `paymee` endpoint
     * wraps in `{ data }` (checked against legacy, which reads `res.data.type` here and
     * `res.data.data` for checkout, payment-methods and packages). The body then has a `data` key of
     * its own, so the client's origin-wide unwrap answered **that** field: `null`, on a payment that
     * had gone through, which the success dialog printed as the Star copy for a donation. **B70.**
     */
    async settle({
        clientSecret,
        accountId,
        signal,
    }: { clientSecret: string } & Scope): Promise<SettleOutcome> {
        try {
            const body = await api.post<unknown>(
                'payment/v3/stripe/callback/',
                { clientSecret },
                { ...config({ accountId, signal }), enveloped: false },
            )
            return settledFrom(body)
        } catch (error) {
            return settleOutcomeFromError(error)
        }
    },

    /**
     * The same question for a non-Stripe gateway — `payment/v3/redirect-callback/`.
     *
     * The gateway's whole query string is forwarded, as legacy does: this client has no way to know
     * which parameters a given provider signs its result with, so filtering them would be guessing
     * on the provider's behalf. They are read back off the URL by `lib/checkout-callback.ts`, which
     * drops blanks and nothing else.
     */
    async settleGateway({
        params,
        accountId,
        signal,
    }: { params: Record<string, string> } & Scope): Promise<SettleOutcome> {
        try {
            const body = await api.post<unknown>('payment/v3/redirect-callback/', params, {
                ...config({ accountId, signal }),
                enveloped: false,
            })
            return settledFrom(body)
        } catch (error) {
            return settleOutcomeFromError(error)
        }
    },

    /**
     * Stripe's own billing portal — where a card subscription is managed and its invoices read.
     *
     * `null` when the service answered without a URL, so the caller renders no button rather than one
     * that opens `about:blank`. Legacy renders the button whenever the request came back at all, and
     * fetches the portal link for **every** visitor to `/premium` including those who have never
     * bought anything — this is a call made on a press, not on a mount.
     */
    async getBillingPortal({
        successUrl,
        accountId,
        signal,
    }: { successUrl: string } & Scope): Promise<string | null> {
        const body = await api.get<unknown>(
            'payment/v3/stripe/portal/',
            { success_url: successUrl },
            config({ accountId, signal }),
        )
        /*
         * ⚠ **`redirect_url`, and this field was guessed wrong.**
         *
         * It read `url` until a captured response showed
         * `{ "data": { "redirect_url": "https://billing.stripe.com/p/session?secret=…" } }` — which
         * is also what legacy reads (`stripePortal?.redirect_url`). The guess did not fail loudly:
         * this resolves `null` for a body it cannot read, so **every** press of *Manage in Stripe*
         * fell into the "no portal for this account" branch and toasted. A dead button, on the one
         * control a subscriber uses to cancel.
         *
         * It survived because the *test* was written from the same guess as the code
         * (`get.mockResolvedValue({ url: … })`), which is the one thing a test cannot check about
         * itself. The case below now uses the captured body.
         *
         * The URL carries a **session secret** in its query. That is why the caller is a mutation
         * rather than a query (`useBillingPortal`): it must not enter the query cache, be logged, or
         * be replayed on a second press after Stripe has expired it.
         */
        const url = (body as { redirect_url?: unknown })?.redirect_url
        return typeof url === 'string' && url.trim() !== '' ? url.trim() : null
    },
}
