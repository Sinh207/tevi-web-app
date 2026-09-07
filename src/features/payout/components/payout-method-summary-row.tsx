'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import Image from 'next/image'
import type { PayoutConfigRow } from '../api/config-types'
import { PAYOUT_BLOCK } from '../lib/container'

/**
 * *Withdraw method* — the header with its **Select other method** link, and the card that shows the one
 * currently chosen.
 *
 * A port of legacy's `withdrawMethod/index.js`, and it is a **section of its own** rather than part of
 * the amount card. That was my first mistake on this screen: I folded the method into the amount card
 * because the method sets the amount's ceiling. Legacy keeps them apart, and it is right to — the
 * ceiling is one sentence of helper text, while the method is *where the money is going*, which is the
 * thing somebody checks last before pressing send.
 *
 * ## The four lines, in legacy's order and weights
 *
 * | line | legacy | here |
 * |---|---|---|
 * | method name | 12/500 `#848484` | `type-caption-label` / `--text-body` |
 * | title | 16/600 `#141414` | `type-body-strong` / `--text-title` |
 * | subtitle | 14/400 `#141414` | `type-dense-default` / `--text-title` |
 * | daily limit remaining | 12/400 `#666666` | `type-caption-meta` / `--text-body` |
 *
 * `title` and `subtitle` are **per method slug** — legacy's two `switch` statements, reproduced in
 * `payoutMethodTitle` / `payoutMethodSubtitle` below. A USDT method leads with its wallet address and a
 * bank transfer with the contact name, and showing the wrong one is showing somebody a different
 * account's details on the screen where they confirm a transfer.
 *
 * The whole card is pressable and opens the picker, as legacy's is (`onClick` on the grid). The header
 * link does the same thing — two ways in, because the card looks like content rather than a control.
 */
export function payoutMethodTitle(config: PayoutConfigRow): string {
    // Legacy's `title` switch, verbatim in intent: which field leads depends on the method.
    switch (config.methodSlug) {
        case 'usdt':
            return config.detail.wallet_address ?? ''
        case 'stripe':
            return config.detail.holder_name ?? ''
        default:
            return config.contactName
    }
}

export function payoutMethodSubtitle(config: PayoutConfigRow): string {
    // Legacy's `subTitle` switch. The `default` is the wallet address, which is what an unknown method
    // is most likely to carry.
    switch (config.methodSlug) {
        case 'usdt':
            return config.detail.network ?? ''
        case 'stripe':
            return config.detail.last4 ?? ''
        case 'payoneer':
            return config.detail.email ?? ''
        case 'zelle':
            return config.detail.email_phone_number ?? ''
        case 'bank_transfer':
            return config.detail.account_number ?? ''
        default:
            return config.detail.wallet_address ?? ''
    }
}

export function PayoutMethodSummaryRow({
    config,
    onOpenPicker,
    canChange,
}: {
    config: PayoutConfigRow | null
    onOpenPicker: () => void
    /** `false` when there is only one method — the link and the press are then withheld. */
    canChange: boolean
}) {
    const { t, currentLanguage } = useTranslation()

    if (!config) return null

    const title = payoutMethodTitle(config)
    const subtitle = payoutMethodSubtitle(config)

    return (
        <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <span className="type-dense-strong text-(--text-body)">
                    {t('payout_request_method_label')}
                </span>
                {canChange && (
                    /*
                     * 12/400 in legacy's `#501BC0`, which is `--text-brand`. `Button` with the size
                     * stripped, the same treatment `/my-wallet`'s **View all** link gets — and the same
                     * reason it is a real control rather than a styled span.
                     */
                    <Button
                        data-testid="payout-request-change-method"
                        variant="ghost"
                        size="small"
                        onClick={onOpenPicker}
                        className="type-caption-label h-auto px-0 text-(--text-brand) hover:not-disabled:bg-transparent hover:underline"
                    >
                        {t('payout_request_select_other_method')}
                    </Button>
                )}
            </div>

            <button
                type="button"
                data-testid="payout-request-method"
                data-card-id={config.id}
                disabled={!canChange}
                onClick={onOpenPicker}
                className={cn(
                    PAYOUT_BLOCK,
                    'flex items-center gap-[10px] bg-(--background-surface) p-3 text-start',
                    canChange && 'cursor-pointer hover:bg-(--button-ghost-bg-hover)',
                )}
            >
                {/*
                 * 36×36, legacy's size. The logo's URL is the **backend's** — a method mark it serves,
                 * which is the sanctioned exception to the no-CDN rule (`docs/STATIC_ASSETS.md`), so it
                 * is not committed art. Rendered only when there is one: a broken 36px box beside an
                 * account number reads as a failure of the account, not of an image.
                 */}
                {config.methodLogo && (
                    <Image
                        src={config.methodLogo}
                        alt=""
                        aria-hidden
                        width={36}
                        height={36}
                        className="flex-none rounded-full"
                        unoptimized
                    />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="type-caption-label truncate text-(--text-body)">
                        {config.methodName}
                    </span>
                    {title && (
                        <span className="type-body-strong truncate text-(--text-title)">
                            {title}
                        </span>
                    )}
                    {subtitle && (
                        <span className="type-dense-default truncate text-(--text-title)">
                            {subtitle}
                        </span>
                    )}
                    {/*
                     * The daily allowance left, which legacy prints here and nowhere else. It is the
                     * number that decides the amount field's ceiling, so it belongs beside the method
                     * that sets it.
                     */}
                    <span className="type-caption-meta truncate text-(--text-body)">
                        {t('payout_request_daily_remaining', {
                            amount: formatFiatAmount(
                                config.dailyLimitRemainder ?? 0,
                                DEFAULT_CURRENCY,
                                currentLanguage,
                            ),
                        })}
                    </span>
                </span>
            </button>
        </section>
    )
}
