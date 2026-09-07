'use client'

import {
    type ChannelStatMetric,
    MetricChart,
    MetricTabs,
    PeriodBar,
    RangeSummary,
} from '@features/analytics'
import { useState } from 'react'

/**
 * The interactive half of `/dev/dashboard-analytics`.
 *
 * It holds the four pieces of state the real view holds — period, range, compare, selected tab — so
 * the things worth looking at can actually be looked at: the chart's hover and arrow-key tooltip, the
 * comparison toggle re-scaling the axis, and the custom-range dialog's validation.
 *
 * ⚠ The **swap menu is inert here**: it is handed an empty catalogue and a no-op, so it shows its
 * "no more metrics available" row. The real menu's contents come from two account-scoped requests,
 * and a preview that fired them would either 401 or rearrange a real creator's dashboard — the one
 * thing in this feature that writes.
 */
export function AnalyticsPreview({
    metrics,
    initialRange,
}: {
    metrics: ChannelStatMetric[]
    /** Passed in from the page, so the fixed dates are decided in one place. */
    initialRange: { startMs: number; endMs: number }
}) {
    const [period, setPeriod] = useState<'yesterday' | '7d' | '30d' | '90d' | 'custom'>('30d')
    const [range, setRange] = useState(initialRange)
    const [compare, setCompare] = useState(true)
    const [selected, setSelected] = useState(0)

    const metric = metrics[Math.min(selected, metrics.length - 1)]

    return (
        <div className="flex flex-col gap-4">
            <PeriodBar
                period={period}
                range={range}
                compare={compare}
                onSelectPeriod={next => {
                    setPeriod(next)
                    // The real hook resolves the range from the clock; the preview keeps its fixed
                    // window so the chart does not empty out when a period is pressed.
                    setRange(initialRange)
                }}
                onApplyCustomRange={(from, to) => {
                    setPeriod('custom')
                    setRange({ startMs: from.getTime(), endMs: to.getTime() })
                }}
                onCompareChange={setCompare}
            />

            <RangeSummary range={range} compare={compare} />

            <div className="flex min-w-0 flex-col rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)">
                <div className="border-b border-(--separator-default) px-4">
                    <MetricTabs
                        metrics={metrics}
                        selectedIndex={Math.min(selected, metrics.length - 1)}
                        compare={compare}
                        swappable={[]}
                        isConfigLoading={false}
                        isSwapping={false}
                        onSelect={setSelected}
                        onOpenSwapMenu={() => undefined}
                        onSwap={() => undefined}
                    />
                </div>
                <MetricChart key={metric.id} metric={metric} compare={compare} className="p-4" />
            </div>
        </div>
    )
}
