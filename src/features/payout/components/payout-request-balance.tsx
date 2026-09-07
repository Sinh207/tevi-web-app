'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import { Card, CardMeta } from '@shared/ui/card'

/**
 * *Total balance* — the dark card at the top of the withdraw form.
 *
 * `Card type="balance"`, which is the DS component whose pinned gradient is **exactly** legacy's
 * `linear-gradient(90deg, #1A1A1A 0%, #2F2F2F 100%)`. So this is a port rather than an approximation:
 * the same surface, from the component that already carries the reasoning about why it does not follow
 * the theme (`BALANCE_TOKENS` in `card.tsx`).
 *
 * **Label left, figure right, one line** — `justify="between"`. Legacy is a two-column grid (`size={6}`
 * each) with the label `text-align: left` and the figure `text-align: right`, and this screen's card is
 * *not* the wallet's hero: there the label sits above a 32px figure, here both are on one row at 14 and
 * 16. Getting that wrong was the first thing I did — a stacked card here makes the withdraw form open
 * with the same visual weight as the wallet, which is the screen it is a step *inside*.
 *
 * `#BFBFBF` → `--text-subtitle`, `#FFFFFF` → `--text-title`, both under the card's pin.
 */
export function PayoutRequestBalance({ balance }: { balance: number }) {
    const { t, currentLanguage } = useTranslation()

    return (
        <Card type="balance" className="flex-none">
            <CardMeta gap="8" justify="between" className="w-full items-center">
                <span className="type-dense-strong text-(--text-subtitle)">
                    {t('payout_request_total_balance')}
                </span>
                <span
                    dir="ltr"
                    data-testid="payout-request-balance"
                    className="type-body-strong text-(--text-title)"
                >
                    {formatFiatAmount(balance, DEFAULT_CURRENCY, currentLanguage)}
                </span>
            </CardMeta>
        </Card>
    )
}
