import { ApiError } from '@shared/lib/api/errors'
import { describe, expect, it } from 'vitest'
import { payoutErrorText } from './payout-error'

/**
 * The rule that keeps axios's English off a money screen.
 *
 * `ApiError.message` falls back to `axiosErr.message`, so printing it shows *"Request failed with
 * status code 500"* — untranslated, in nine locales, on the screen that saves somebody's bank details.
 * These cases are the difference between that and a sentence the backend meant for a person.
 */
function apiError(status: number | undefined, data: unknown, message = 'Request failed') {
    return new ApiError({ message, status, data })
}

describe('payoutErrorText', () => {
    it('uses the backend’s sentence on a 4xx', () => {
        expect(
            payoutErrorText(
                apiError(400, { message: 'This wallet address is already registered' }),
            ),
        ).toBe('This wallet address is already registered')
        // `error` is the other key the envelope uses.
        expect(payoutErrorText(apiError(422, { error: 'Bank is not supported' }))).toBe(
            'Bank is not supported',
        )
    })

    it('says nothing for a 5xx — that body is not written for a person', () => {
        expect(
            payoutErrorText(apiError(500, { message: 'NullPointerException at line 42' })),
        ).toBeNull()
        expect(payoutErrorText(apiError(502, { message: 'upstream connect error' }))).toBeNull()
    })

    it('says nothing when there is no body, or no status', () => {
        expect(payoutErrorText(apiError(400, undefined))).toBeNull()
        expect(payoutErrorText(apiError(400, 'a string body'))).toBeNull()
        // A network failure: no response, so no status and no body.
        expect(payoutErrorText(apiError(undefined, undefined, 'Network Error'))).toBeNull()
    })

    it('never lets `error.message` through', () => {
        // The exact string this function exists to keep off the screen.
        const error = apiError(500, undefined, 'Request failed with status code 500')
        expect(payoutErrorText(error)).toBeNull()
    })

    it('rejects anything too long to be a sentence', () => {
        expect(payoutErrorText(apiError(400, { message: 'x'.repeat(161) }))).toBeNull()
        expect(payoutErrorText(apiError(400, { message: '   ' }))).toBeNull()
    })

    it('ignores an error that is not ours', () => {
        expect(payoutErrorText(new Error('boom'))).toBeNull()
        expect(payoutErrorText('boom')).toBeNull()
    })
})
