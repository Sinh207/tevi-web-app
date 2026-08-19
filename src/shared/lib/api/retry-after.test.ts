import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRetryAfter } from './client'

afterEach(() => {
    vi.useRealTimers()
})

describe('parseRetryAfter', () => {
    it('reads delay-seconds', () => {
        expect(parseRetryAfter('5')).toBe(5000)
        expect(parseRetryAfter('  8 ')).toBe(8000)
        expect(parseRetryAfter('0')).toBe(0)
    })

    it('reads the HTTP-date form RFC 9110 also allows', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-06T00:00:00Z'))
        expect(parseRetryAfter('Thu, 06 Aug 2026 00:00:10 GMT')).toBe(10_000)
    })

    // The cap is 10s, matching the doc comment's own argument that holding a request
    // open is worse for the caller than failing and letting them decide. It used to
    // be 30s, which two retries could stack into a two-minute wait behind a spinner.
    it('drops hints further out than the cap — failing now beats hanging for minutes', () => {
        expect(parseRetryAfter('11')).toBeNull()
        expect(parseRetryAfter('600')).toBeNull()
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-06T00:00:00Z'))
        expect(parseRetryAfter('Thu, 06 Aug 2026 01:00:00 GMT')).toBeNull()
    })

    it('drops dates already in the past', () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-06T00:00:00Z'))
        expect(parseRetryAfter('Thu, 06 Aug 2026 00:00:00 GMT')).toBe(0)
        expect(parseRetryAfter('Wed, 05 Aug 2026 23:00:00 GMT')).toBeNull()
    })

    it('returns null for anything unusable, so the caller keeps its own backoff', () => {
        expect(parseRetryAfter(undefined)).toBeNull()
        expect(parseRetryAfter(null)).toBeNull()
        expect(parseRetryAfter('')).toBeNull()
        expect(parseRetryAfter('   ')).toBeNull()
        expect(parseRetryAfter('soon')).toBeNull()
        expect(parseRetryAfter(5)).toBeNull()
        expect(parseRetryAfter('-3')).toBeNull()
    })
})
