import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
    boolish,
    count,
    id,
    nullable,
    nullableId,
    nullableNumber,
    nullableText,
    nullableTimestamp,
} from './wire'

/**
 * These helpers all fail by returning `null`, which is why they are tested rather than trusted.
 *
 * A wrong one does not throw — it discards a field, and the screen renders with a row missing. That
 * is not hypothetical: `nullableTimestamp` exists because every `created_at` was declared
 * `nullableText`, the backend answers epoch milliseconds as a number, and the joined-date row had
 * never rendered for any channel with nothing to say so. The number cases below are that bug.
 */

describe('nullableText', () => {
    it('trims, and treats blank as absent', () => {
        expect(nullableText.parse('  hello  ')).toBe('hello')
        expect(nullableText.parse('   ')).toBeNull()
        expect(nullableText.parse('')).toBeNull()
    })

    it('answers null for every non-string, rather than coercing', () => {
        // A number that stringifies plausibly is the dangerous case: coercing it here is how a
        // timestamp ends up as the string '1660516880264', which is an Invalid Date downstream.
        expect(nullableText.parse(1660516880264)).toBeNull()
        expect(nullableText.parse(null)).toBeNull()
        expect(nullableText.parse(undefined)).toBeNull()
        expect(nullableText.parse({})).toBeNull()
        expect(nullableText.parse([])).toBeNull()
    })
})

describe('id', () => {
    it('normalises either wire type to a string', () => {
        expect(id.parse('abc')).toBe('abc')
        expect(id.parse(42)).toBe('42')
    })

    it('answers the empty string when it cannot parse — absence is the caller’s problem', () => {
        expect(id.parse(null)).toBe('')
        expect(id.parse(undefined)).toBe('')
        expect(id.parse({})).toBe('')
    })
})

describe('nullableId', () => {
    it('normalises like id but keeps absence absent', () => {
        expect(nullableId.parse('abc')).toBe('abc')
        expect(nullableId.parse(42)).toBe('42')
        expect(nullableId.parse(null)).toBeNull()
    })

    it('never answers the empty string — that would build a request against a path with a hole', () => {
        // `''` here becomes `…/posts//`, which is the whole reason this differs from `id`.
        expect(nullableId.parse('')).toBeNull()
        expect(nullableId.parse('   ')).toBeNull()
    })

    it('rejects a non-finite number rather than stringifying it', () => {
        expect(nullableId.parse(Number.NaN)).toBeNull()
        expect(nullableId.parse(Number.POSITIVE_INFINITY)).toBeNull()
    })
})

describe('nullableTimestamp', () => {
    it('accepts epoch milliseconds as a number — the case that was silently discarded', () => {
        expect(nullableTimestamp.parse(1660516880264)).toBe('2022-08-14T22:41:20.264Z')
    })

    it('accepts a digit string as an epoch too', () => {
        expect(nullableTimestamp.parse('1660516880264')).toBe('2022-08-14T22:41:20.264Z')
    })

    it('reads a value below 1e11 as seconds', () => {
        // 1e11 ms is 1973 and 1e11 s is the year 5138, so the threshold is unambiguous for any
        // real date.
        expect(nullableTimestamp.parse(1660516880)).toBe('2022-08-14T22:41:20.000Z')
    })

    it('passes an ISO string through as itself', () => {
        expect(nullableTimestamp.parse('2022-08-14T22:41:20.264Z')).toBe('2022-08-14T22:41:20.264Z')
    })

    it('answers null for absent, blank, zero, negative and unparseable values', () => {
        expect(nullableTimestamp.parse(null)).toBeNull()
        expect(nullableTimestamp.parse('')).toBeNull()
        expect(nullableTimestamp.parse(0)).toBeNull()
        expect(nullableTimestamp.parse(-1)).toBeNull()
        expect(nullableTimestamp.parse('not a date')).toBeNull()
        expect(nullableTimestamp.parse({})).toBeNull()
    })
})

describe('boolish', () => {
    it('coerces, and defaults an absent flag to false rather than undefined', () => {
        expect(boolish.parse(true)).toBe(true)
        expect(boolish.parse(false)).toBe(false)
        expect(boolish.parse(undefined)).toBe(false)
        expect(boolish.parse(null)).toBe(false)
        expect(boolish.parse(0)).toBe(false)
        expect(boolish.parse(1)).toBe(true)
    })
})

describe('count', () => {
    it('coerces a tally and floors absence at zero', () => {
        expect(count.parse(12)).toBe(12)
        expect(count.parse('12')).toBe(12)
        expect(count.parse(null)).toBe(0)
        expect(count.parse(undefined)).toBe(0)
    })

    it('answers zero for a negative or fractional tally rather than passing it on', () => {
        expect(count.parse(-3)).toBe(0)
        expect(count.parse(1.5)).toBe(0)
    })
})

describe('nullableNumber', () => {
    it('keeps a real number, including zero', () => {
        expect(nullableNumber.parse(1920)).toBe(1920)
        // Zero is a legitimate dimension answer and must not collapse to null.
        expect(nullableNumber.parse(0)).toBe(0)
        expect(nullableNumber.parse(-1)).toBe(-1)
    })

    it('parses a numeric string', () => {
        expect(nullableNumber.parse('1920')).toBe(1920)
        expect(nullableNumber.parse(' 1.5 ')).toBe(1.5)
    })

    it('answers null where a caller would otherwise divide by a fabricated zero', () => {
        expect(nullableNumber.parse(null)).toBeNull()
        expect(nullableNumber.parse('')).toBeNull()
        expect(nullableNumber.parse('wide')).toBeNull()
        expect(nullableNumber.parse(Number.NaN)).toBeNull()
        expect(nullableNumber.parse(Number.POSITIVE_INFINITY)).toBeNull()
    })
})

describe('nullable', () => {
    const schema = nullable(z.object({ url: nullableText }))

    it('collapses a missing key and an explicit null to the same value', () => {
        expect(schema.parse(undefined)).toBeNull()
        expect(schema.parse(null)).toBeNull()
    })

    it('parses a present object', () => {
        expect(schema.parse({ url: 'https://tevi.com' })).toEqual({ url: 'https://tevi.com' })
    })

    it('answers null rather than throwing when the inner shape does not parse', () => {
        expect(schema.parse('not an object')).toBeNull()
    })
})
