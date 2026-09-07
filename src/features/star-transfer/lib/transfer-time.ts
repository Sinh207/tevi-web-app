/**
 * Grouping a transfer list **by day**, which is what `web-app` does on this screen.
 *
 * `shared/lib/ledger-time.ts` has the month helpers `/my-star` and `/my-wallet` group by, and this
 * screen briefly used them — one header per month, on the argument that three histories in one app
 * should bucket the same way. Wrong reference: legacy groups this list per day (`dd/MM/yyyy`), and a
 * transfer list is read as *"what did I send on Tuesday"*, not as a monthly statement.
 *
 * Not added to `shared/lib/` because nothing else needs it: two screens group by month, one by day, and
 * a helper moves to `shared/` when a second caller appears — not in anticipation.
 */

/**
 * The day's label, in the reader's locale — `18/08/2026`, `2026/08/18`, `08/18/2026`.
 *
 * `Intl` rather than legacy's hard-coded `dd/MM/yyyy`: the *pattern* is a formatting decision that
 * belongs to the locale, and every other date in this app is formatted this way
 * (`formatLedgerMonth`, `formatLedgerDateTime`). What is faithful to legacy here is grouping by day and
 * printing a numeric date; forcing British field order on a Korean reader is not part of that.
 *
 * An unrecognised locale tag throws a `RangeError`, and this label sits above every row in the list, so
 * the fallback is `en` — the app's own fallback locale. Same guard as `shared/lib/money.ts`'s.
 */
export function formatTransferDay(value: number, locale = 'en'): string {
    const options: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }
    try {
        return new Intl.DateTimeFormat(locale, options).format(new Date(value))
    } catch {
        return new Intl.DateTimeFormat('en', options).format(new Date(value))
    }
}

/**
 * The day's identity — `2026-08-18`, in the **reader's own timezone**.
 *
 * Locale-independent, so switching language re-labels the groups without re-bucketing them (the trap
 * `ledgerMonthKey` names). Built from `en-CA`, whose short date *is* ISO order, rather than from
 * `toISOString()` — that would key by UTC, so a transfer at 07:00 in Ho Chi Minh City would file itself
 * under the previous day and appear under a header dated the day before the one the row shows.
 */
export function transferDayKey(value: number): string {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date(value))
    } catch {
        // No `Intl` at all: a stable key still has to come out, and UTC is only wrong at the edges.
        return new Date(value).toISOString().slice(0, 10)
    }
}
