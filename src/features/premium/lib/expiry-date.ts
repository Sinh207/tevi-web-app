/**
 * The date a Premium grant runs out — `Feb 19, 2026` in English, `19 Feb 2026` elsewhere — the reader's own order.
 *
 * ## A date, not a moment, and therefore no time on it
 *
 * `expires_at` is when the subscription renews or lapses. What the reader needs is the **day**;
 * printing `14:32` beside it invites the question of whose clock that is, on a figure nobody can act
 * on to the minute. `formatLedgerDateTime` makes the opposite call for the opposite reason — a
 * ledger row *is* a moment — and both are argued at their own definitions.
 *
 * ## Two failure paths, both silent by design
 *
 * `''` for anything unusable, so the caller drops the line rather than printing `Invalid Date`;
 * and a locale tag `Intl` refuses falls back to `en` rather than throwing, which is the rule every
 * formatter in this repo follows (`Intl.DateTimeFormat` raises a `RangeError` on an unrecognised
 * tag, and this one sits on a screen whose whole subject is a subscription).
 *
 * Kept in this feature rather than `shared/lib`: one reader, and a formatter is not worth widening a
 * barrel for. If a second feature needs the same shape it moves, per the rule `money.ts` states.
 */
const FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

export function formatExpiryDate(value: number | null | undefined, locale = 'en'): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    try {
        return new Intl.DateTimeFormat(locale, FORMAT).format(date)
    } catch {
        return new Intl.DateTimeFormat('en', FORMAT).format(date)
    }
}
