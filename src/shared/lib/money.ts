/**
 * Rendering money — the unit-aware formatters every screen that shows a figure shares.
 *
 * ## Why this is `shared/lib` and not a feature's `lib/`
 *
 * Three features render money and none of them owns the arithmetic: `features/balance` puts the
 * account's two figures in the app shell, `features/my-wallet` converts them into the reader's
 * chosen currency, and `features/my-star` renders a Star count. A formatter living in any one of
 * them would make the other two depend on it for something that is not its business — these are
 * pure functions over a number and a currency record, with no API, no hooks and no domain rules.
 *
 * `features/earnings/lib/format.ts` deliberately stays separate and still pins USD; see **B29**.
 * When that question is answered it becomes a caller of this file.
 *
 * ## What is *not* here
 *
 * Anything that knows what `TVS` or `TEVI` mean. That vocabulary is `features/balance`'s
 * (`formatLedgerAmount`), because deciding that a row is Star rather than money is a product fact
 * rather than a formatting one.
 */

/**
 * A currency the wallet can display figures in — the four fields anything rendering money needs.
 *
 * Sourced from `exchange/v1/currencies/` by `features/my-wallet`, which parses the wire shape; this
 * is the parsed form, so nothing here knows about `decimal_digits` vs `decimalDigits`.
 */
export interface Currency {
    /** ISO 4217, upper-cased. */
    code: string
    name: string
    /** `$`, `₫`, `₩`. `''` when the payload had none — the code is shown instead. */
    symbol: string
    /** 2 for USD, **0 for VND**. Goes straight into `Intl`, so callers must keep it in 0–4. */
    decimalDigits: number
}

/**
 * USD — the default, and the fallback for every failure path.
 *
 * Values are legacy's own `DEFAULT_CURRENCY` (`providers/balance/hooks/useCurrency.js`), so a client
 * that never reaches the exchange service still renders the same unit the earnings report does.
 */
export const DEFAULT_CURRENCY: Currency = {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimalDigits: 2,
}

/**
 * A Star amount — `1,284`, in the reader's own digit grouping.
 *
 * ## No decimals, and no currency machinery
 *
 * Star is a count of a virtual item, not money: there is no such thing as 3.5 Star to spend, and
 * legacy formats it with a plain `formatNumber`. Running it through `Intl`'s currency style would be
 * asking for a symbol that does not exist — the Star mark is a **raster PNG**
 * (`/tevi-star.png`, gold with a gradient and a highlight), drawn beside the number by the
 * component, never in the string.
 *
 * A fractional value from the wire is **rounded** rather than truncated: `1,284.5 Star` is a number
 * the product has no meaning for, and truncating would silently favour the platform.
 */
export function formatStarAmount(value: number | null | undefined, locale = 'en'): string {
    const amount = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0
    return formatNumber(amount, locale, { maximumFractionDigits: 0 })
}

/**
 * A fiat amount in a given currency — `₫157,155,000`, `$4,400.03`.
 *
 * ## The symbol is pinned in front, and the separators are the reader's
 *
 * Same call, and the same reasoning, as `formatIncomeUsd` and `formatEarningsAmount`:
 * `Intl.NumberFormat(locale, { style: 'currency' })` formats *foreign* money the way each locale
 * writes it, so a Vietnamese reader looking at USD gets `1.234,56 US$` and a Malay one
 * `USD 1,234.56`. The design draws the symbol leading in all nine locales. So only the mark is
 * pinned; the grouping and decimal separators stay the reader's own.
 *
 * `currency.symbol` can be empty, in which case the **code** goes in front instead
 * (`VND 157,155,000`). A bare number with no unit is the one thing this must not produce.
 *
 * `decimalDigits` is the currency's, not a constant: 2 for USD, **0 for VND**, because
 * `₫157,155,000.00` is not how anybody writes dong. That is also why this cannot reuse
 * `formatEarningsAmount`, which correctly hard-codes 2 for a USD-only column.
 *
 * A negative keeps its sign, with `Intl`'s own minus placement on the number (`-$4.20`). Refunds and
 * payout reversals are real rows, and clamping them to `0` — which `formatIncomeUsd` does,
 * correctly, for a lifetime-income headline — would hide the one row a reader most wants to ask
 * about.
 */
export function formatFiatAmount(
    value: number | null | undefined,
    currency: Currency,
    locale = 'en',
): string {
    const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
    // Clamped here as well as at the boundary: `Intl` throws outside 0–100, and this function is
    // behind every figure on the wallet — one bad record must not blank the card and every row.
    const digits = Math.min(4, Math.max(0, Math.trunc(currency.decimalDigits) || 0))
    const formatted = formatNumber(Math.abs(amount), locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })
    const unit = currency.symbol || currency.code
    // A code needs a space after it; a symbol does not. `$1,000` and `VND 1,000`.
    const prefix = currency.symbol ? unit : `${unit} `
    return amount < 0 ? `-${prefix}${formatted}` : `${prefix}${formatted}`
}

/**
 * A figure with **no unit at all** — `1,234.5`, `-12.5`.
 *
 * For the one case a wallet cannot avoid: a row whose payload carried no currency code. Printing it
 * with a symbol would be inventing the unit, which is the one guess money must not make, and dropping
 * the row would hide a movement from a ledger. So the number is shown as a number.
 *
 * Up to two decimals and no minimum, unlike `formatFiatAmount`: without a currency there is no
 * `decimalDigits` to honour, so `4.2` stays `4.2` rather than becoming a `4.20` that implies cents.
 */
export function formatPlainAmount(value: number | null | undefined, locale = 'en'): string {
    const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
    return formatNumber(amount, locale, { maximumFractionDigits: 2 })
}

/**
 * A figure with its currency **code after it** — `1,240.50 USD`.
 *
 * The payout screens' format, and legacy's: `formatNumber(net_amount, 'en-US', { minimumFractionDigits:
 * 2, maximumFractionDigits: 2 })` followed by `net_amount_currency`. Deliberately not
 * `formatFiatAmount`, which puts a *symbol* in front and honours the currency's own decimal count —
 * both wrong here for the same reason: a payout row states the settlement currency as a code because
 * that is what a bank statement will say, and it always states cents because a payout is an exact
 * amount somebody is owed.
 *
 * **Two decimals, minimum and maximum**, which is the fix this exists for: `formatPlainAmount` has no
 * minimum, so `1240.5` printed as `1,240.5` — a figure that reads like a rounding rather than a
 * balance. Money with a currency behind it shows its cents.
 *
 * An empty `code` yields the bare number rather than a trailing space, which is the one case billy's
 * `net_amount_currency` has been seen to produce.
 *
 * ## The decimal count is the **currency's**, and `Intl` is where it comes from
 *
 * VND has no minor unit, so a settlement in it must read `23,034,486 VND` and not
 * `23,034,486.00 VND`. Legacy prints the `.00`: every payout figure it draws goes through
 * `formatNumber(x, 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`, hard-coded at
 * each of the eleven call sites in `withdrawDetail` and `payoutTracking`, with no currency in the
 * decision. This client reproduced that, on the grounds that `web-app` is the specification — and it
 * is, for behaviour. It is not the specification for a figure that is simply wrong in a currency
 * millions of people are paid in.
 *
 * `currencyFractionDigits` asks `Intl` rather than carrying a table:
 *
 * | code | digits | how |
 * |---|---|---|
 * | `VND`, `JPY`, `KRW` | **0** | ISO 4217, which `Intl` ships |
 * | `USD`, `EUR`, `IDR` | 2 | same |
 * | `USDT`, `TEVI` | 2 | four letters, so `Intl` throws — the fallback |
 * | `TVS`, any unknown three-letter code | 2 | `Intl` answers 2 without complaint |
 *
 * Checked across all nine locales: the count is a property of the **currency**, not of the locale, so
 * `vi` and `en` agree on VND and only the group separator differs (`23.034.486` versus `23,034,486`).
 *
 * A hand-written minor-unit table was the other option and is worse: it would be a second source of
 * truth for something the platform already states in two places — ISO 4217, and `decimal_digits` on
 * `exchange/v1/currencies/`, which `formatFiatAmount` already honours. This formatter cannot reach the
 * second, because its callers hold a bare **code string** (`net_amount_currency`, `methodCurrency`) and
 * not a `Currency` record; `Intl` is the source that needs no plumbing to get there.
 *
 * `digits` is an escape hatch for the caller that *does* hold the record — pass
 * `currency.decimalDigits` and the backend wins over `Intl`. Nothing does yet.
 *
 * ## What stays: the **minimum equals the maximum**
 *
 * A currency with cents shows them — `1240.5` prints `1,240.50`, not `1,240.5`. That was the fix this
 * function was written for, and it is unaffected: only the *number* of digits is now per-currency.
 */
export function formatAmountWithCode(
    value: number | null | undefined,
    code: string,
    locale = 'en',
    digits?: number,
): string {
    const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
    const fraction = digits ?? currencyFractionDigits(code, locale)
    const formatted = formatNumber(amount, locale, {
        minimumFractionDigits: fraction,
        maximumFractionDigits: fraction,
    })
    return code ? `${formatted} ${code}` : formatted
}

/**
 * How many decimals a currency code takes — `0` for VND, `2` for USD, `2` for anything unrecognised.
 *
 * Asked of `Intl` with `style: 'currency'`, which carries the ISO 4217 minor units, then read back off
 * `resolvedOptions()`. The formatter itself is discarded: it would print a *symbol* (`₫23,034,486`)
 * where these screens want the code after the number, which is what a bank statement says.
 *
 * **Throws are the interesting case.** A code longer than three letters — `USDT`, `TEVI`, the two units
 * that appear most often on the payout screens — makes `Intl` throw `RangeError`, so the `catch` is
 * load-bearing rather than defensive. An unknown *three*-letter code does not throw; `Intl` answers 2,
 * which is the same answer the fallback would give.
 *
 * `2` and not `0` as the fallback: a unit we cannot identify is more likely to have cents than not, and
 * hiding a fractional part is losing information where showing an extra `.00` is only noise.
 */
export function currencyFractionDigits(code: string, locale = 'en'): number {
    const trimmed = code.trim()
    if (!trimmed) return 2
    try {
        /*
         * `?? 2`, because TypeScript types `maximumFractionDigits` as optional on
         * `ResolvedNumberFormatOptions` — it is always present for `style: 'currency'` at runtime, but
         * the type is honest about the general case and the fallback is the same one the `catch` uses.
         */
        return (
            new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: trimmed,
            }).resolvedOptions().maximumFractionDigits ?? 2
        )
    } catch {
        return 2
    }
}

/**
 * Convert a USD figure into another currency.
 *
 * Its own function, separate from the formatter, because the two are different decisions and only
 * one of them is reversible. Nothing may ever *store* the product — the account's balance is USD and
 * the rate moves, so a converted number written anywhere is a figure that was true once.
 *
 * A rate of `1` makes this the identity, which is what lets a dead exchange service degrade to
 * showing USD rather than to an error. An unusable rate is treated as `1` for the same reason: `0`
 * would report every balance as empty.
 */
export function convertFromUsd(usd: number, rate: number): number {
    if (!Number.isFinite(usd)) return 0
    if (!Number.isFinite(rate) || rate <= 0) return usd
    return usd * rate
}

/**
 * `Intl.NumberFormat` with a locale that cannot take the screen down.
 *
 * An unrecognised locale tag throws a `RangeError`, and this is the format function behind every
 * figure in the app — one bad tag would blank a balance card *and* every row under it. The fallback
 * is `en`, which is also the app's own fallback locale.
 */
function formatNumber(value: number, locale: string, options: Intl.NumberFormatOptions): string {
    try {
        return new Intl.NumberFormat(locale, options).format(value)
    } catch {
        return new Intl.NumberFormat('en', options).format(value)
    }
}
