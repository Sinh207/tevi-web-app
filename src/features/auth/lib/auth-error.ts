import type { TranslationKey } from '@shared/i18n/settings'
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
function transportErrorKey(error: unknown): TranslationKey | null {
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
export function toResetErrorKey(error: unknown): TranslationKey {
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
 *
 * ## `suspended` is the one refusal lifted out of that collapse
 *
 * A suspended account answers **`401 { code: 'suspended' }`** on every sign-in path, and the
 * collapse above turned that into "Incorrect email or password" — the single most misleading
 * sentence the form can print. The person's password is right; they will retype it, reset it,
 * and reset it again, and none of it can work.
 *
 * **The enumeration trade-off is real and is taken knowingly.** Naming the state does confirm
 * that an account exists at that address, which is exactly what the 400/401 collapse exists to
 * hide. It is accepted here for three reasons: the backend publishes a `code` for this and an
 * appeal endpoint (`POST v1/appeal/`) to act on it, so the state is meant to be surfaced; it is
 * reached only *after* a correct password on the email path, which is not a probe; and the
 * alternative silently strands somebody with no route back. `code`, not status — a bare 401 is
 * still the collapse.
 *
 * ⚠ The sentence this maps to has no appeal screen behind it yet — `GET`/`POST v1/appeal/` are
 * unported. It says what happened and points at support; when the appeal screen lands, this key
 * is where it hangs off.
 */
export function toSignInErrorKey(error: unknown): TranslationKey {
    if (error instanceof MaxAccountsError) return 'auth_account_limit'
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (error instanceof ApiError && error.code === 'suspended') return 'auth_account_suspended'
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
export function toChangePasswordErrorKey(error: unknown): TranslationKey {
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
export function toOtpStepErrorKey(error: unknown): TranslationKey {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (error instanceof ApiError && (error.status === 400 || error.status === 401)) {
        return 'auth_otp_invalid'
    }
    return 'password_error_generic'
}

/**
 * The refusals `send-otp` names, mapped onto keys of ours. Anything not listed keeps the
 * generic "check the address" line.
 *
 * Read off `code`, never `message`. The body carries a perfectly good sentence —
 * `{ code: 'email_already_in_use', message: 'Email already in use by another account' }` —
 * and legacy printed exactly that (`useConnectEmail` → `e.response.data.message`), but it is
 * English in all nine locales and the API is free to reword it in a patch. The code is the
 * part that is a contract, so it is what a translation of ours can stand behind. That keeps
 * the information legacy showed while removing the reason it was withheld here.
 *
 * Being specific is safe on *this* endpoint for the same reason the mapper below is: the
 * caller is signed in and nominating an address for their own account. "Already in use" is
 * a fact about the person reading it, not the enumeration hint that the sign-in form's
 * 400/401 collapse exists to hide.
 */
const SEND_CODE_ERROR_KEYS: Record<string, TranslationKey> = {
    email_already_in_use: 'password_error_email_in_use',
}

/**
 * `POST v1/user-login/send-otp/` — asking for a code to be sent to an address.
 *
 * Its 4xx is about the **address**, and reporting it as a bad code (which reusing the OTP
 * mapper did) tells someone their code is wrong before one has been sent. No enumeration
 * concern to trade off here either way: the caller is already signed in and is nominating an
 * address for their own account, so the only fact on offer is one about themselves.
 */
export function toSendCodeErrorKey(error: unknown): TranslationKey {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (error instanceof ApiError && error.status !== undefined && error.status < 500) {
        const named = error.code ? SEND_CODE_ERROR_KEYS[error.code] : undefined
        return named ?? 'password_error_email_rejected'
    }
    return 'password_error_generic'
}

/**
 * `POST v1/two-fa/passcode/verify/` — the account passcode in front of a withdrawal.
 *
 * **Every 4xx says "wrong code", and that is wider than legacy.** Legacy names only 422
 * (`useTwoStepVerification.verifyPasscode`) and lets 400/401/403 fall through to the backend's own
 * sentence in a toast. Two reasons to collapse them here instead:
 *
 * 1. The endpoint is presented a bearer and one field. There is nothing else on the request for the
 *    server to object to, so a 4xx is a verdict on the code whatever number it carries — and this
 *    client has no way to tell 422 from 400 apart *usefully* enough to word them differently.
 * 2. The alternative is legacy's, which is the backend's message on screen: English in nine locales,
 *    and the rule this repo keeps everywhere except `providerSignInErrorText`.
 *
 * Rate limiting and 5xx are already peeled off by `transportErrorKey` above — which matters more here
 * than elsewhere, because a passcode field is exactly what gets throttled, and telling someone their
 * code is wrong when the server refused to look at it sends them to reset a passcode that is fine.
 *
 * A 401 reaching this mapper is the *endpoint's* refusal and not a dead session, for
 * `toChangePasswordErrorKey`'s reason: the client refreshes and replays once, and a refresh that
 * fails retires the account without the call resolving here.
 */
export function toPasscodeErrorKey(error: unknown): TranslationKey {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (
        error instanceof ApiError &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500
    ) {
        return 'auth_two_fa_wrong'
    }
    return 'auth_two_fa_failed'
}

/**
 * The two-step-verification calls that are **not** about a code: `recover/` (send the email) and
 * `reset/` (write the new passcode).
 *
 * A second mapper, because `toPasscodeErrorKey` cannot serve these — it reads every 4xx as "wrong
 * code", which is right where the request carries a code and nothing else, and wrong here. Reusing it
 * told somebody whose recovery email failed to send that their code was incorrect, on a step where no
 * code had been typed yet. The tests caught it; nothing on screen would have.
 *
 * `transportErrorKey` still runs first, and that is the whole value this adds over a bare fallback: a
 * throttle and a 5xx have their own sentences, and "couldn't update your passcode" in place of "too
 * many attempts" sends somebody retrying into the same wall.
 */
export function toTwoFaActionErrorKey(error: unknown, fallbackKey: TranslationKey): TranslationKey {
    return transportErrorKey(error) ?? fallbackKey
}

/**
 * `POST v1/two-fa/passcode/recover/` — *Forgot passcode?*, the first step of the recovery chain.
 *
 * A second mapper on top of `toTwoFaActionErrorKey` for exactly **one** refusal, and it is the one
 * refusal the reader cannot get past by trying again: **`422 AU005` means the account has no
 * recovery email on file**, so there is nowhere to send a code and *Resend* will fail forever.
 * Everything else keeps the generic "couldn't send" line.
 *
 * `recover/` is the only thing that knows — the flag on `/me` says a passcode exists, not that an
 * address was ever attached — which is what made this worth a key of its own rather than a sentence
 * from the backend. Without it the screen offered a retry button for a state no retry can change.
 *
 * The recovery *from* it is not this function's business, and there is deliberately none: the two
 * routes out are the passcode itself and support, neither of which this dialog can offer. Saying
 * why is the whole improvement.
 */
export function toTwoFaRecoverErrorKey(error: unknown): TranslationKey {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (error instanceof ApiError && error.code === 'AU005') {
        return 'auth_two_fa_no_recovery_email'
    }
    return 'auth_two_fa_recovery_failed'
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

/**
 * The statuses that mean **"the credential on this request was refused"**, as opposed to the request
 * being malformed, throttled or unlucky.
 *
 * 422 is legacy's own choice for a wrong passcode (`useTwoStepVerification` branches on it); 400 and
 * 401 join it because `toPasscodeErrorKey` already documents that this client cannot tell them apart
 * usefully on a one-field request; 403 joins because the two-fa routes are the one place in this app
 * where a 403 is plausibly about the *passcode* rather than about a `features/permission` grant —
 * they are not grant-gated at all.
 *
 * Kept separate from the mappers below because the **recovery** differs from the wording: a refused
 * credential sends the reader back to the passcode gate, where a 5xx leaves them where they are with
 * a retry. Two of this repo's mappers already learned that lesson by collapsing the two
 * (`toTwoFaActionErrorKey`'s docblock).
 */
export function isCredentialRefusal(error: unknown): boolean {
    if (!(error instanceof ApiError)) return false
    // A network failure can carry a stale status alongside `isNetwork` — reporting that as a refused
    // passcode sends somebody to reset a credential that was never wrong. Same order
    // `transportErrorKey` insists on.
    if (error.isNetwork || error.isRateLimited() || error.isServerError()) return false
    return (
        error.status === 400 || error.status === 401 || error.status === 403 || error.status === 422
    )
}

/**
 * `POST v1/two-fa/passcode/` — the call that turns two-step verification on.
 *
 * Its 4xx is read as **the emailed code**, and that is a judgement rather than a certainty. The call
 * carries four fields, so in principle the backend could be objecting to any of them — but three of
 * them the reader chose freely (a six-digit passcode, its copy, an optional hint), and the fourth is
 * the only one with a **lifetime**. On the screen where this fires, the code is also the only thing
 * the reader can still act on: the address is one step back and the passcode three.
 *
 * ⚠ **If the endpoint refuses weak passcodes** — sequential digits, repeats — this wording is wrong
 * and the fix is a `code` on the body, which is asked for in B92. Until then the failure the reader
 * is most likely to hit is the one they are told about.
 */
export function toTwoFaCreateErrorKey(error: unknown): TranslationKey {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (isCredentialRefusal(error)) return 'auth_two_fa_otp_invalid'
    return 'auth_two_fa_create_failed'
}

/**
 * `PATCH v1/two-fa/passcode/` — replacing a passcode the account knows.
 *
 * A 4xx here says the **current** passcode was refused, which is a state the screen can only have
 * reached one way: `verify/` accepted it moments earlier and the two endpoints disagree, or it was
 * changed on another device in between. Either way the recovery is the same and it is not a retry —
 * the caller re-raises the passcode gate, which is why `isCredentialRefusal` is the hook's test and
 * this is only the wording.
 *
 * `auth_two_fa_wrong` is reused rather than re-keyed: it is legacy's sentence for exactly this, and
 * the reader is about to be shown the same six boxes it was written for.
 */
export function toTwoFaChangeErrorKey(error: unknown): TranslationKey {
    const transport = transportErrorKey(error)
    if (transport) return transport
    if (isCredentialRefusal(error)) return 'auth_two_fa_wrong'
    return 'auth_two_fa_change_failed'
}

/**
 * The backend's own words for a failed **two-step-verification settings write**, or `null`.
 *
 * `docs/API_ERRORS.md`'s rule, which this feature was quietly breaking: a `POST`/`PATCH`/`DELETE`
 * refused with a **4xx** shows the message the body carried, and a translated string of ours is the
 * fallback. `toTwoFaActionErrorKey` alone always showed ours — so
 * `{ code: "validation_error", message: "Passcode must be 6 digits" }` reached a reader as "Couldn't
 * update your recovery email", which is the one sentence that could not tell them what was wrong. On
 * a screen whose contract is still being confirmed (**B92**) that is worse than usual: the backend's
 * sentence is the only diagnosis there is.
 *
 * The sign-in exception does **not** apply here. 400/401 collapse onto one key on the email form to
 * stop the form being used to enumerate accounts; this is a settings write, made behind a bearer, by
 * someone already holding the account, about their own record. There is nothing to learn from the
 * answer that they did not already know.
 *
 * Read off the **body** and never `error.message`, which falls back to axios's own
 * `Request failed with status code 400`. Field spellings are the union `docs/API_ERRORS.md` lists,
 * because no one of them is documented as authoritative (**B90**).
 */
export function twoFaWriteErrorText(error: unknown): string | null {
    if (!(error instanceof ApiError)) return null
    /*
     * 4xx only, and the same three exclusions the repo makes everywhere: nobody phrases a server
     * fault for a user, a throttle's text is often the proxy's, and a network failure has no body.
     */
    if (error.isNetwork || error.isRateLimited() || error.isServerError()) return null
    if (error.status === undefined || error.status < 400 || error.status >= 500) return null
    if (!error.data || typeof error.data !== 'object') return null
    const body = error.data as {
        message?: unknown
        detail?: unknown
        error?: unknown
        data?: { message?: unknown }
    }
    const raw = [body.message, body.data?.message, body.detail, body.error].find(
        candidate => typeof candidate === 'string' && candidate.trim(),
    )
    if (typeof raw !== 'string') return null
    const text = raw.trim()
    // Longer than a sentence is not a sentence for a user — it is a dump.
    return text.length <= MAX_PROVIDER_MESSAGE ? text : null
}
