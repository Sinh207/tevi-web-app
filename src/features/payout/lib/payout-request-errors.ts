import { ApiError } from '@shared/lib/api/errors'

/**
 * What a failed withdrawal **means**, and what the screen does about it.
 *
 * ## Why this is a module and not a `catch` block
 *
 * `POST payout-request/` is the one call in this feature that spends money, and its 4xx answers are not
 * interchangeable. One of them is not an error at all — it is a *step the reader has not taken yet* —
 * and treating it as a toast is how legacy loses people: `identification_level_2_required` comes back
 * 422, and the only reason legacy handles it is one hard-coded string comparison. Every other 4xx there
 * falls through to `messagesContext.error(res?.response?.data?.message)`, i.e. the backend's own
 * sentence, unlocalised, in a toast.
 *
 * So the mapping is a pure function with a test, and the screen switches on an **outcome** rather than
 * on a status code.
 *
 * ## The OpenAPI schema documents no 4xx at all
 *
 * `api.tevi.dev/billy/docs/schema/v5/` lists only `201` for this endpoint. So the vocabulary below is
 * read from `web-app` plus the shapes billy is known to send, and it is **open**: an unrecognised code
 * resolves to `unknown`, which shows the backend's message when there is one and a generic line when
 * there is not. Nothing here fails closed into silence — on a money action, a reader who pressed a
 * button must be told something.
 *
 * ## The four outcomes, and why they are four
 *
 * - **`verification-required`** — the reader must finish identity verification. A *route*, not a
 *   message: legacy opens a dialog offering the verification screen, and a toast saying "level 2
 *   required" leaves somebody stuck with nowhere to press.
 * - **`amount-rejected`** — the server disagrees with the figure (below minimum, over the daily limit,
 *   more than the balance). Belongs **on the field**, not in a toast: the fix is to edit the number, and
 *   a toast about it disappears before the reader looks back at the input.
 * - **`quote-expired`** — the held price is no longer valid. Recoverable *without the reader doing
 *   anything wrong*, so the screen re-quotes and asks again rather than reporting a failure.
 * - **`passcode-required`** — two-step verification. Like `verification-required` it is a *step*, not a
 *   message: the screen re-raises `TwoStepVerificationDialog` and submits again with the code. See
 *   `PASSCODE_CODES` for why this branch exists even though the screen normally collects the passcode
 *   *before* the request goes out.
 * - **`unknown`** — everything else, including 5xx and a dead network. Shown as a message.
 */
export type PayoutRequestOutcome =
    | { kind: 'verification-required' }
    | { kind: 'amount-rejected'; message: string | null }
    | { kind: 'quote-expired' }
    | { kind: 'passcode-required'; message: string | null }
    | { kind: 'unknown'; message: string | null }

/**
 * The `code` legacy matches on, lower-cased — its only structured 4xx branch.
 *
 * Kept as a set rather than one string because the same wall has been seen spelled two ways, and a
 * verification prompt shown as a toast is the failure this exists to prevent.
 */
const VERIFICATION_CODES = new Set([
    'identification_level_2_required',
    'identification_level_two_required',
    'kyc_required',
])

/**
 * Codes that mean **the passcode is missing or wrong** — ask for it and submit again.
 *
 * ## This is the one code set not read off legacy, and it should be a rare branch
 *
 * Legacy never handles it, because legacy never *sees* it: `two_fa_passcode` on `/me` tells the screen
 * to collect a passcode first, so by the time `payout-request/` is called the code has already been
 * accepted by `two-fa/passcode/verify/`. This client does the same. So reaching this branch means one
 * of the narrow set of things that can still go wrong:
 *
 * - **`/me` was stale.** Two-step verification was switched on elsewhere — the mobile app, another tab
 *   — after this screen's profile was cached. Without this branch that account is told "couldn't send
 *   your withdrawal request" with no way forward, which is the exact failure the whole 2FA port exists
 *   to remove. With it, the passcode step simply appears.
 * - **The two calls disagreed.** `verify/` accepted the code and the write refused it: a passcode
 *   changed between the two requests, or a per-action nonce this client does not know about.
 *
 * ## The codes are a guess, and that is safe here specifically
 *
 * The schema documents no 4xx on this endpoint at all, so these spellings are inferred. An unmatched
 * code still falls through to `unknown` and still shows the backend's own sentence — so a wrong guess
 * costs the *improvement*, never the fallback. The failure mode of guessing too **widely** would be
 * worse (a passcode prompt in front of an unrelated refusal), which is why nothing generic like
 * `forbidden` or `invalid_request` is in here.
 *
 * ⚠ Unlike the sets above, this one is **not** allowed to win over the status the way
 * `VERIFICATION_CODES` is — see the order in `payoutRequestOutcome`. B91 asks the backend for the real
 * vocabulary.
 */
const PASSCODE_CODES = new Set([
    'passcode_required',
    'passcode_invalid',
    'invalid_passcode',
    'wrong_passcode',
    'two_fa_required',
    'two_fa_passcode_required',
    'two_factor_required',
])

/** Codes that mean "the price you were holding is stale" — re-quote and ask again. */
const QUOTE_CODES = new Set(['quote_expired', 'quote_invalid', 'quote_not_found'])

/**
 * Codes that are a verdict on the **amount**. Anything matching goes to the field.
 *
 * `insufficient_balance` is in here rather than under `unknown` deliberately: it is a statement about
 * the number the reader typed, and the fix is the same — type a smaller one.
 */
const AMOUNT_CODES = new Set([
    'amount_too_small',
    'amount_below_minimum',
    'minimum_amount',
    'amount_too_large',
    'amount_exceeds_balance',
    'insufficient_balance',
    'daily_limit_exceeded',
    'exceed_daily_limit',
    'invalid_amount',
])

/**
 * Pull a `code` out of whatever the backend attached to the error.
 *
 * Billy has been seen to put it at the top level and under `data`, and to send it upper-cased. Read
 * defensively because the alternative is a verification wall shown as a toast over one spelling.
 */
function errorCode(error: ApiError): string {
    const body = error.data as Record<string, unknown> | null | undefined
    /*
     * `ApiError.code` first — the client already lifts one out for its own use — then the body, where
     * billy has been seen to put it both at the top level and nested under `data`.
     */
    const candidates = [
        error.code,
        body?.code,
        (body?.data as Record<string, unknown> | undefined)?.code,
        body?.error_code,
    ]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().toLowerCase()
    }
    return ''
}

/**
 * The backend's own sentence, or `null`.
 *
 * **Body only** — never `error.message`, which falls back to axios's own wording ("Request failed with
 * status code 422"), and showing that to a creator is worse than showing nothing. The same rule
 * `providerSignInErrorText` follows in `features/auth`, and for the same reason.
 *
 * Also **4xx only**. A 5xx body is where stack fragments and proxy HTML live, and one line of an nginx
 * error page in a toast on a money screen is its own kind of failure.
 */
function backendMessage(error: ApiError): string | null {
    // `status` is `undefined` on a network failure or an abort — neither carries a body to read.
    if (error.status === undefined || error.status < 400 || error.status >= 500) return null

    const body = error.data as Record<string, unknown> | null | undefined
    const candidates = [
        body?.message,
        (body?.data as Record<string, unknown> | undefined)?.message,
        body?.detail,
    ]
    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const text = candidate.trim()
            // One short sentence or nothing: a wall of validation JSON stringified into a toast is not
            // a message, and billy's `errors` object is not a sentence.
            if (text && text.length <= 200) return text
        }
    }
    return null
}

/**
 * Classify a failed `createRequest`.
 *
 * Takes `unknown` because that is what a `catch` hands over, and because a caller must not have to
 * narrow before asking what went wrong.
 */
export function payoutRequestOutcome(error: unknown): PayoutRequestOutcome {
    if (!(error instanceof ApiError)) {
        return { kind: 'unknown', message: null }
    }

    /*
     * An aborted request is not a failure — the reader navigated away, or the component unmounted. It
     * must not raise anything, and `unknown` with no message is how the caller says nothing.
     */
    if (error.isCanceled) return { kind: 'unknown', message: null }

    const code = errorCode(error)

    if (VERIFICATION_CODES.has(code)) return { kind: 'verification-required' }
    if (QUOTE_CODES.has(code)) return { kind: 'quote-expired' }
    /*
     * Before `AMOUNT_CODES` and before the uncoded-400 rule, so a passcode refusal cannot end up as a
     * message under the amount field — a figure the reader would then edit, when the figure was fine.
     */
    if (PASSCODE_CODES.has(code)) {
        return { kind: 'passcode-required', message: backendMessage(error) }
    }
    if (AMOUNT_CODES.has(code)) {
        return { kind: 'amount-rejected', message: backendMessage(error) }
    }

    /*
     * **A 400 with no code we know is still probably about the amount**, because on this endpoint the
     * amount is the only free-form thing the reader controls: the config and the option are both chosen
     * from lists the server supplied. Putting it on the field rather than in a toast means the message
     * sits next to the thing that has to change.
     *
     * 422 does **not** get the same treatment: legacy's one structured 422 is the verification wall, so
     * an unrecognised 422 is more likely a state problem than a typo, and a message on the amount field
     * would send somebody editing a number that is fine.
     */
    if (error.status === 400) {
        return { kind: 'amount-rejected', message: backendMessage(error) }
    }

    return { kind: 'unknown', message: backendMessage(error) }
}
