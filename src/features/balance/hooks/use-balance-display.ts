'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount, formatStarAmount } from '@shared/lib/money'
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
 * ## USD, not the reader's chosen currency, and that is the drawer's own design
 *
 * The drawer's card labels its two columns `STAR` and `USD` as fixed strings (`menu_balance_star` /
 * `menu_balance_usd`), so its second figure is USD by construction. Legacy's equivalent widget puts a
 * currency switcher in that slot instead; this app's comp does not, and following the comp keeps the
 * shell free of the exchange-service queries `features/my-wallet` brings with it — on components
 * mounted above every route. The switcher lives on `/my-wallet`, where the figure is the screen's
 * subject rather than a summary.
 *
 * So `usd` here is genuinely USD and needs no rate. If the drawer ever gains a switcher, this is the
 * function that grows a currency argument.
 */
export interface BalanceDisplay {
    /** `1,284`, or `—`. */
    star: string
    /** `$4,400.03`, or `—`. */
    usd: string
    /**
     * Whether the two strings are real figures rather than placeholders. Exposed so a consumer can
     * style or announce the difference — the strings alone cannot be told apart by a screen reader.
     */
    isKnown: boolean
}

/** An em dash, matching every other "not known yet" value in the drawer. */
const UNKNOWN = '—'

export function useBalanceDisplay(): BalanceDisplay {
    const { currentLanguage } = useTranslation()
    const { star, usd, isKnown } = useBalance()

    if (!isKnown) return { star: UNKNOWN, usd: UNKNOWN, isKnown: false }

    return {
        star: formatStarAmount(star, currentLanguage),
        usd: formatFiatAmount(usd, DEFAULT_CURRENCY, currentLanguage),
        isKnown: true,
    }
}
