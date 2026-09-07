import { describe, expect, it } from 'vitest'
import { apiErrorText, MAX_API_MESSAGE } from './error-message'
import { ApiError } from './errors'

/**
 * The assertions are the spec — `docs/API_ERRORS.md` §6 says so, and names the three cases worth
 * writing because each is a **silent** failure rather than a loud one: `detail`, the
 * envelope-nested `data.message`, and a 429/403 with a perfectly good 4xx body.
 */
const err = (status: number | undefined, data: unknown, extra: Partial<ApiError> = {}) =>
    new ApiError({
        // Deliberately the axios fallback: nothing here may ever print it.
        message: `Request failed with status code ${status}`,
        status,
        data,
        ...extra,
    })

describe('apiErrorText', () => {
    it('takes the body sentence on a 4xx', () => {
        expect(apiErrorText(err(400, { message: 'This invitation was already answered.' }))).toBe(
            'This invitation was already answered.',
        )
    })

    it('reads the envelope-nested message the interceptor never unwraps', () => {
        expect(apiErrorText(err(400, { data: { message: 'Bank is not supported' } }))).toBe(
            'Bank is not supported',
        )
    })

    it("reads DRF's `detail`, which only one of the five copies did", () => {
        expect(apiErrorText(err(422, { detail: 'Invitation has expired.' }))).toBe(
            'Invitation has expired.',
        )
    })

    it('reads `error`, and `errors[0].error` as a whole-request message', () => {
        expect(apiErrorText(err(400, { error: 'Slug is taken' }))).toBe('Slug is taken')
        expect(apiErrorText(err(400, { errors: [{ error: 'Slug is taken' }] }))).toBe(
            'Slug is taken',
        )
    })

    it('prefers `message` over the later candidates', () => {
        expect(apiErrorText(err(400, { message: 'first', detail: 'second', error: 'third' }))).toBe(
            'first',
        )
    })

    /** §2a — however well-phrased the body is, a 5xx is the server saying it broke. */
    it('is null on a 5xx with a good message', () => {
        expect(apiErrorText(err(500, { message: 'Upstream connect error' }))).toBeNull()
        expect(apiErrorText(err(503, { message: 'Try again shortly' }))).toBeNull()
    })

    /**
     * §2b. Both are 4xx, so a plain range check looks correct and is not — which is exactly why
     * these two assertions exist.
     */
    it('is null on 429, 403 and 401 despite a usable 4xx body', () => {
        expect(apiErrorText(err(429, { message: 'Slow down' }))).toBeNull()
        expect(apiErrorText(err(403, { message: 'star_transfer grant is off' }))).toBeNull()
        expect(apiErrorText(err(401, { message: 'Token expired' }))).toBeNull()
    })

    it('is null for a network failure, an abort and a non-ApiError', () => {
        expect(apiErrorText(err(undefined, null, { isNetwork: true }))).toBeNull()
        expect(apiErrorText(err(400, { message: 'ignored' }, { isCanceled: true }))).toBeNull()
        expect(apiErrorText(new Error('Request failed with status code 400'))).toBeNull()
        expect(apiErrorText(null)).toBeNull()
    })

    it('is null for a body that carries only a code, or no body at all', () => {
        expect(apiErrorText(err(422, { code: 'AU001' }))).toBeNull()
        expect(apiErrorText(err(400, 'plain text body'))).toBeNull()
        expect(apiErrorText(err(400, undefined))).toBeNull()
    })

    it('is null for a blank message rather than toasting an empty string', () => {
        expect(apiErrorText(err(400, { message: '   ' }))).toBeNull()
        // …and falls through to the next candidate rather than stopping at the blank one.
        expect(apiErrorText(err(400, { message: '  ', detail: 'Real reason' }))).toBe('Real reason')
    })

    it('rejects a dump at the cap boundary and accepts a sentence at it', () => {
        expect(apiErrorText(err(400, { message: 'x'.repeat(MAX_API_MESSAGE) }))).toHaveLength(
            MAX_API_MESSAGE,
        )
        expect(apiErrorText(err(400, { message: 'x'.repeat(MAX_API_MESSAGE + 1) }))).toBeNull()
    })
})
