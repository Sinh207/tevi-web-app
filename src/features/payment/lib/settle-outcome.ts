import { ApiError } from '@shared/lib/api/errors'
import { PENDING_SETTLEMENT_CODE, type SettleOutcome } from '../api/types'

/**
 * Turning one callback response into one of three answers.
 *
 * ## The mapping is the contract, so it is tested rather than inlined
 *
 * `payment/v3/stripe/callback/` says "settled" with a 2xx and everything else with a non-2xx — which
 * means the interesting logic lives in the **error** path, and legacy writes it out by hand at three
 * call sites (`res?.response?.data?.code === 'PM0003'`, reading a rejected promise's body as though
 * it had resolved). Three copies, none of which distinguishes a declined card from a 502.
 *
 * ## Three answers, and one non-answer
 *
 * | wire | meaning | here |
 * |---|---|---|
 * | 2xx | money moved | `settled` |
 * | non-2xx + `PM0003` | the bank has not decided | `pending` — ask again |
 * | 401 · 403 · 404 · 408 | **the request** could not be asked | **rethrown** |
 * | other 4xx | refused, terminally | `rejected` |
 * | 5xx · network · 429 | **the request** failed, not the payment | **rethrown** |
 *
 * The rethrown rows are the point. A 502 while polling says nothing about whether the charge landed,
 * so turning it into `rejected` would tell somebody their payment failed on the evidence of our own
 * server having a bad minute. It is rethrown, and `runSettlePoll` treats a few of them as noise
 * before giving up.
 *
 * ⚠ **A 4xx is not automatically a verdict, and this is the case that was wrong here.** The settle
 * window is ~54 seconds (`lib/settle-poll.ts`), which is long enough for an access token to expire
 * mid-poll — and a `401` from a refresh that failed says the client could not *ask*, not that the
 * gateway refused. Reported as `rejected`, the reader whose money had already left was told the
 * payment failed and offered a Retry that would charge them again. `403` (this account may not read
 * that intent), `404` (the backend has not recorded it *yet*) and `408` are the same kind of answer.
 * They rethrow, which lands the flow in `slow` — "still processing" — which is the honest state.
 */

/**
 * `type` off a successful body — used only to pick the success copy, never to decide anything.
 *
 * ## The body is **not** enveloped, and that cost a wrong dialog
 *
 * A live 2xx is flat:
 *
 * ```json
 * { "code": "5767679921",
 *   "payment": { "id": "01a0…", "gateway": "gw.stripe", "amount": "1.38",
 *                "amount_currency": "USD", "charge_status": "CHARGED", "payment_method": { … } },
 *   "type": "direct_donation", "data": null }
 * ```
 *
 * Every other `paymee` endpoint wraps its payload in `{ data }`, so `apiClient` unwraps by origin —
 * and this body's own `data` field is what that rule then returned: `null`. A donation that had
 * actually been charged came back with no `type` at all and the dialog printed the **Star** copy,
 * "your balance has been updated", with a Get-more button under it. The endpoint is opted out at the
 * call site (`checkout-api.ts`, `enveloped: false`), which is the fix; reading through one level of
 * envelope here as well is the belt to that braces, so that the day this endpoint is brought in line
 * with the rest nothing silently regresses in the other direction.
 *
 * - **`charge_status` is deliberately not a condition.** A 2xx is the verdict, `PM0003` is "not yet",
 *   and those two already cover the question. Requiring `CHARGED` would mean guessing the rest of that
 *   vocabulary — if a Star purchase answers `SUCCEEDED`, or omits the field, a strict check would
 *   report a *failure* on a payment that went through, which is far worse than ignoring it. **B70.**
 * - **`code`, `payment.id` and `payment.amount` are available** for a receipt line the success dialog
 *   does not print yet. Nothing is inferred from them.
 * - ⚠ **The payload has its own `data` key**, which is the collision above. Nothing on this path may
 *   unwrap by shape — `settle-outcome.test.ts` pins the real body, flat and enveloped, for that
 *   reason.
 */
export function settledFrom(body: unknown): SettleOutcome {
    const flat = (body as { type?: unknown })?.type
    // One level of envelope, and only if the flat read found nothing: `type` at the top level always
    // wins, so a body that carries both cannot be read the wrong way round.
    const wrapped = (body as { data?: { type?: unknown } })?.data?.type
    const type = typeof flat === 'string' ? flat : wrapped
    return {
        status: 'settled',
        purchaseType: typeof type === 'string' && type.trim() !== '' ? type.trim() : null,
    }
}

/**
 * The backend's own sentence, or `null`.
 *
 * **4xx bodies only**, and only the body's `message` — never `error.message`, which falls back to
 * axios's wording ("Request failed with status code 502") and is not a sentence to show anyone. Same
 * rule, and the same reasoning, as `providerSignInErrorText` in `features/auth`.
 */
function rejectionText(error: ApiError): string | null {
    const message = (error.data as { message?: unknown } | undefined)?.message
    if (typeof message !== 'string') return null
    const trimmed = message.trim()
    return trimmed === '' ? null : trimmed
}

/**
 * Map a thrown callback failure. **Rethrows** anything that is about the request rather than the
 * payment — see the table above.
 */
/**
 * 4xx statuses that describe *asking the question*, not the answer.
 *
 * Deliberately a short, explicit list rather than a rule: `400`, `402` and `422` genuinely are the
 * gateway refusing, and treating every 4xx as unknowable would leave a declined card in "still
 * processing" forever.
 */
const REQUEST_FAULT_STATUSES = new Set([401, 403, 404, 408])

export function settleOutcomeFromError(error: unknown): SettleOutcome {
    if (!(error instanceof ApiError)) throw error
    if (error.code === PENDING_SETTLEMENT_CODE) return { status: 'pending' }
    if (error.isCanceled || error.isNetwork || error.isRateLimited() || error.isServerError()) {
        throw error
    }
    if (error.status !== undefined && REQUEST_FAULT_STATUSES.has(error.status)) throw error
    if (error.status !== undefined && error.status >= 400 && error.status < 500) {
        return { status: 'rejected', text: rejectionText(error), code: error.code ?? null }
    }
    throw error
}
