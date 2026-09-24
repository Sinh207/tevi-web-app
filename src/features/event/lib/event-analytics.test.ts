import { describe, expect, it } from 'vitest'
import { formatCount, formatDuration } from './event-analytics'

describe('formatCount', () => {
    it('localises, and floors a negative to zero', () => {
        expect(formatCount(1234, 'en')).toBe('1,234')
        expect(formatCount(1234, 'vi')).toBe('1.234')
        expect(formatCount(-5)).toBe('0')
    })

    it('is zero for absent or unparseable', () => {
        expect(formatCount(null)).toBe('0')
        expect(formatCount(undefined)).toBe('0')
        expect(formatCount(Number.NaN)).toBe('0')
    })
})

describe('formatDuration', () => {
    it('formats seconds as HH:MM:SS', () => {
        expect(formatDuration(0)).toBe('00:00:00')
        expect(formatDuration(59)).toBe('00:00:59')
        expect(formatDuration(60)).toBe('00:01:00')
        expect(formatDuration(3661)).toBe('01:01:01')
    })

    /**
     * ⚠ **The bug this function exists for.** Legacy computes
     * `new Date(seconds * 1000).toISOString().substring(11, 19)`, which is a *time of day* and
     * therefore modulo 24 hours: 25 hours reads `01:00:00` and 24 hours reads `00:00:00`.
     *
     * `live_duration` is rarely that long. **`total_view_duration` is every viewer's watch time
     * added together**, so it passes 24 hours on essentially every real broadcast — the field that
     * wraps is the one that always wraps.
     */
    it('does not wrap at 24 hours', () => {
        expect(formatDuration(24 * 3600)).toBe('24:00:00')
        expect(formatDuration(25 * 3600)).toBe('25:00:00')
        expect(formatDuration(1000 * 3600 + 61)).toBe('1000:01:01')
    })

    it('floors a fractional second rather than printing a decimal', () => {
        expect(formatDuration(90.7)).toBe('00:01:30')
    })

    it('is zero for absent, negative or unparseable', () => {
        expect(formatDuration(null)).toBe('00:00:00')
        expect(formatDuration(undefined)).toBe('00:00:00')
        expect(formatDuration(-10)).toBe('00:00:00')
        expect(formatDuration(Number.NaN)).toBe('00:00:00')
        expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('00:00:00')
    })
})
