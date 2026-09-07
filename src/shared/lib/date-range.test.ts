import { describe, expect, it } from 'vitest'
import { nextRangeAfterPress, rangeDayCount } from './date-range'

const day = (d: number, month = 1) => new Date(2025, month, d)

describe('nextRangeAfterPress', () => {
    it('starts a range on the first press', () => {
        expect(nextRangeAfterPress(undefined, day(5))).toEqual({ from: day(5), to: undefined })
    })

    it('closes it on the second', () => {
        expect(nextRangeAfterPress({ from: day(5) }, day(20))).toEqual({
            from: day(5),
            to: day(20),
        })
    })

    it('closes it backwards when the second press is earlier', () => {
        // A reader working right-to-left still gets an ordered range rather than an empty one.
        expect(nextRangeAfterPress({ from: day(20) }, day(5))).toEqual({
            from: day(5),
            to: day(20),
        })
    })

    it('starts a new range instead of nudging a finished one', () => {
        /*
         * The behaviour RDP gets wrong twice over — it extends or shrinks the existing range, and
         * when it is fed the hover preview it answers a second press with `{from: pressed, to:
         * pressed}`, dropping the start. Both were live bugs; this is the rule the two cells promise.
         */
        expect(nextRangeAfterPress({ from: day(21, 0), to: day(19) }, day(5))).toEqual({
            from: day(5),
            to: undefined,
        })
    })

    it('allows a single-day range', () => {
        expect(nextRangeAfterPress({ from: day(5) }, day(5))).toEqual({ from: day(5), to: day(5) })
    })
})

describe('rangeDayCount', () => {
    it('is null until both ends exist', () => {
        expect(rangeDayCount(undefined)).toBeNull()
        expect(rangeDayCount({ from: day(5) })).toBeNull()
    })

    it('counts inclusively', () => {
        expect(rangeDayCount({ from: day(5), to: day(5) })).toBe(1)
        expect(rangeDayCount({ from: day(5), to: day(20) })).toBe(16)
    })

    it('ignores a time of day on either end', () => {
        // The range a screen hands over ends at 23:59:59.999 — the dialog used to read that as an
        // extra day and print "31 days" over a 30-day range.
        const from = new Date(2025, 0, 21, 0, 0, 0, 0)
        const to = new Date(2025, 1, 19, 23, 59, 59, 999)
        expect(rangeDayCount({ from, to })).toBe(30)
    })

    it('survives a range that crosses a DST change', () => {
        // Whatever the runtime's zone does with these, the count is whole days and never off by one.
        const from = new Date(2025, 2, 1)
        const to = new Date(2025, 3, 1)
        expect(rangeDayCount({ from, to })).toBe(32)
    })
})
