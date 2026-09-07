import { describe, expect, it } from 'vitest'
import { formatTransferDay, transferDayKey } from './transfer-time'

/**
 * The day grouping, which has one decision in it worth pinning: the **key is local, not UTC**.
 *
 * A transfer at 07:00 in Ho Chi Minh City is the previous day in UTC, so keying off `toISOString()` files
 * the row under a header dated the day before the one the row itself shows. That is invisible in a London
 * test run and wrong for most of this product's users, which is exactly the kind of bug a test has to
 * hold — hence `TZ` is pinned per case rather than trusted.
 */

/** Run a case in a fixed zone. `Intl` reads the environment, so it has to be set before the call. */
function inZone<T>(zone: string, run: () => T): T {
    const previous = process.env.TZ
    process.env.TZ = zone
    try {
        return run()
    } finally {
        process.env.TZ = previous
    }
}

describe('transferDayKey', () => {
    it('is ISO order, so it sorts and compares as a string', () => {
        expect(transferDayKey(Date.UTC(2026, 7, 18, 12, 0))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('keys by the reader’s own day, not by UTC', () => {
        // 23:30 UTC on the 17th is already the 18th in Ho Chi Minh City (+07).
        const ms = Date.UTC(2026, 7, 17, 23, 30)
        expect(inZone('Asia/Ho_Chi_Minh', () => transferDayKey(ms))).toBe('2026-08-18')
        expect(inZone('UTC', () => transferDayKey(ms))).toBe('2026-08-17')
    })

    it('gives two transfers on the same local day the same key', () => {
        const morning = Date.UTC(2026, 7, 18, 1, 0)
        const evening = Date.UTC(2026, 7, 18, 15, 0)
        expect(inZone('Asia/Ho_Chi_Minh', () => transferDayKey(morning))).toBe(
            inZone('Asia/Ho_Chi_Minh', () => transferDayKey(evening)),
        )
    })
})

describe('formatTransferDay', () => {
    it('is numeric and locale-ordered — the field order is the locale’s, not legacy’s', () => {
        const ms = Date.UTC(2026, 7, 18, 12, 0)
        expect(formatTransferDay(ms, 'en-GB')).toBe('18/08/2026')
        expect(formatTransferDay(ms, 'en-US')).toBe('08/18/2026')
    })

    it('falls back to `en` for a locale tag Intl refuses, rather than throwing', () => {
        // This label sits above every row in the list: one bad tag must not blank the whole history.
        expect(formatTransferDay(Date.UTC(2026, 7, 18, 12, 0), 'not-a-locale')).toMatch(/2026/)
    })

    it('labels and keys agree about which day it is', () => {
        const ms = Date.UTC(2026, 7, 17, 23, 30)
        inZone('Asia/Ho_Chi_Minh', () => {
            expect(transferDayKey(ms)).toBe('2026-08-18')
            expect(formatTransferDay(ms, 'en-GB')).toBe('18/08/2026')
        })
    })
})
