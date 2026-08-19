import type { Currency } from '@shared/lib/money'
import {
    convertFromUsd,
    formatFiatAmount,
    formatPlainAmount,
    formatStarAmount,
} from '@shared/lib/money'
import { STAR_CURRENCY } from '../api/types'

/**
 * A ledger row's amount, with its sign — `+1,200`, `-$4.20`.
 *
 * ## Why this is here and not in `shared/lib/money.ts`
 *
 * Because it is the one money function that knows what `TVS` **means**. Deciding that a row is a count
 * of Star rather than an amount of currency is a product fact about Tevi, not a formatting rule, and
 * `shared/` must not hold product facts. Everything underneath it — the grouping, the symbol, the
 * conversion — is shared.
 *
 * Both `/my-star` and `/my-wallet` call this, which is exactly why it lives in the feature that owns
 * the vocabulary rather than in either screen.
 *
 * ## The leading `+` is deliberate and it is legacy's
 *
 * `formatTransactionAmount` there prefixes `+` for anything `>= 0`, and it earns its place: a ledger is
 * read as a column of movements, and "did this add or subtract" has to be legible without comparing
 * against the row above. The minus comes from the number itself.
 *
 * **Zero gets a `+`**, following legacy (`amount >= 0`). It looks odd in isolation and is right in a
 * column: a `0` row is an adjustment that netted out, not money leaving.
 *
 * ## The unit is the **row's**, never the screen's
 *
 * A currency ledger can contain a Star row — a `conversion` has a leg in each — and showing it with a
 * dollar sign would misreport it by a factor of a hundred. So the branch is on `row.currency`:
 *
 * - `TVS` → a Star count, no conversion, no symbol (the mark is an image the row draws);
 * - anything else → converted from USD and formatted in `displayCurrency`;
 * - `''` → the bare grouped number, because inventing a unit is worse than omitting one.
 */
export function formatLedgerAmount({
    amount,
    currency,
    displayCurrency,
    rate,
    locale = 'en',
}: {
    amount: number
    /** The row's own `currency`, upper-cased by the parser. May be `''`. */
    currency: string
    /** The unit fiat rows are shown in. `DEFAULT_CURRENCY` on a screen with no switcher. */
    displayCurrency: Currency
    /** USD → `displayCurrency`. `1` where there is no conversion to do. */
    rate: number
    locale?: string
}): string {
    // The `+` only. A negative sign already comes out of the number itself, from `Intl`.
    const sign = amount >= 0 ? '+' : ''
    if (currency === STAR_CURRENCY) return `${sign}${formatStarAmount(amount, locale)}`
    if (!currency) return `${sign}${formatPlainAmount(amount, locale)}`
    return `${sign}${formatFiatAmount(convertFromUsd(amount, rate), displayCurrency, locale)}`
}

/** Whether a row is denominated in Star — decides whether the row draws the gold mark. */
export function isStarEntry(currency: string): boolean {
    return currency === STAR_CURRENCY
}
