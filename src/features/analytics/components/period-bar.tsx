'use client'

import { DateRangeDialog } from '@shared/components/date-range-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import {
    SegmentedControl,
    SegmentedControlItem,
    SegmentedControlItemLabel,
} from '@shared/ui/segmented-control'
import { Toggle } from '@shared/ui/toggle'
import { useId, useState } from 'react'
import {
    type DateRange,
    formatGmtOffset,
    PERIOD_IDS,
    PERIOD_LABEL_KEYS,
    type PeriodId,
    periodDayCount,
} from '../lib/periods'

/**
 * The window controls: which period, whether to compare it against the one before, and which zone
 * the days are counted in.
 *
 * ## `Custom` is a segment, not a separate button
 *
 * It opens the picker rather than resolving a range of its own, which makes it the odd one out — but
 * it stays in the control because the alternative breaks the keyboard. `SegmentedControlItem` is a
 * roving-tabindex tablist: the selected segment is the only one in the tab order, so a state where
 * *no* segment is selected (a custom range active, with Custom sitting outside the control) leaves
 * every segment at `tabIndex={-1}` and the whole control unreachable by Tab. Keeping Custom inside
 * means there is always exactly one selected segment.
 *
 * ## The track hugs and scrolls below `sm`, and fills from `sm`
 *
 * The DS's `Segments=5` track is 370px wide and this app's phone column is 328. Five equal shares of
 * that is 64px a segment, which truncates "Yesterday" to "Yesterda…". So below `sm` the segments hug
 * their labels and the track scrolls — the shape legacy uses at every width — and from `sm`, where
 * there is room, they take the equal shares the DS specifies. The override is this app's addition,
 * like the RTL knob fix in `Toggle`; the DS has no answer for a track narrower than its labels.
 *
 * ## The timezone caption is not decoration
 *
 * Every boundary on this screen is local midnight (`lib/periods.ts`), so "30 days" means something
 * different in Auckland than in Los Angeles — and the figures are money, so a creator reconciling a
 * payout needs to know which midnight was used. Legacy prints the same caption and gets the
 * half-hour zones wrong; see `formatGmtOffset`.
 */
export function PeriodBar({
    period,
    range,
    compare,
    onSelectPeriod,
    onApplyCustomRange,
    onCompareChange,
    className,
}: {
    period: PeriodId
    /** The window in force — seeds the picker so it opens on what is on screen. */
    range: DateRange
    compare: boolean
    onSelectPeriod: (period: PeriodId) => void
    onApplyCustomRange: (from: Date, to: Date) => void
    onCompareChange: (compare: boolean) => void
    className?: string
}) {
    const { t } = useTranslation()
    const [pickerOpen, setPickerOpen] = useState(false)
    const compareLabelId = useId()

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            <SegmentedControl
                role="tablist"
                aria-label={t('analytics_period_label')}
                className={cn(
                    'max-sm:w-auto max-sm:overflow-x-auto',
                    'max-sm:[&>*]:flex-none max-sm:[&>*]:basis-auto',
                    'max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:h-0',
                )}
            >
                {PERIOD_IDS.map(id => {
                    const days = periodDayCount(id)
                    return (
                        <SegmentedControlItem
                            data-testid="analytics-period"
                            key={id}
                            selected={period === id}
                            onClick={() => {
                                // Custom never resolves a range itself — the picker does, and until
                                // it is applied the screen keeps showing what it was showing.
                                if (id === 'custom') setPickerOpen(true)
                                else onSelectPeriod(id)
                            }}
                        >
                            <SegmentedControlItemLabel className="max-sm:whitespace-nowrap">
                                {days === null
                                    ? t(PERIOD_LABEL_KEYS[id])
                                    : t(PERIOD_LABEL_KEYS[id], { days })}
                            </SegmentedControlItemLabel>
                        </SegmentedControlItem>
                    )
                })}
            </SegmentedControl>

            <div className="flex items-center justify-between gap-3">
                <p className="type-caption-meta min-w-0 truncate text-(--text-subtitle)">
                    {t('analytics_time_zone', {
                        zone: formatGmtOffset(new Date().getTimezoneOffset()),
                    })}
                </p>
                <div className="flex flex-none items-center gap-2">
                    {/* A label element rather than an `aria-label`, so the words are pressable —
                        which is the difference between a 48px target and a 28px one on a phone. */}
                    <span id={compareLabelId} className="type-caption-label text-(--text-title)">
                        {t('analytics_compare')}
                    </span>
                    <Toggle
                        data-testid="analytics-compare-toggle"
                        checked={compare}
                        onCheckedChange={onCompareChange}
                        aria-labelledby={compareLabelId}
                    />
                </div>
            </div>

            {/*
             * The calendar is `shared/components`, not this feature's: a range picker has no domain,
             * and the next report screen that needs one must not grow a second one. Only the
             * subtitle is ours — this screen's ranges include both end days, which is a fact about
             * the dashboard rather than about picking dates.
             */}
            <DateRangeDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                value={range}
                description={t('analytics_range_subtitle')}
                onApply={(from, to) => {
                    onApplyCustomRange(from, to)
                    setPickerOpen(false)
                }}
            />
        </div>
    )
}
