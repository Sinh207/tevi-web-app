import { ApiError } from '@shared/lib/api/errors'
import { describe, expect, it } from 'vitest'
import { unlockErrorText } from './unlock-error-text'

const err = (status: number | undefined, data: unknown, extra: Record<string, unknown> = {}) =>
    new ApiError({ message: 'Request failed with status code 400', status, data, ...extra })

describe('unlockErrorText', () => {
    /** Five spellings, because the services disagree and a missed one fails **silently**. */
    it('reads the message from any of the shapes the API uses', () => {
        expect(unlockErrorText(err(422, { message: 'Not enough Star' }))).toBe('Not enough Star')
        expect(unlockErrorText(err(400, { data: { message: 'Event closed' } }))).toBe(
            'Event closed',
        )
        expect(unlockErrorText(err(400, { detail: 'Already purchased' }))).toBe('Already purchased')
        expect(unlockErrorText(err(400, { error: 'Bad product' }))).toBe('Bad product')
        expect(unlockErrorText(err(400, { errors: [{ error: 'Nope' }] }))).toBe('Nope')
    })

    it('prefers message over the later spellings', () => {
        expect(unlockErrorText(err(400, { message: 'first', detail: 'second' }))).toBe('first')
    })

    /**
     * ⚠ **Never `ApiError.message`.** Its fallback chain ends in axios's own English, which is the
     * one string that must not reach a money screen in nine locales — so a 4xx with no readable
     * body answers `null` and the caller prints its translated fallback.
     */
    it('is null when the body carries no sentence', () => {
        expect(unlockErrorText(err(400, {}))).toBeNull()
        expect(unlockErrorText(err(400, null))).toBeNull()
        expect(unlockErrorText(err(400, 'a string body'))).toBeNull()
        expect(unlockErrorText(err(400, { message: '   ' }))).toBeNull()
        expect(unlockErrorText(err(400, { message: 42 }))).toBeNull()
    })

    /** Nobody phrases a server fault for a user. */
    it('skips 5xx', () => {
        expect(unlockErrorText(err(500, { message: 'NullPointerException at …' }))).toBeNull()
        expect(unlockErrorText(err(503, { message: 'upstream' }))).toBeNull()
    })

    /** A throttle's text is often the proxy's, and `Retry-After` is already parsed. */
    it('skips 429', () => {
        expect(unlockErrorText(err(429, { message: 'Too many requests' }))).toBeNull()
    })

    it('skips a network failure and a cancellation — there is no body to read', () => {
        expect(unlockErrorText(err(undefined, null, { isNetwork: true }))).toBeNull()
        expect(unlockErrorText(err(undefined, null, { isCanceled: true }))).toBeNull()
    })

    /** This endpoint has no capability gate, so a 403 here is the backend's own sentence. */
    it('keeps a 403', () => {
        expect(unlockErrorText(err(403, { message: 'Region not supported' }))).toBe(
            'Region not supported',
        )
    })

    it('is null for anything that is not an ApiError', () => {
        expect(unlockErrorText(new Error('boom'))).toBeNull()
        expect(unlockErrorText('boom')).toBeNull()
    })

    /** Longer than a sentence is not a sentence for a user — it is a dump. */
    it('refuses a body over 200 characters', () => {
        expect(unlockErrorText(err(400, { message: 'x'.repeat(200) }))).toHaveLength(200)
        expect(unlockErrorText(err(400, { message: 'x'.repeat(201) }))).toBeNull()
    })
})
