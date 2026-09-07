import { SUPPORTED_LOCALES } from '@shared/i18n/settings'
import { describe, expect, it, vi } from 'vitest'
import { FIRST_DAY_FALLBACK, firstDayOfWeek } from './calendar-locale'

/**
 * Which column the week starts in. Worth a test because the failure is a *plausible* calendar —
 * every date one column out, and only for some readers.
 */

describe('firstDayOfWeek', () => {
    it('agrees with live Intl for every locale the app ships', () => {
        /*
         * The failure this pins: the table and the `Intl` branch disagreed on `zh-CN`, so the answer
         * depended on the browser. Comparing the two paths for all nine locales is the only assertion
         * that catches it — asserting either path alone cannot.
         */
        for (const locale of SUPPORTED_LOCALES) {
            const info = new Intl.Locale(locale) as Intl.Locale & {
                getWeekInfo?: () => { firstDay?: number }
                weekInfo?: { firstDay?: number }
            }
            const cldr = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay
            if (typeof cldr !== 'number') continue
            const expected = cldr === 7 ? 0 : cldr
            expect(FIRST_DAY_FALLBACK[locale], `${locale} table vs Intl`).toBe(expected)
        }
    })

    it('reads CLDR through Intl where the runtime has it', () => {
        // The values below are Intl's own on this Node build; the point of the assertion is the
        // mapping from CLDR's 1…7 (Mon…Sun) to JavaScript's 0…6 (Sun…Sat), which is off-by-one-day
        // if it is done naively.
        expect(firstDayOfWeek('en')).toBe(0)
        expect(firstDayOfWeek('vi')).toBe(1)
        expect(firstDayOfWeek('ar')).toBe(6)
    })

    it('falls back to the table when the runtime has no week info', () => {
        const original = Intl.Locale
        // Firefox, and every browser before Chrome 130 / Safari 17.
        class NoWeekInfo {
            constructor(readonly tag: string) {}
        }
        vi.stubGlobal('Intl', { ...Intl, Locale: NoWeekInfo })
        try {
            expect(firstDayOfWeek('ar')).toBe(6)
            expect(firstDayOfWeek('id')).toBe(0)
            expect(firstDayOfWeek('ms')).toBe(1)
            expect(firstDayOfWeek('zh-TW')).toBe(0)
            // A regional tag with no row of its own answers from its language.
            expect(firstDayOfWeek('en-GB')).toBe(0)
            // And an unlisted language is Monday — the world default, not English's Sunday.
            expect(firstDayOfWeek('de')).toBe(1)
        } finally {
            vi.stubGlobal('Intl', { ...Intl, Locale: original })
        }
    })

    it('survives a malformed tag', () => {
        expect(firstDayOfWeek('not a tag')).toBe(1)
    })
})
