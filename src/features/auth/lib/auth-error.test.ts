import { ApiError } from '@shared/lib/api/errors'
import { MaxAccountsError } from '@shared/lib/api/token'
import { describe, expect, it } from 'vitest'
import {
    providerSignInErrorText,
    toChangePasswordErrorKey,
    toOtpStepErrorKey,
    toPasscodeErrorKey,
    toResetErrorKey,
    toSendCodeErrorKey,
    toSignInErrorKey,
    toTwoFaRecoverErrorKey,
} from './auth-error'

const api = (init: { status?: number; isNetwork?: boolean; message?: string; code?: string }) =>
    new ApiError({ message: init.message ?? 'boom', ...init })

describe('toSignInErrorKey', () => {
    /*
     * The one refusal lifted out of the 400/401 collapse. A suspended account's password is
     * *right*, so "Incorrect email or password" sends somebody to reset a credential that works —
     * for ever, since no reset can change the state. Keyed on `code`, never on the status.
     */
    it('names a suspended account instead of blaming the password', () => {
        expect(toSignInErrorKey(api({ status: 401, code: 'suspended' }))).toBe(
            'auth_account_suspended',
        )
    })

    it('keeps the collapse for a 401 that does not say why', () => {
        expect(toSignInErrorKey(api({ status: 401 }))).toBe('auth_invalid_credentials')
        expect(toSignInErrorKey(api({ status: 401, code: 'invalid_token' }))).toBe(
            'auth_invalid_credentials',
        )
    })

    it('never distinguishes "wrong password" from "no such account"', () => {
        // The whole point: a differing message turns the login form into an
        // account-enumeration oracle.
        expect(toSignInErrorKey(api({ status: 401 }))).toBe(toSignInErrorKey(api({ status: 400 })))
        expect(toSignInErrorKey(api({ status: 401 }))).toBe('auth_invalid_credentials')
    })

    it("never returns the backend's own words", () => {
        const leaky = api({
            status: 400,
            message: 'No account registered with sinh@tevi.com',
        })
        expect(toSignInErrorKey(leaky)).toBe('auth_invalid_credentials')
        expect(toSignInErrorKey(leaky)).not.toContain('tevi.com')
    })

    it('separates the failures a user can act on differently', () => {
        expect(toSignInErrorKey(api({ isNetwork: true }))).toBe('error_network')
        expect(toSignInErrorKey(api({ status: 429 }))).toBe('auth_too_many_attempts')
        expect(toSignInErrorKey(api({ status: 503 }))).toBe('auth_server_error')
        expect(toSignInErrorKey(new MaxAccountsError())).toBe('auth_account_limit')
    })

    it('falls back for anything it does not recognise', () => {
        expect(toSignInErrorKey(new Error('nope'))).toBe('auth_sign_in_failed')
        expect(toSignInErrorKey(undefined)).toBe('auth_sign_in_failed')
        expect(toSignInErrorKey(api({ status: 418 }))).toBe('auth_sign_in_failed')
    })

    it('prefers the transport verdict over the status when both are present', () => {
        // A timeout carries no status; a network flag with a stale status must not
        // be reported as bad credentials.
        expect(toSignInErrorKey(api({ isNetwork: true, status: 401 }))).toBe('error_network')
    })
})

describe('toResetErrorKey', () => {
    it('names the code rather than the credentials', () => {
        expect(toResetErrorKey(api({ status: 400 }))).toBe('auth_otp_invalid')
        expect(toResetErrorKey(api({ status: 401 }))).toBe('auth_otp_invalid')
    })

    it('shares the transport verdicts with every other mapper', () => {
        expect(toResetErrorKey(api({ isNetwork: true, status: 400 }))).toBe('error_network')
        expect(toResetErrorKey(api({ status: 429 }))).toBe('auth_too_many_attempts')
        expect(toResetErrorKey(api({ status: 500 }))).toBe('auth_server_error')
    })
})

describe('toChangePasswordErrorKey', () => {
    it('says the current password is wrong — safe behind a bearer, unlike sign-in', () => {
        // The enumeration collapse exists to stop a *form* answering "does this account
        // exist". Here the account is already held, so the actionable answer is given.
        expect(toChangePasswordErrorKey(api({ status: 400 }))).toBe(
            'password_error_current_incorrect',
        )
        expect(toChangePasswordErrorKey(api({ status: 401 }))).toBe(
            'password_error_current_incorrect',
        )
    })

    it("still never returns the backend's own words", () => {
        expect(
            toChangePasswordErrorKey(api({ status: 400, message: 'bcrypt compare failed at :42' })),
        ).toBe('password_error_current_incorrect')
    })

    it('prefers the transport verdict, and falls back to a settings-shaped key', () => {
        expect(toChangePasswordErrorKey(api({ isNetwork: true, status: 400 }))).toBe(
            'error_network',
        )
        expect(toChangePasswordErrorKey(api({ status: 429 }))).toBe('auth_too_many_attempts')
        expect(toChangePasswordErrorKey(api({ status: 502 }))).toBe('auth_server_error')
        expect(toChangePasswordErrorKey(new Error('nope'))).toBe('password_error_generic')
        expect(toChangePasswordErrorKey(api({ status: 418 }))).toBe('password_error_generic')
    })
})

describe('toOtpStepErrorKey', () => {
    it('blames the code, which is what expires between verifying and submitting', () => {
        expect(toOtpStepErrorKey(api({ status: 400 }))).toBe('auth_otp_invalid')
        expect(toOtpStepErrorKey(api({ status: 401 }))).toBe('auth_otp_invalid')
    })

    it('falls back to the settings-shaped key, not a sign-in one', () => {
        expect(toOtpStepErrorKey(new Error('nope'))).toBe('password_error_generic')
        expect(toOtpStepErrorKey(api({ isNetwork: true }))).toBe('error_network')
    })
})

describe('toSendCodeErrorKey', () => {
    it('blames the address, never the code — none has been sent yet', () => {
        expect(toSendCodeErrorKey(api({ status: 400 }))).toBe('password_error_email_rejected')
        expect(toSendCodeErrorKey(api({ status: 409 }))).toBe('password_error_email_rejected')
        expect(toSendCodeErrorKey(api({ status: 422 }))).toBe('password_error_email_rejected')
    })

    it('names the refusal the backend names, from the code and not its sentence', () => {
        const inUse = api({
            status: 400,
            code: 'email_already_in_use',
            message: 'Email already in use by another account',
        })
        expect(toSendCodeErrorKey(inUse)).toBe('password_error_email_in_use')
        // Still a key: the backend's English sentence never reaches the screen.
        expect(toSendCodeErrorKey(inUse)).not.toContain(' ')
    })

    it('falls back to the generic address line for a code it does not know', () => {
        expect(toSendCodeErrorKey(api({ status: 400, code: 'some_future_code' }))).toBe(
            'password_error_email_rejected',
        )
    })

    it('keeps the transport verdicts ahead of the 4xx reading', () => {
        // 429 is a 4xx and must not be reported as a bad address.
        expect(toSendCodeErrorKey(api({ status: 429 }))).toBe('auth_too_many_attempts')
        // A named refusal does not outrank the transport verdicts either: a 429 body can
        // still carry the last code, and reporting throttling as "already in use" sends the
        // user off to change an address that was fine.
        expect(toSendCodeErrorKey(api({ status: 429, code: 'email_already_in_use' }))).toBe(
            'auth_too_many_attempts',
        )
        expect(toSendCodeErrorKey(api({ isNetwork: true, status: 400 }))).toBe('error_network')
        expect(toSendCodeErrorKey(api({ status: 500 }))).toBe('auth_server_error')
        expect(toSendCodeErrorKey(new Error('nope'))).toBe('password_error_generic')
    })
})

describe('providerSignInErrorText', () => {
    const withBody = (status: number | undefined, data: unknown, isNetwork = false) =>
        new ApiError({ message: 'Request failed with status code 400', status, data, isNetwork })

    it('returns the sentence a 4xx body actually carried', () => {
        expect(
            providerSignInErrorText(
                withBody(400, {
                    code: 'validation_error',
                    message: 'Please use a different Google account.',
                    success: false,
                }),
            ),
        ).toBe('Please use a different Google account.')
    })

    it('reads the body, never the axios fallback message', () => {
        // `normalizeApiError` falls back to axios's own wording when the body says
        // nothing — that string must not reach a user.
        expect(providerSignInErrorText(withBody(400, { code: 'validation_error' }))).toBeNull()
        expect(providerSignInErrorText(withBody(400, undefined))).toBeNull()
    })

    it('accepts `error` as well as `message`', () => {
        expect(providerSignInErrorText(withBody(409, { error: 'Account already linked.' }))).toBe(
            'Account already linked.',
        )
    })

    it('keeps the translated key for anything that is not a 4xx with a body', () => {
        expect(providerSignInErrorText(withBody(500, { message: 'NullPointerException at …' }))) //
            .toBeNull()
        expect(providerSignInErrorText(withBody(undefined, null, true))).toBeNull()
        expect(providerSignInErrorText(new Error('nope'))).toBeNull()
        expect(providerSignInErrorText(undefined)).toBeNull()
    })

    it('refuses a body that is a dump rather than a sentence', () => {
        expect(providerSignInErrorText(withBody(400, { message: '   ' }))).toBeNull()
        expect(providerSignInErrorText(withBody(400, { message: 'x'.repeat(201) }))).toBeNull()
        expect(providerSignInErrorText(withBody(400, { message: { nested: 'no' } }))).toBeNull()
    })
})

describe('toPasscodeErrorKey', () => {
    /**
     * **Wider than legacy on purpose.** Legacy names 422 and lets 400/401/403 fall through to the
     * backend's own sentence in a toast; the endpoint is presented a bearer and one field, so every 4xx
     * is a verdict on the code.
     */
    it('reads every 4xx as a wrong code', () => {
        for (const status of [400, 401, 403, 404, 409, 422]) {
            expect(toPasscodeErrorKey(api({ status }))).toBe('auth_two_fa_wrong')
        }
    })

    /**
     * **A throttle is not a wrong code**, and this is the mapper where that matters most: a passcode
     * field is exactly what gets rate-limited, and telling somebody their code is wrong when the server
     * refused to look at it sends them to reset a passcode that is fine.
     */
    it('does not blame the code for a throttle or a server fault', () => {
        expect(toPasscodeErrorKey(api({ status: 429 }))).toBe('auth_too_many_attempts')
        expect(toPasscodeErrorKey(api({ status: 500 }))).toBe('auth_server_error')
        expect(toPasscodeErrorKey(api({ status: 502 }))).toBe('auth_server_error')
        expect(toPasscodeErrorKey(api({ isNetwork: true, status: 422 }))).toBe('error_network')
    })

    it('falls back for anything that is not an ApiError', () => {
        expect(toPasscodeErrorKey(new Error('nope'))).toBe('auth_two_fa_failed')
        expect(toPasscodeErrorKey(undefined)).toBe('auth_two_fa_failed')
    })

    /** Never the backend's words — the rule this repo keeps everywhere but `providerSignInErrorText`. */
    it('never returns the backend message', () => {
        const key = toPasscodeErrorKey(api({ status: 422, message: 'Passcode has expired, sorry' }))
        expect(key).toBe('auth_two_fa_wrong')
        expect(key).not.toContain(' ')
    })
})

describe('toTwoFaRecoverErrorKey', () => {
    /*
     * `AU005` is the only refusal on *Forgot passcode?* that a retry cannot fix — the account has
     * no recovery address, so there is nowhere to send a code and *Resend* fails identically for
     * ever. Everything else keeps the generic line, which is retryable advice.
     */
    it('says an account has no recovery email on AU005', () => {
        expect(toTwoFaRecoverErrorKey(api({ status: 422, code: 'AU005' }))).toBe(
            'auth_two_fa_no_recovery_email',
        )
    })

    it('keeps the generic line for every other refusal', () => {
        expect(toTwoFaRecoverErrorKey(api({ status: 422, code: 'AU002' }))).toBe(
            'auth_two_fa_recovery_failed',
        )
        expect(toTwoFaRecoverErrorKey(api({ status: 400 }))).toBe('auth_two_fa_recovery_failed')
    })

    // Transport still wins: a throttle and a 5xx have their own sentences, and telling somebody
    // they have no recovery email when the server refused to look is worse than saying nothing.
    it('lets a throttle and a server fault keep their own words', () => {
        expect(toTwoFaRecoverErrorKey(api({ status: 429, code: 'AU005' }))).toBe(
            'auth_too_many_attempts',
        )
        expect(toTwoFaRecoverErrorKey(api({ status: 503 }))).toBe('auth_server_error')
    })
})
