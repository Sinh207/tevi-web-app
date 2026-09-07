import { describe, expect, it } from 'vitest'
import { fromDateValue, toDateValue } from './date-value'

/**
 * The two conversions that decide whether a birthday is off by a day — see the module's own header for
 * why each direction has its own trap. These assertions are the reason the `Date` constructor and
 * `toISOString` do not appear at any call site.
 */

describe('toDateValue', () => {
    it('reads the local fields, not the UTC ones', () => {
        // 23:30 local on the 19th is the 20th in UTC east of Greenwich; the answer is still the 19th.
        expect(toDateValue(new Date(2025, 1, 19, 23, 30))).toBe('2025-02-19')
        expect(toDateValue(new Date(2025, 1, 19, 0, 15))).toBe('2025-02-19')
    })

    it('pads single digits, which the format requires', () => {
        expect(toDateValue(new Date(2025, 0, 5))).toBe('2025-01-05')
    })
})

describe('fromDateValue', () => {
    it('rejects a date that does not exist instead of rolling it over', () => {
        /*
         * `new Date(y, m - 1, d)` rolls over rather than failing, so these all used to come back as a
         * *different, valid* date — and the `isNaN` guard could never fire. `"1990-02-30"` displayed
         * as "2 March 1990" in the profile form while the validator beside it called the same string
         * invalid.
         */
        expect(fromDateValue('1990-02-30')).toBeNull()
        expect(fromDateValue('2025-02-31')).toBeNull()
        expect(fromDateValue('2025-13-01')).toBeNull()
        expect(fromDateValue('2025-01-00')).toBeNull()
    })

    it('keeps a two-digit-looking year in its own century', () => {
        // `new Date(50, …)` is 1950. A four-digit year must mean what it says.
        expect(fromDateValue('0050-06-15')).toBeNull()
    })

    it('still accepts a leap day that exists', () => {
        expect(fromDateValue('2024-02-29')?.getDate()).toBe(29)
    })

    it('builds a local midnight, not a UTC one', () => {
        const parsed = fromDateValue('2025-02-19')
        expect(parsed?.getFullYear()).toBe(2025)
        expect(parsed?.getMonth()).toBe(1)
        expect(parsed?.getDate()).toBe(19)
        expect(parsed?.getHours()).toBe(0)
    })

    it('round-trips', () => {
        const day = new Date(1996, 3, 12)
        expect(fromDateValue(toDateValue(day))?.getTime()).toBe(day.getTime())
    })

    it.each(['', '   ', '19/02/2025', '2025-2-9', '2025-02-19T00:00:00Z', 'today'])(
        'rejects %o',
        value => {
            expect(fromDateValue(value)).toBeNull()
        },
    )
})
