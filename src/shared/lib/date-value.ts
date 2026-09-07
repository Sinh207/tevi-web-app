/**
 * `YYYY-MM-DD` ↔ `Date`, in **local** time.
 *
 * This shape is the app's wire format for a bare date: it is what the account's `dob` arrives as
 * (`accountDob`), what `features/channel`'s validators compare (`dateOfBirthError`,
 * `maxDateOfBirth`), and what `DateField` reads and writes. It stayed after the native
 * `<input type="date">` was replaced, precisely so none of that had to change.
 *
 * Both directions exist to avoid the same bug from opposite sides, and it is the most common date bug
 * there is:
 *
 * - `new Date('2025-02-19')` parses as **UTC** midnight per the spec, so for every reader west of
 *   Greenwich it is the 18th in local time. A picker seeded that way shows the day before the one it
 *   was given.
 * - `date.toISOString().slice(0, 10)` converts *to* UTC, so a date chosen in the evening east of
 *   Greenwich is written as the day after.
 *
 * Neither shows up in the timezone most of this team develops in, which is why the conversion lives in
 * one tested place rather than at each call site.
 */

/** `Date` → `YYYY-MM-DD`, from the date's **local** fields. */
export function toDateValue(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
}

/**
 * `YYYY-MM-DD` → a local `Date` at midnight, or `null`.
 *
 * `null` rather than an `Invalid Date` for anything that is not exactly that shape: the value can come
 * from an API, from a URL or from storage, and a caller that has to test `Number.isNaN(date.getTime())`
 * is a caller that will forget to.
 *
 * ## The shape is not enough — the date has to **exist**
 *
 * `new Date(y, m - 1, d)` does not reject an impossible date, it **rolls it over**, and the
 * `Number.isNaN` guard this used to end with could therefore never fire for a string that matched the
 * regex. Measured before the fix: `1990-02-30` → 2 March 1990, `2025-13-01` → 1 Jan 2026,
 * `2025-01-00` → 31 Dec 2024, and `0050-06-15` → **15 June 1950** (the two-digit-year mapping).
 *
 * The consequence was two collaborators disagreeing about one string: `accountDob` shape-checks too,
 * so `"1990-02-30"` reached the profile form, the `DateField` trigger displayed "2 March 1990", and
 * `dateOfBirthError` — which parses with `new Date('1990-02-30T00:00:00')`, i.e. an *Invalid Date* —
 * printed "enter a valid date of birth" under a field showing a perfectly ordinary date.
 *
 * So the parsed date is read back and compared: a rollover changes at least one of the three parts,
 * which is the only check that catches all of the cases above including the year mapping.
 */
export function fromDateValue(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
    if (!match) return null
    const [, year, month, day] = match
    const y = Number(year)
    const m = Number(month)
    const d = Number(day)
    const date = new Date(y, m - 1, d)
    if (Number.isNaN(date.getTime())) return null
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
    return date
}
