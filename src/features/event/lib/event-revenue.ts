import type { BillLine, EventBill } from '../api/report-types'

/**
 * The **arithmetic** on an event's bill — which category is which, what a line is worth, and what
 * the two of them add up to.
 *
 * Pure, and separate from the cards for one reason: legacy computes all of this inline in
 * `useCreator` and in each accordion, and the total is a **four-branch nested ternary** whose bug is
 * invisible until you read it against a real payload. See `billTotal` below.
 *
 * ## Money stays a string until the last moment
 *
 * The wire sends decimal strings; `report-types.ts` keeps them as strings. Here they become numbers
 * exactly once, for adding, and go back out as numbers for a formatter. `Number`, never `parseInt` —
 * a `"3.50"` service fee must not become `3`, which is the trap `@features/event/access` records
 * from the other end.
 *
 * ## USD, and it is pinned rather than chosen
 *
 * Every figure on this report is USD: legacy prints `${…}` throughout and the payload carries a
 * `currency` this client does not read. That is the same position `features/earnings` is in, and it
 * is **B29** — when that is answered, both become callers of `shared/lib/money.ts` rather than
 * staying pinned. Recorded here so the two do not diverge in the meantime.
 */

/**
 * A figure from the wire, as a number. `null` for absent or unparseable — **never `0`**.
 *
 * ⚠ The blank check is not defensive decoration: **`Number('')` is `0`**, and `Number('   ')` is
 * `0` too. Without it an empty `net_amount` contributes zero to a total instead of being skipped,
 * which is the difference between "this half earned nothing" and "this half did not report" —
 * indistinguishable in today's output (both print `$0`) and exactly the kind of thing that bites
 * the next caller. Caught by the test, not by reading the code.
 */
export function toAmount(value: string | null | undefined): number | null {
    if (value === null || value === undefined) return null
    if (value.trim() === '') return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
}

/**
 * The **Live** half of the bill — tickets, gifts, interactive games.
 *
 * Found by `category`, never by index. Legacy does the same and it matters: a payload that listed
 * `ACTION` first would otherwise file sustained-viewer earnings under *Live revenue*.
 */
export function liveBill(bills: EventBill[]): EventBill | null {
    return bills.find(bill => bill.category === 'LIVE') ?? null
}

/** The **Interactive** half — live chats and sustained viewers. */
export function interactiveBill(bills: EventBill[]): EventBill | null {
    return bills.find(bill => bill.category === 'ACTION') ?? null
}

/**
 * One line's total.
 *
 * ⚠ **`subtotal` falls back to `amount`, and the fallback is load-bearing.** Legacy applies it to
 * the *gift* row only (`giftRevenue?.subtotal?.amount ? … : giftRevenue?.amount?.amount ? … : 0`)
 * and to every row of the interactive half — but **not** to its ticket or interactive-games rows,
 * which read `subtotal` alone. So a payload that sends `amount` without `subtotal` prints `$0` for
 * tickets and the real figure for gifts, on the same card, from the same shape.
 *
 * There is no reading of that inconsistency under which it is deliberate, so the fallback is
 * applied uniformly here. `null` means neither field was usable, which the caller prints as `$0` —
 * the same as legacy, and correct: a line that exists with no figure earned nothing.
 */
export function billLineTotal(line: BillLine | null | undefined): number | null {
    if (!line) return null
    return toAmount(line.subtotal?.amount) ?? toAmount(line.amount?.amount)
}

/** A named line out of a category — `'ticket'`, `'gift'`, `'consumables'`, `'view_cost'`, … */
export function billLine(bill: EventBill | null, type: string): BillLine | null {
    if (!bill) return null
    // Lower-cased at the comparison, as legacy does: `type` is two overlapping vocabularies rather
    // than a closed union, so the schema deliberately leaves the case alone.
    return bill.bill_detail.revenue.find(line => line.type?.toLowerCase() === type) ?? null
}

/**
 * **Total revenue** — the sticky figure at the foot of the page.
 *
 * `net_amount` of both categories, added. Simple, and legacy's version is not:
 *
 * ```js
 * liveRevenue?.net_amount && interactiveRevenue?.net_amount
 *     ? format(parseFloat(live.net_amount) + parseFloat(interactive.net_amount))
 *     : liveRevenue?.net_amount ? format(live.net_amount)
 *     : interactiveRevenue?.net_amount ? format(interactive.net_amount)
 *     : 0
 * ```
 *
 * ⚠ Four branches guarded on **truthiness of a string**, which makes `"0.00"` truthy and `"0"`
 * truthy — but `""` and a missing field falsy. So a creator whose live half earned `"0.00"` and
 * whose interactive half earned `"12.50"` gets the first branch and the right answer; one whose live
 * half is *absent* and interactive is `"12.50"` gets the third and also the right answer. It happens
 * to work. What does not is the arithmetic branch on a payload where one side is `"12.5"` and the
 * other is a non-numeric string — `parseFloat` yields `NaN`, the sum is `NaN`, and
 * `Intl.NumberFormat().format(NaN)` prints **"NaN"** on the creator's revenue line.
 *
 * Here each side is parsed independently, unparseable sides are *skipped* rather than poisoning the
 * sum, and `null` is returned only when **neither** side had a figure — which the card prints as
 * `$0`. A total is never `NaN` and never a partial lie.
 */
export function billTotal(bills: EventBill[]): number | null {
    const parts = [liveBill(bills), interactiveBill(bills)]
        .map(bill => toAmount(bill?.net_amount))
        .filter((n): n is number => n !== null)
    if (parts.length === 0) return null
    return parts.reduce((sum, n) => sum + n, 0)
}

/** The MCN's cut of one category, or `null`. Printed as a negative, and only when above zero. */
export function mcnCommission(bill: EventBill | null): number | null {
    const amount = toAmount(bill?.bill_detail.commissionMcn?.amount)
    return amount !== null && amount > 0 ? amount : null
}

/**
 * `$1,234.5` — a USD figure with the symbol pinned in front.
 *
 * ## Why not `style: 'currency'`
 *
 * The same measurement `formatIncomeUsd` and `formatEarningsAmount` both record: `Intl` formats USD
 * the way each locale writes *foreign* money, so a Vietnamese reader looking at USD gets
 * `1.234,5 US$` and an Arabic one gets `‏1,234.5 US$`. Legacy builds the string as `` `$${…}` ``
 * and the DS draws it that way. What stays localised is the separator, which is what should.
 *
 * `null` prints `$0` rather than an empty cell: on a bill, "no figure" and "nothing" are the same
 * statement, and a blank where a number belongs reads as a failure to load.
 */
export function formatRevenue(amount: number | null, locale = 'en'): string {
    const value = amount ?? 0
    try {
        return `$${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}`
    } catch {
        // An unrecognised locale tag must not take a revenue screen down.
        return `$${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value)}`
    }
}

/** `x12` — a quantity. `null` and `0` both print `x0`, as legacy's do. */
export function formatQuantity(quantity: number | null | undefined, locale = 'en'): string {
    const value = typeof quantity === 'number' && Number.isFinite(quantity) ? quantity : 0
    try {
        return new Intl.NumberFormat(locale).format(value)
    } catch {
        return new Intl.NumberFormat('en').format(value)
    }
}
