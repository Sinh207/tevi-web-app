/**
 * The one piece of calendar knowledge that is neither in the design system nor in `Intl` everywhere:
 * **which day a week starts on.**
 *
 * `Intl.DateTimeFormat` gives every month name, weekday name and numeral for all nine locales, so a
 * calendar needs no locale data bundled — except this. A grid whose first column is Monday for an
 * Egyptian reader (whose week starts Saturday) is not a translation bug, it is a *wrong calendar*:
 * every date sits in the wrong column and the weekend is in the middle.
 *
 * `Intl.Locale.prototype.getWeekInfo` answers it from CLDR, and is the right source — but it is
 * recent (Chrome 130, Safari 17) and still missing in Firefox, so an explicit table stands behind
 * it. Nine entries, checked against CLDR's `weekData`, is cheaper than shipping a locale library and
 * more honest than assuming Monday.
 */

/** JavaScript's own numbering: 0 = Sunday … 6 = Saturday, as `Date.prototype.getDay` reports it. */
export type WeekDayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

/**
 * CLDR `weekData/firstDay` for the locales this app ships, by **language**, not region.
 *
 * A bare language tag resolves to CLDR's default region for it — `ar` to Egypt, which starts its
 * week on **Saturday** — which is why this table is keyed the way the app's locale codes are and not
 * by country. `ms` and `vi` start on Monday; everything else here starts on Sunday.
 *
 * A locale not in the table falls back to Monday, the world default, rather than to English's Sunday:
 * a new locale is far more likely to be European or Asian-Monday than American.
 */
/**
 * Exported **for the test that compares it against live `Intl`**, and for nothing else — call
 * `firstDayOfWeek`, which prefers `Intl` and falls back to this.
 *
 * That test is the reason `zh-CN` was wrong for as long as it was: asserting either path on its own
 * cannot catch the two disagreeing, and a disagreement here is a calendar that changes shape with the
 * browser.
 */
export const FIRST_DAY_FALLBACK: Record<string, WeekDayIndex> = {
    en: 0,
    ar: 6,
    fil: 0,
    id: 0,
    ko: 0,
    ms: 1,
    vi: 1,
    /*
     * **Monday.** CLDR 43 changed `CN` from `sun` to `mon`, so live `Intl` answers 1 — and this table
     * answered 0, which meant one function gave two answers for one locale: a 简体中文 reader got a
     * Monday-first grid in Chrome/Safari (which expose `weekInfo`) and a Sunday-first grid in Firefox
     * (which does not, so this fallback ran). Every date one column over, weekend in the middle —
     * exactly the failure the header above says this file exists to prevent.
     */
    'zh-CN': 1,
    'zh-TW': 0,
}

/** What CLDR calls day 1…7 (Monday…Sunday) in JavaScript's 0…6 (Sunday…Saturday). */
function fromCldrDay(day: number): WeekDayIndex | null {
    if (!Number.isInteger(day) || day < 1 || day > 7) return null
    return (day === 7 ? 0 : day) as WeekDayIndex
}

export function firstDayOfWeek(locale: string): WeekDayIndex {
    try {
        // Two spellings of the same thing: `getWeekInfo()` is the standardised one, `weekInfo` is
        // the getter Safari shipped first. Both return CLDR day numbers.
        const info = new Intl.Locale(locale) as Intl.Locale & {
            getWeekInfo?: () => { firstDay?: number }
            weekInfo?: { firstDay?: number }
        }
        const firstDay = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay
        const mapped = typeof firstDay === 'number' ? fromCldrDay(firstDay) : null
        if (mapped !== null) return mapped
    } catch {
        // A malformed tag must not take a calendar down — fall through to the table.
    }
    // The exact tag first (`zh-CN` is not `zh`), then its base language, then Monday.
    return FIRST_DAY_FALLBACK[locale] ?? FIRST_DAY_FALLBACK[locale.split('-')[0]] ?? 1
}
