'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import { Icon } from '@shared/ui/icon'
import { formatRangeLabel } from '../lib/format'
import { comparisonRange, type DateRange, rangeDayCount } from '../lib/periods'

/**
 * Which dates the figures cover, and — when comparison is on — which dates they are measured
 * against.
 *
 * It restates in dates what the period control says in words, and that is the point: "30 days" does
 * not tell a creator whether today is included, and this screen's whole job is to be reconciled
 * against a payout. The comparison line is the same argument twice over, since the ± percentages
 * everywhere on the screen are meaningless without knowing what "previous" was.
 *
 * The comparison window is derived here rather than sent by the backend — see `comparisonRange`,
 * which also notes the off-by-one legacy has in its own version of this line.
 */
export function RangeSummary({
    range,
    compare,
    className,
}: {
    range: DateRange
    compare: boolean
    className?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const days = rangeDayCount(range)
    const previous = comparisonRange(range)

    return (
        <div className={cn('flex flex-col gap-1', className)}>
            <div className="flex flex-wrap items-center gap-2">
                <Icon
                    name="calendar"
                    size={16}
                    className="flex-none text-(--icon-secondary)"
                    aria-hidden
                />
                <p className="type-dense-strong text-(--text-title)">
                    {formatRangeLabel(range, currentLanguage)}
                </p>
                <Badge size="small">
                    {/*
                     * `1 day`, not `Yesterday`. The badge describes the **range**, and a custom
                     * one-day range is very often not yesterday — pick 5 February twice and the badge
                     * used to call it Yesterday. The period control above already names the preset
                     * where there is one; this line only has to be true.
                     */}
                    {days === 1 ? t('date_range_one_day') : t('analytics_period_days', { days })}
                </Badge>
            </div>
            {compare ? (
                /* Indented to the width of the icon plus its gap, so it reads as a note on the line
                   above rather than as a second range of equal standing. */
                <p className="type-caption-meta ps-6 text-(--text-subtitle)">
                    {t('analytics_compared_with', {
                        range: formatRangeLabel(previous, currentLanguage),
                    })}
                </p>
            ) : null}
        </div>
    )
}
