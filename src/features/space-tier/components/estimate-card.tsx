'use client'

import { useCurrency } from '@features/balance'
import { Tooltip } from '@shared/components/tooltip'
import { useTranslation } from '@shared/i18n/use-translation'
import { convertFromUsd, formatFiatAmount } from '@shared/lib/money'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import type { SpaceTierEstimate } from '../api/types'
import { useCountUp } from '../hooks/use-count-up'

/**
 * "You could earn about ~$X /month" for the selected tier — legacy's `RaiseTierCard`.
 *
 * Tier 0 earns nothing by definition, so it gets legacy's "Nothing to earn here / Raise your Tier"
 * instead of a figure.
 *
 * ## `—` where legacy prints `~$0`
 *
 * Legacy reads `estimatesByTier[tier]?.revenue ?? 0`, so a tier the report has no row for — or a
 * report that failed — shows "~$0.00 /month". A zero is a claim about somebody's money; the rule on
 * `/my-wallet` and `/monetization` is that an unknown figure prints an em dash, and this follows it.
 *
 * The figure is held in USD and shown in the reader's chosen currency, as legacy does
 * (`estimatedRevenue * exchangeRate`).
 */
export function EstimateCard({
    tier,
    estimate,
    isLoading,
}: {
    tier: number
    estimate: SpaceTierEstimate | undefined
    isLoading: boolean
}) {
    const { t, currentLanguage } = useTranslation()
    const { currency, rate } = useCurrency()

    const usd = estimate?.revenueByTier[tier]
    // Rolled in the display currency, not in USD, so every frame is a figure the reader can read.
    const rolled = useCountUp(
        tier > 0 && typeof usd === 'number' ? convertFromUsd(usd, rate) : null,
    )
    const figure = rolled !== null ? `~${formatFiatAmount(rolled, currency, currentLanguage)}` : '—'
    const days = estimate?.basedOnDays ?? 30

    return (
        <section
            data-testid="space-tier-estimate"
            aria-busy={(tier > 0 && isLoading) || undefined}
            className="flex w-full flex-col items-center gap-2 rounded-xl bg-(--background-surface) px-4 pt-4 pb-3 text-center"
        >
            {tier <= 0 ? (
                <div key="none" className={cn('flex flex-col items-center gap-2', RISE)}>
                    <p className="type-dense-strong m-0 text-(--text-title)">
                        {t('space_tier_nothing_to_earn')}
                    </p>
                    <p className="type-title-t1-bold m-0 text-(--text-title)">
                        {t('space_tier_raise_your_tier')}
                    </p>
                </div>
            ) : (
                <div key="earn" className={cn('flex flex-col items-center gap-2', RISE)}>
                    <div className="flex items-center gap-1">
                        <p className="type-dense-strong m-0 text-(--text-title)">
                            {t('space_tier_could_earn')}
                        </p>
                        {/* A button, so the explanation is reachable by keyboard and by a tap — legacy's
                    MUI tooltip sets `enterTouchDelay={0}` for the same reason. */}
                        <Tooltip
                            side="top"
                            label={
                                <span className="block max-w-[240px] whitespace-normal">
                                    {t('space_tier_estimate_hint', { days })}
                                </span>
                            }
                        >
                            <button
                                type="button"
                                data-testid="space-tier-estimate-hint"
                                aria-label={t('space_tier_estimate_hint', { days })}
                                className="-m-2 inline-flex cursor-pointer rounded-md p-2 text-(--text-subtitle) focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
                            >
                                <Icon name="info-circle" size={16} />
                            </button>
                        </Tooltip>
                    </div>
                    {isLoading ? (
                        <Skeleton w={160} h={36} />
                    ) : (
                        <p className="m-0 flex items-baseline gap-1 text-(--text-title)">
                            <span
                                data-testid="space-tier-estimate-value"
                                // Tabular digits, so the roll does not jitter sideways as it counts.
                                className="type-title-t1-bold tabular-nums"
                            >
                                {figure}
                            </span>
                            <span className="type-body-default">{t('space_tier_per_month')}</span>
                        </p>
                    )}
                </div>
            )}
        </section>
    )
}
