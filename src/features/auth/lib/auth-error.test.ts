import { ApiError } from '@shared/lib/api/errors'
import { MaxAccountsError } from '@shared/lib/api/token'
import { describe, expect, it } from 'vitest'
import {
    providerSignInErrorText,
    toChangePasswordErrorKey,
    toOtpStepErrorKey,
    toResetErrorKey,
    toSendCodeErrorKey,
    toSignInErrorKey,
} from './auth-error'

const api = (init: { status?: number; isNetwork?: boolean; message?: string }) =>
    new ApiError({ message: init.message ?? 'boom', ...init })

describe('toSignInErrorKey', () => {
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

    it('keeps the transport verdicts ahead of the 4xx reading', () => {
        // 429 is a 4xx and must not be reported as a bad address.
        expect(toSendCodeErrorKey(api({ status: 429 }))).toBe('auth_too_many_attempts')
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
