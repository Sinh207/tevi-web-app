import { ApiError } from '@shared/lib/api/errors'
import { MaxAccountsError } from '@shared/lib/api/token'

/**
 * The three failures that mean the same thing whatever was being attempted — the request
 * did not arrive, arrived too often, or broke on the far side. `null` when the error is
 * about the *operation* and only its own mapper can name it.
 *
 * Checked before any status mapping, and that order matters: a timeout carries no status,
 * but an `ApiError` can carry a stale one alongside `isNetwork`, and reporting that as bad
 * credentials sends someone to reset a password that was never wrong.
 */
function transportErrorKey(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    if (error.isNetwork) return 'error_network'
    if (error.isRateLimited()) return 'auth_too_many_attempts'
    if (error.isServerError()) return 'auth_server_error'
    return null
}

/**
 * The password-reset flow's wording.
 *
 * Reusing `toSignInErrorKey` here reported a mistyped or expired code as "Incorrect email
 * or password" — a sentence about credentials the user was not being asked for. The
 * collapse of 400 and 401 is kept, but onto a key that describes *this* step.
 */
export function toResetErrorKey(error: unknown): string {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (error instanceof ApiError && (error.status === 400 || error.status === 401)) {
        return 'auth_otp_invalid'
    }
    return 'auth_sign_in_failed'
}

/**
 * The translation key to show for a failed sign-in.
 *
 * The form used to render `error.message` straight into a toast. `normalizeApiError`
 * prefers `body.message || body.error`, so that was *the backend's own string* on
 * screen: untranslated in every locale, and free to leak whatever the API felt like
 * saying — internal codes, stack fragments, and account-enumeration hints like
 * "no account with that email".
 *
 * 400 and 401 deliberately collapse onto one key. "Wrong password" and "no such
 * account" must be indistinguishable to the person typing, or the form becomes a
 * way to ask whether an address is registered.
 */
export function toSignInErrorKey(error: unknown): string {
    if (error instanceof MaxAccountsError) return 'auth_account_limit'
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (error instanceof ApiError && (error.status === 400 || error.status === 401)) {
        return 'auth_invalid_credentials'
    }
    return 'auth_sign_in_failed'
}

/**
 * `POST v1/user-login/change-password/` — the settings flow, where the account is already
 * known.
 *
 * **400/401 says the current password is wrong, and here that is safe to say.** The
 * enumeration argument that collapses those two on the sign-in form does not apply: the
 * request is made behind a bearer, by someone already holding the account, about their own
 * credential. There is nothing to learn from the answer that they did not already know.
 * Saying "something went wrong" instead would leave the one actionable failure of this form
 * indistinguishable from a server fault.
 *
 * A 401 that reaches this mapper is the *endpoint's* rejection, not a dead session: the
 * client refreshes and replays a 401 once, and a refresh that fails retires the account
 * without the call ever resolving here (`shared/lib/api/client.ts`).
 */
export function toChangePasswordErrorKey(error: unknown): string {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (error instanceof ApiError && (error.status === 400 || error.status === 401)) {
        return 'password_error_current_incorrect'
    }
    return 'password_error_generic'
}

/**
 * The two calls that present an OTP: `verify-otp/` and `setup-credentials/`.
 *
 * One mapper because they fail the same way. `setup-credentials` re-presents the code and
 * `sid` minutes after they were verified — long enough for expiry to be the failure that
 * actually happens — so its 400 is about the code, not the password the user just typed.
 * Which is why the caller sends them back to the code step: it is the only place that
 * failure can be fixed.
 */
export function toOtpStepErrorKey(error: unknown): string {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (error instanceof ApiError && (error.status === 400 || error.status === 401)) {
        return 'auth_otp_invalid'
    }
    return 'password_error_generic'
}

/**
 * `POST v1/user-login/send-otp/` — asking for a code to be sent to an address.
 *
 * Its 4xx is about the **address**, and reporting it as a bad code (which reusing the OTP
 * mapper did) tells someone their code is wrong before one has been sent. No enumeration
 * concern to trade off here either way: the caller is already signed in and is nominating an
 * address for their own account, so the only fact on offer is one about themselves.
 */
export function toSendCodeErrorKey(error: unknown): string {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (error instanceof ApiError && error.status !== undefined && error.status < 500) {
        return 'password_error_email_rejected'
    }
    return 'password_error_generic'
}

/** Longer than a sentence is not a sentence for a user — it is a dump. */
const MAX_PROVIDER_MESSAGE = 200

/**
 * The backend's own words for a **provider** sign-in failure, or `null`.
 *
 * The one deliberate exception to "no backend message reaches the screen", and it is
 * scoped to `v1/connect/*` — the callers are the social buttons, never the email form.
 * The keys `toSignInErrorKey` produces cannot express what these calls actually refuse:
 * `{ code: 'validation_error', message: 'Please use a different Google account.' }` came
 * back as "Incorrect email or password" next to a button that never asked for either.
 * Legacy toasted this string (`extractErrorMessage` → `initData`), so it is also parity.
 *
 * The trade-off taken knowingly: it says a Google identity is already linked elsewhere,
 * which is a fact about someone else's account. That is the same class of hint 400/401
 * are collapsed to hide on the email form — allowed here, where the address being probed
 * is one the visitor just proved they control by signing in to Google with it.
 *
 * Read off the **body**, never `error.message`: `normalizeApiError` falls back to axios's
 * own `Request failed with status code 400`, and that is not a sentence for a person.
 * Untranslated by nature — the API answers in English in every locale.
 */
export function providerSignInErrorText(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    // 4xx only: "you cannot do this, and here is why" is the one class of failure the
    // server phrases for a user. A 5xx body is where internal codes and stack fragments
    // live, and a network failure has no body at all — both keep their translated key.
    if (error.status === undefined || error.status < 400 || error.status >= 500) return null
    if (!error.data || typeof error.data !== 'object') return null
    const body = error.data as { message?: unknown; error?: unknown }
    const raw = typeof body.message === 'string' ? body.message : body.error
    if (typeof raw !== 'string') return null
    const text = raw.trim()
    if (!text || text.length > MAX_PROVIDER_MESSAGE) return null
    return text
}
