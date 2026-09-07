'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { Menu, MenuContent, MenuItem, MenuItemLabel, MenuTrigger } from '@shared/ui/menu'
import type { KeyboardEvent } from 'react'
import type { ChannelStatMetric, MetricOption } from '../api/types'
import { formatPercentChange } from '../lib/format'
import { metricLabel } from '../lib/metric-labels'

/**
 * The metric strip above the chart — one tab per slot, each showing its figure and its change, and
 * each swappable for another metric.
 *
 * ## Not `SegmentedControl`, and not `StickyTabs`
 *
 * Both of those give every segment an equal share of the track (`flex: 1 1 0`, which is what the DS's
 * `Segments` axis means). A tab here is a three-line block whose widest line is a currency figure,
 * so equal shares would either squash `$12,412.05` or stretch `4` across a quarter of the screen.
 * This is a **scrolling** strip of hugging tabs, which is what the design draws and what legacy
 * builds with a scrollable MUI `Tabs`.
 *
 * The interaction contract is still the ARIA tabs pattern, written out here rather than borrowed:
 * one tab in the tab order, arrow keys move *and* activate (switching charts is instant), and
 * Left/Right follow the writing direction. That last part is why the handler reads `direction` off
 * the computed style — in Arabic the first tab is the rightmost one, and an arrow that walked DOM
 * order would move the wrong way on screen. `SegmentedControl` solves it the same way; it is the
 * one piece of it worth copying.
 *
 * ## Two buttons per tab, and which is which
 *
 * A column is **the name row** and **the figure**, and they are siblings rather than one inside the
 * other:
 *
 * - the **name row** — the words and the chevron together — opens the metric menu, and selects the
 *   tab on the way;
 * - the **figure** is the `role="tab"`: it puts this metric on the chart.
 *
 * Legacy nests its "change this metric" control **inside** the MUI `Tab`, so the DOM has a button in
 * a button — invalid HTML, which browsers resolve by firing both handlers, so its label press does
 * two things by accident. The split above does the same two things on purpose, and the pressable
 * area for the menu is the label the reader is actually pointing at rather than a 20px glyph beside
 * it.
 */
export function MetricTabs({
    metrics,
    selectedIndex,
    compare,
    swappable,
    isConfigLoading,
    isSwapping,
    onSelect,
    onOpenSwapMenu,
    onSwap,
    className,
}: {
    metrics: ChannelStatMetric[]
    selectedIndex: number
    compare: boolean
    /** Metrics not already in a slot. Empty is a legitimate answer, not a loading state. */
    swappable: MetricOption[]
    isConfigLoading: boolean
    isSwapping: boolean
    onSelect: (index: number) => void
    /** Fired when a menu opens, so the two config requests are made then and not on page load. */
    onOpenSwapMenu: () => void
    onSwap: (position: number, metricId: string) => void
    className?: string
}) {
    const { t } = useTranslation()

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const strip = event.currentTarget
        const tabs = [...strip.querySelectorAll<HTMLElement>('[data-slot="metric-tab"]')]
        const current = tabs.indexOf(document.activeElement as HTMLElement)
        if (current < 0) return

        const forward = getComputedStyle(strip).direction === 'rtl' ? -1 : 1
        let next: number
        switch (event.key) {
            case 'ArrowRight':
                next = current + forward
                break
            case 'ArrowLeft':
                next = current - forward
                break
            case 'Home':
                next = 0
                break
            case 'End':
                next = tabs.length - 1
                break
            default:
                return
        }
        event.preventDefault()
        const target = tabs[(next + tabs.length) % tabs.length]
        target.focus()
        target.click()
    }

    return (
        <div
            data-testid="analytics-metric-tabs"
            role="tablist"
            aria-label={t('analytics_metrics_label')}
            onKeyDown={onKeyDown}
            className={cn(
                'flex min-w-0 items-stretch gap-4 overflow-x-auto',
                // The strip is the affordance; a scrollbar under a row of figures reads as a rule.
                '[scrollbar-width:none] [&::-webkit-scrollbar]:h-0',
                className,
            )}
        >
            {metrics.map((metric, index) => {
                const selected = index === selectedIndex
                const isUp = metric.changePercent >= 0
                const label = metricLabel(metric, t)
                return (
                    <div
                        key={metric.id}
                        className={cn(
                            'relative flex flex-none flex-col items-start gap-0.5 pt-3 pb-3',
                            // The rule fades between tabs instead of snapping — the same 120ms the
                            // chip above it uses for its own hover.
                            'transition-colors duration-[120ms] ease-out motion-reduce:transition-none',
                            // The selected marker is a 2px rule along the bottom of the **whole**
                            // column, in the same Indigo the chart's current line is drawn in — so the
                            // strip says *which* line the plot below is showing, not just which tab is
                            // on. It sits on the wrapper because the column is now two controls.
                            'border-b-2',
                            selected
                                ? 'border-b-(--accents-indigo-active)'
                                : 'border-b-transparent',
                        )}
                    >
                        <Menu onOpenChange={open => open && onOpenSwapMenu()}>
                            {/*
                             * The **whole name row** is the menu button — the words and the chevron
                             * together, not the 20px glyph beside them. A chevron on its own is a
                             * target you have to aim at, and the thing a reader points at is the
                             * label; the DS's own `FilterMenu` note makes the same point about the
                             * pressable area being the padded row rather than the glyph box.
                             *
                             * It also **selects** the tab on the way, as legacy does: opening the
                             * menu of a metric you are not looking at, and then swapping it, would
                             * change a tab off-screen and leave the chart on the old one.
                             */}
                            <MenuTrigger
                                data-testid="analytics-metric-tab"
                                data-index={index}
                                disabled={isSwapping}
                                onClick={() => onSelect(index)}
                                className={cn(
                                    'flex h-5 max-w-[168px] cursor-pointer items-center gap-1',
                                    /*
                                     * A filled chip at rest, not bare text with a hover.
                                     *
                                     * The geometry is the DS `Badge` at `small` — 20 tall, 6px of
                                     * side padding, radius Fill, `--background-segment` — because
                                     * that is the app's own answer to "a small labelled pill on a
                                     * surface", and this row should not be a fifth version of it.
                                     * The whole row is the target (`onClick` below), so it has to
                                     * *look* like a target: text with only a hover state is
                                     * something a reader has to discover by accident.
                                     *
                                     * `--background-segment` and not `--button-secondary-bg`: the
                                     * latter is `--zinc-100`, which is the same value as
                                     * `--background-surface` in Dark, so the chip would vanish into
                                     * the panel there and only there. Segment is a real step off the
                                     * surface in both modes (`#edeeef` on white, `#1e1e20` on
                                     * `#18181b`). `list.tsx` documents the same trap for Listing.
                                     */
                                    'rounded-[var(--radius-fill)] border-0 bg-(--background-segment) px-[6px]',
                                    'text-start outline-none transition-colors',
                                    // Zinc-200 in both modes — darker on white, lighter on black —
                                    // so the response reads the same way round in each.
                                    'hover:bg-(--button-ghost-bg-hover)',
                                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                                    'disabled:cursor-not-allowed disabled:text-(--text-disabled)',
                                    selected
                                        ? 'type-caption-label text-(--text-title)'
                                        : 'type-caption-meta text-(--text-subtitle)',
                                )}
                            >
                                <span className="min-w-0 truncate">{label}</span>
                                <Icon
                                    name="angle-down-small"
                                    size={16}
                                    aria-hidden
                                    className={cn(
                                        'flex-none',
                                        isSwapping
                                            ? 'text-(--icon-disabled)'
                                            : 'text-(--icon-secondary)',
                                    )}
                                />
                            </MenuTrigger>
                            {/* The menu carries the name, now that the trigger's own name is the
                                metric it belongs to: "Change metric" is what the *list* is, and
                                without it a screen reader opens an unnamed menu of nine metrics. */}
                            <MenuContent align="start" aria-label={t('analytics_change_metric')}>
                                {isConfigLoading ? (
                                    <div className="flex h-12 items-center justify-center">
                                        <Loader label={t('common_loading')} />
                                    </div>
                                ) : swappable.length === 0 ? (
                                    /*
                                     * A real answer, not an error: an account showing every metric
                                     * the backoffice offers has nothing left to swap in. `disabled`
                                     * so it cannot be pressed and is announced as unavailable.
                                     */
                                    <MenuItem disabled>
                                        <MenuItemLabel className="type-dense-default text-(--text-subtitle)">
                                            {t('analytics_no_more_metrics')}
                                        </MenuItemLabel>
                                    </MenuItem>
                                ) : (
                                    swappable.map(option => (
                                        <MenuItem
                                            data-testid="analytics-metric-swap"
                                            data-metric-id={option.id}
                                            key={option.id}
                                            onClick={() => onSwap(index, option.id)}
                                        >
                                            <MenuItemLabel>{metricLabel(option, t)}</MenuItemLabel>
                                        </MenuItem>
                                    ))
                                )}
                            </MenuContent>
                        </Menu>

                        {/*
                         * The figure is the **tab**: pressing it puts this metric on the chart. It
                         * carries `role="tab"`, the roving tab order and the arrow-key target, so the
                         * keyboard contract described at the top of this file is unchanged by the name
                         * row above being a menu.
                         *
                         * `aria-label` because the visible content is a bare number — a tab announced
                         * as "$11,204.30" says nothing about which metric it is.
                         */}
                        <button
                            data-testid="analytics-metric-tab"
                            data-index={index}
                            data-slot="metric-tab"
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            aria-label={`${label}: ${metric.display || '—'}`}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => onSelect(index)}
                            className={cn(
                                'flex cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent',
                                'p-0 text-start outline-none',
                                'focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                            )}
                        >
                            <span className="type-title-t2-semibold block text-(--text-title) tabular-nums">
                                {/* An em dash rather than `$0.00`: the backend sent no figure for
                                    this metric, which is not the same as it having earned nothing. */}
                                {metric.display || '—'}
                            </span>
                            {compare ? (
                                <span className="flex items-baseline gap-1">
                                    <span
                                        className={cn(
                                            'type-caption-label tabular-nums',
                                            isUp ? 'text-(--text-success)' : 'text-(--text-error)',
                                        )}
                                    >
                                        {isUp ? '↑' : '↓'}
                                        {formatPercentChange(metric.changePercent)}
                                    </span>
                                    {metric.prevDisplay ? (
                                        <span className="type-caption-meta text-(--text-subtitle) tabular-nums">
                                            ({metric.prevDisplay})
                                        </span>
                                    ) : null}
                                </span>
                            ) : null}
                        </button>
                    </div>
                )
            })}
        </div>
    )
}
