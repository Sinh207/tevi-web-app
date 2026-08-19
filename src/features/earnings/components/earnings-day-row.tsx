'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import {
    ListInfo,
    ListInfoAccessory,
    ListInfoContent,
    ListInfoLine,
    ListInfoTitle,
    ListInfoTitleGroup,
    ListInfoValue,
    ListLeading,
    ListLeadingTile,
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowRule,
    ListRowText,
    ListRowTitle,
    ListRowTitleRow,
    ListRowTrailing,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'
import { useEffect, useId, useRef } from 'react'
import type { EarningsDay } from '../api/types'
import { useEarningsDayDetail } from '../hooks/use-earnings-day-detail'
import { formatEarningsAmount, formatEarningsDate } from '../lib/format'

/**
 * One day in the report: a date, a total, and the split behind it.
 *
 * ## Built out of the design system's rows, not out of legacy's MUI
 *
 * There is **no disclosure or accordion component in the design system** — checked against
 * `components.md`; the closest thing is `List/Action`'s `data-variant="disclosure"`, which is a
 * chevron affordance on a row that navigates, not a panel that opens. So the *interaction* is an
 * addition, and it is assembled entirely from components the DS does draw rather than from a
 * shape invented for this screen:
 *
 * - the header is **`List/Action`** (`ListRow`) — a 48px leading slot holding a `rounded`
 *   `ListLeading` with a 32px `ListLeadingTile`, then the text block, then a trailing cluster.
 *   That is the same row the account drawer is built from.
 * - each breakdown line is **`List/Information`** (Figma 50:15082, `ListInfo`) — the DS's
 *   label-on-the-left, value-on-the-right row, which is exactly what a category split is. Its
 *   two colours look inverted and are not: the label is `--text-subtitle` and the figure is
 *   `--text-title`, so the numbers are what the eye catches going down the column.
 *
 * An earlier version of this file hand-rolled both from Tailwind (`p-4`, a `border-t` per row, a
 * `<dl>`) with geometry copied off legacy's MUI `sx` props. It looked close and was wrong in the
 * ways a hand-roll always is — 16px line boxes where the DS has 24 in a 48 row, the label in
 * `--text-body` instead of `--text-subtitle`, a full-width rule where the DS insets it past the
 * leading column.
 *
 * ## The tile is the DS's, recoloured through the DS's own property
 *
 * `ListLeadingTile` paints from `--tevi-left-bar-tile` / `--tevi-left-bar-glyph`, which is how a
 * host themes a row without a class per colour. Green here, from `--accents-success-active` —
 * legacy hardcodes `#1fc16b`, which is the same colour in Light and does not move in Dark.
 *
 * ## The header is a `<button>`, and that is the whole accessibility story
 *
 * Legacy hangs `onClick` on a `<Stack>` with `cursor: pointer`. That div is not focusable, not
 * reachable by keyboard, announces nothing, and has no expanded state — so the entire report is
 * unusable without a mouse, and a screen reader is told there are nine dates on the page and
 * nothing about them being openable. `ListRow` takes `as="button"` precisely for this.
 *
 * ## The disclosure animates with `grid-template-rows`, not a measured height
 *
 * The panel's height is not known until its rows have loaded — and it *changes* when they do, from
 * a skeleton to however many categories the day had. A `max-height` transition has to guess a
 * ceiling (too low clips the ninth category, too high makes the close look sluggish), and a
 * measured `scrollHeight` needs a resize observer per row plus a re-measure when the fetch lands.
 *
 * `0fr → 1fr` on a grid row transitions to the content's *real* height, whatever it turns out to
 * be, with no measurement at all. The inner wrapper carries `overflow-hidden` because that is
 * what makes the collapsed track clip rather than overflow. Under `prefers-reduced-motion` the
 * transition is dropped and the panel simply appears.
 *
 * ## `inert` while collapsed, and it is not optional
 *
 * `overflow: hidden` hides a thing; it does not remove it. A collapsed panel is still in the tab
 * order and still in the accessibility tree, so without this a keyboard user tabbing down the
 * report walks through the Retry button of every closed day, and a screen reader reads nine
 * invisible breakdowns. `display: none` would fix both and cancel the animation it is meant to
 * follow. `inert` does exactly the two things needed and nothing else.
 */
export function EarningsDayRow({
    day,
    expanded,
    onToggle,
    /** Scroll this row into view once, when the URL named it. */
    autoFocusRow = false,
    locale,
}: {
    day: EarningsDay
    expanded: boolean
    onToggle: () => void
    autoFocusRow?: boolean
    locale: string
}) {
    const { t } = useTranslation()
    const panelId = useId()
    const rowRef = useRef<HTMLDivElement>(null)

    const { rows, isLoading, isError, isEmpty, refetch } = useEarningsDayDetail(day.date, expanded)

    /**
     * The `[dateTs]` route's one behaviour: bring the named row into view.
     *
     * Guarded on `autoFocusRow` alone and with no dependency on the data, so it fires once when
     * the row mounts rather than again every time the detail query settles. `block: 'center'`
     * rather than legacy's `'start'`: the page has a sticky bar, and a row scrolled to the very
     * top of the scroll box lands underneath it.
     */
    useEffect(() => {
        if (!autoFocusRow) return
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, [autoFocusRow])

    const formattedDate = formatEarningsDate(day.date, locale)
    const formattedTotal = formatEarningsAmount(day.total, locale)

    return (
        <div
            ref={rowRef}
            /*
             * The card around the DS row — `--background-surface`, not the `--background-listing`
             * the DS row would paint. `list.tsx` carries the warning: Listing is `--black` in Dark,
             * the same value as `--background`, so a Listing-coloured card and its border vanish
             * into the page. Surface is a real step off it in both modes. Same override
             * `blocked-account-row.tsx` makes, for the same reason.
             */
            className="overflow-hidden rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)"
        >
            <ListRow
                as="button"
                rightAction
                onClick={onToggle}
                aria-expanded={expanded}
                aria-controls={panelId}
                className={cn(
                    'cursor-pointer text-start transition-colors hover:bg-(--background-subtle)',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)',
                )}
            >
                <ListRowLeading>
                    <ListLeading variant="rounded">
                        <ListLeadingTile
                            /*
                             * The DS's own theming properties, not a `bg-` class — markup copied
                             * out of a DS preview keeps working, and renaming them would fail
                             * silently back to Indigo. See `ListLeadingTile`.
                             */
                            style={
                                {
                                    '--tevi-left-bar-tile': 'var(--accents-success-active)',
                                    '--tevi-left-bar-glyph': 'var(--white)',
                                } as React.CSSProperties
                            }
                        >
                            <Icon name="document" weight="filled" size={20} />
                        </ListLeadingTile>
                    </ListLeading>
                </ListRowLeading>

                <ListRowContent>
                    <ListRowAccessory rightAction>
                        <ListRowText rightAction>
                            <ListRowTitleRow>
                                <ListRowTitle className="truncate">{formattedDate}</ListRowTitle>
                            </ListRowTitleRow>
                        </ListRowText>
                        <ListRowTrailing className="gap-2">
                            {/*
                             * `tabular-nums` so the totals align down the column — Inter's
                             * proportional figures make `1` narrower than `8`, invisible in a
                             * sentence and very visible in a stack of amounts.
                             */}
                            <span className="tabular-nums type-subheading-strong text-(--text-title)">
                                {formattedTotal}
                            </span>
                            <Icon
                                name="angle-down"
                                size={20}
                                aria-hidden
                                className={cn(
                                    'flex-none text-(--icon-secondary) transition-transform duration-200',
                                    'motion-reduce:transition-none',
                                    expanded && 'rotate-180',
                                )}
                            />
                        </ListRowTrailing>
                    </ListRowAccessory>
                </ListRowContent>
            </ListRow>

            {/*
             * A `<section>` rather than a `div` with `role="region"` — same semantics, and the
             * named landmark is what lets a screen-reader user jump to the breakdown they just
             * opened instead of arrowing back through the header.
             */}
            <section
                id={panelId}
                aria-label={formattedDate}
                className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-out',
                    'motion-reduce:transition-none',
                    expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
            >
                <div className="overflow-hidden" inert={!expanded}>
                    {/*
                     * The split is inset to start under the date rather than under the tile —
                     * legacy's `pl: 3`, and the DS's own logic for where a rule begins. `ListInfo`
                     * brings its own 16, so this adds the 48 leading column minus that.
                     */}
                    <div className="ps-8 pb-2">
                        {isLoading ? (
                            <DetailSkeleton />
                        ) : isError ? (
                            /*
                             * A failed split is **not** an empty day. Legacy's `catch` sets the
                             * details to `[]`, so a 500 renders as "this day earned nothing from
                             * anything" underneath a header that says it earned money — the one
                             * wrong thing a screen about money must not say.
                             */
                            <div className="flex flex-col items-start gap-2 px-4 py-3">
                                <p className="type-dense-default text-(--text-subtitle)">
                                    {t('earnings_detail_error')}
                                </p>
                                <button
                                    type="button"
                                    onClick={refetch}
                                    className="cursor-pointer rounded-(--radius-sm) type-link-dense text-(--text-link) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                                >
                                    {t('common_retry')}
                                </button>
                            </div>
                        ) : isEmpty ? (
                            <p className="px-4 py-3 type-dense-default text-(--text-subtitle)">
                                {t('earnings_detail_empty')}
                            </p>
                        ) : (
                            rows.map((row, index) => (
                                <ListInfo key={row.key}>
                                    <ListInfoContent>
                                        {/* Every row but the first, as `ListRowRule` is drawn. */}
                                        {index > 0 && <ListRowRule />}
                                        <ListInfoAccessory>
                                            <ListInfoLine>
                                                <ListInfoTitleGroup>
                                                    <ListInfoTitle className="truncate">
                                                        {t(row.label)}
                                                    </ListInfoTitle>
                                                </ListInfoTitleGroup>
                                                <ListInfoValue className="flex-none tabular-nums">
                                                    {formatEarningsAmount(row.revenue, locale)}
                                                </ListInfoValue>
                                            </ListInfoLine>
                                        </ListInfoAccessory>
                                    </ListInfoContent>
                                </ListInfo>
                            ))
                        )}
                    </div>
                </div>
            </section>
        </div>
    )
}

/**
 * The split's loading shape — three `List/Information` rows, since most days earn from two or
 * three categories.
 *
 * Built from the same `ListInfo` parts the real rows are, which is the only way the two are
 * guaranteed not to drift: the skeleton and the row share their geometry by *construction*, so
 * every line is exactly 48px tall and nothing shifts when the data lands. `skeleton.tsx` makes
 * the same argument, and `blocked-accounts-skeleton.tsx` is built this way for the same reason.
 */
function DetailSkeleton() {
    return (
        <div aria-busy="true">
            {[0, 1, 2].map(index => (
                <ListInfo key={`earnings-detail-skeleton-${index}`}>
                    <ListInfoContent>
                        {index > 0 && <ListRowRule />}
                        <ListInfoAccessory>
                            <ListInfoLine>
                                <ListInfoTitleGroup>
                                    <Skeleton w={120} delay={index * 160} />
                                </ListInfoTitleGroup>
                                <Skeleton w={72} delay={index * 160} />
                            </ListInfoLine>
                        </ListInfoAccessory>
                    </ListInfoContent>
                </ListInfo>
            ))}
        </div>
    )
}
