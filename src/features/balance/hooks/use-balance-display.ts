'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import {
    type Currency,
    convertFromUsd,
    DEFAULT_CURRENCY,
    formatFiatAmount,
    formatStarAmount,
} from '@shared/lib/money'
import { useBalance } from '../providers/balance-provider'

/**
 * The balance as the **app shell** shows it — two ready-to-render strings.
 *
 * Read by the account drawer's balance card, its My Star row, and the mobile top bar's Star pill. Not
 * by the wallet screens: those render their own figures, `/my-wallet` in the reader's chosen currency
 * rather than in USD.
 *
 * ## Why the shell gets a formatter and not the numbers
 *
 * `—` versus `0` is a **decision**, not a formatting detail — see `isKnown` on the provider. Made once
 * here, it cannot be got wrong by the third consumer; made at each call site, it will be. The shell
 * has three of them and they are on every route.
 *
 * ## USD by default, the reader's currency when the caller has one
 *
 * The DS comp labels the drawer card's two columns `STAR` and `USD` as fixed strings, and this hook was
 * USD-only to match. Legacy's equivalent widget puts a currency switcher in that slot, and the drawer now
 * does too, so the second figure is whatever unit the reader picked — which is why the argument exists.
 * The mobile top bar (Star only) and anything else that just wants the shell's default still call it with
 * nothing.
 *
 * The **conversion** is here rather than at the call site for the same reason `—` is: a figure and the
 * symbol in front of it are one decision, and no caller should be multiplying a balance by a rate to fill
 * in a card. That is also why `rate` is nullable rather than defaulting to `1` on a caller's behalf: `1`
 * is the true rate for USD *and* the stand-in while a real one is in flight, and the difference between
 * those two is the difference between `₫157,155,000` and the same figure 25,400× too small. A caller
 * without a rate yet passes `null` and gets `—`; `useCurrency` answers which it has with `isRateKnown`.
 */
export interface BalanceDisplay {
    /** `1,284`, or `—`. */
    star: string
    /**
     * `$4,400.03` — or `₫157,155,000` when a `currency` was passed, or `—`.
     *
     * Named `usd` because that is what it holds by default and what every existing caller reads; the
     * balance itself is always USD, this is the string it is *shown* as.
     *
     * `—` in one case `star` is not: the balance is known but the rate needed to relabel it is not
     * (`rate: null`). A converted figure is two facts, and only one of them is the provider's.
     */
    usd: string
    /**
     * Whether the **balance** is known, rather than the placeholder. Exposed so a consumer can style or
     * announce the difference — the strings alone cannot be told apart by a screen reader.
     *
     * Not a claim about `usd` specifically: a caller converting into another currency can hold a real
     * balance and no rate, and `usd` says so on its own. Every caller that reads this flag reads `star`.
     */
    isKnown: boolean
}

/** An em dash, matching every other "not known yet" value in the drawer. */
const UNKNOWN = '—'

export function useBalanceDisplay({
    /** The unit to show the fiat figure in. Omitted means USD, which needs no rate. */
    currency = DEFAULT_CURRENCY,
    /** USD → `currency`, or `null` for "not known yet", which prints `—`. `1` for USD by definition. */
    rate = 1,
}: {
    currency?: Currency
    rate?: number | null
} = {}): BalanceDisplay {
    const { currentLanguage } = useTranslation()
    const { star, usd, isKnown } = useBalance()

    if (!isKnown) return { star: UNKNOWN, usd: UNKNOWN, isKnown: false }

    return {
        star: formatStarAmount(star, currentLanguage),
        usd:
            rate === null
                ? UNKNOWN
                : formatFiatAmount(convertFromUsd(usd, rate), currency, currentLanguage),
        isKnown: true,
    }
}
