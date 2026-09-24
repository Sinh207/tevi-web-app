'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { useWebConfig } from '@shared/lib/remote-config'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import { useState } from 'react'
import { toast } from 'sonner'
import { isExclusiveLive, liveAccess } from '../access'
import type { EventSummary } from '../api/report-types'
import type { EventDetail } from '../api/types'
import type { TotalState } from '../hooks/use-event-report'
import { formatCount, formatDuration } from '../lib/event-analytics'
import { formatEventDateTime } from '../lib/event-format'
import { formatRevenue } from '../lib/event-revenue'
import { EventCardState } from './event-card-state'
import { EventInfoDialog, MAINTENANCE_FEE_INFO } from './event-info-dialog'
import { EventReportCard } from './event-report-card'
import { RevenueRow } from './event-revenue-accordion'

/**
 * **Live analytics** — six rows about the broadcast itself.
 *
 * Legacy's `liveAnalytics`: Live ID (with a copy button), Event type (a chip plus the access terms),
 * Start time, Peak CCU (with a tooltip), Total viewers, Live duration, Total view time.
 *
 * ## The access terms are `liveAccess`, not a fourth copy of the predicate
 *
 * Legacy re-derives `isFree` / `isRequiredPackages` / `isExclusive` inline here, for the third time
 * in the feature and with the same bug the badge has: `Boolean(price && parseInt(price,10) <= 0)`
 * makes a **missing** price non-free, so `isExclusive` is `true` and the row reads *Exclusive
 * (⭐0)* for an ordinary open stream. `@features/event/access` is the one rule, and it is the same
 * one the banner badge and the paywall use — so the creator's report and the viewer's page cannot
 * disagree about what the creator is selling.
 *
 * `isExclusiveLive` decides the chip (a property of the *stream*), `liveAccess` phrases the terms
 * beneath it (an invitation) — the two-function split that file exists to keep.
 */
export function EventLiveAnalyticsCard({
    event,
    summary,
    isLoading,
    isError,
    onRetry,
}: {
    event: EventDetail
    summary: EventSummary | null
    isLoading: boolean
    /**
     * The analytics request failed. **Not** the same as "this event has no analytics", which is the
     * ordinary state of every broadcast that has not gone on air — see `EventCardState`.
     */
    isError?: boolean
    onRetry?: () => void
}) {
    const { t, currentLanguage } = useTranslation()
    const exclusive = isExclusiveLive(event)
    const access = liveAccess(event)

    return (
        <EventReportCard testId="event-analytics" title={t('event_live_analytics')}>
            {isLoading ? (
                /* Keyed by a derived string rather than the bare index — these rows have no
                   identity and never reorder, so the key only has to be stable and distinct. The
                   repo's skeleton idiom (`following-skeleton.tsx`). */
                Array.from({ length: 6 }, (_, index) => `event-analytics-row-${index}`).map(
                    (key, index) => (
                        <div key={key} className="flex h-[20px] items-center justify-between">
                            <Skeleton w="30%" delay={index * 160} />
                            <Skeleton w="18%" delay={index * 160} />
                        </div>
                    ),
                )
            ) : summary ? (
                <>
                    {/* Live ID, with a copy control — the one row whose value a creator needs to
                        hand to support. */}
                    <div className="flex min-w-0 items-baseline gap-2">
                        <span className="type-dense-default min-w-0 truncate text-(--text-subtitle)">
                            {t('event_live_id')}
                        </span>
                        <span className="ms-auto flex min-w-0 items-center gap-1">
                            <span className="type-dense-strong min-w-0 truncate text-(--text-title)">
                                {event.code}
                            </span>
                            {event.code && <CopyCodeButton code={event.code} />}
                        </span>
                    </div>

                    {/* Event type: the chip, and the terms under it. */}
                    <div className="flex min-w-0 items-start gap-2">
                        <span className="type-dense-default min-w-0 truncate pt-0.5 text-(--text-subtitle)">
                            {t('event_type')}
                        </span>
                        <span className="ms-auto flex min-w-0 flex-col items-end gap-1">
                            <Badge size="small" status={exclusive ? 'info' : 'default'}>
                                <Icon
                                    name={exclusive ? 'premium' : 'users'}
                                    weight="filled"
                                    size={16}
                                />
                                {t(exclusive ? 'event_type_exclusive' : 'event_type_free')}
                            </Badge>
                            {access && (
                                /*
                                 * Legacy's parenthesised terms under the chip. The brackets hug the
                                 * content: with the mark inside a `gap-1` row the closing paren
                                 * drifts four pixels off the star, which reads as a typo. So the
                                 * gap applies only *before* the mark and the paren is glued to it.
                                 */
                                <span className="type-caption-meta flex items-center text-(--text-placeholder)">
                                    (
                                    {access.price === null
                                        ? t(access.key)
                                        : t(access.key, {
                                              price: formatCount(access.price, currentLanguage),
                                          })}
                                    {access.price !== null && (
                                        <StarMark size={12} className="ms-1" />
                                    )}
                                    )
                                </span>
                            )}
                        </span>
                    </div>

                    {event.start_at && (
                        <RevenueRow
                            label={t('event_start_time')}
                            value={formatEventDateTime(event.start_at, currentLanguage)}
                        />
                    )}
                    <RevenueRow
                        label={t('event_peak_ccu')}
                        value={formatCount(summary.peak_ccu, currentLanguage)}
                        onInfo={() => toast.info(t('event_peak_ccu_about'))}
                        infoLabel={t('event_peak_ccu_about')}
                        strong
                    />
                    <RevenueRow
                        label={t('event_total_viewers')}
                        value={formatCount(summary.unique_view_count, currentLanguage)}
                        strong
                    />
                    <RevenueRow
                        label={t('event_live_duration')}
                        value={formatDuration(summary.live_duration)}
                        strong
                    />
                    <RevenueRow
                        label={t('event_total_view_time')}
                        value={formatDuration(summary.total_view_duration)}
                        strong
                    />
                </>
            ) : (
                /* Failure and emptiness are different answers, and only one of them is about the
                   event. See `EventCardState`. */
                <EventCardState kind={isError ? 'error' : 'empty'} onRetry={onRetry} />
            )}
        </EventReportCard>
    )
}

/**
 * Copies the event code.
 *
 * A real `<button>` with a name, where legacy puts `onClick` on a bare `<svg>` — unreachable by
 * keyboard, unnamed to a screen reader, and with no feedback that anything happened. The toast is
 * the feedback; legacy's `copyText` helper raises one too.
 */
function CopyCodeButton({ code }: { code: string }) {
    const { t } = useTranslation()

    return (
        <button
            type="button"
            data-testid="event-copy-code"
            aria-label={t('event_copy_live_id')}
            onClick={() => {
                // `navigator.clipboard` rejects on an insecure origin and when the document is not
                // focused. Either way the useful response is to say it did not work rather than to
                // throw into an unhandled rejection.
                navigator.clipboard
                    ?.writeText(code)
                    .then(() => toast.success(t('event_copied')))
                    .catch(() => toast.error(t('event_copy_failed')))
            }}
            className="flex size-5 flex-none items-center justify-center text-(--text-link) transition-opacity hover:opacity-70"
        >
            {/* `pages`, filled — the app's own copy affordance (`channel-copy-link.tsx`). Not
                `copyright`, which is the © mark and type-checks just as happily. */}
            <Icon name="pages" weight="filled" size={16} />
        </button>
    )
}

/**
 * **Maintenance fee details** — the rate, and how many periods were charged.
 *
 * Legacy's `maintenanceFee`. The rate is remote config (`event.charge.fee` per
 * `timeUntilNextFee` minutes) and the count is the summary's `go_live_total_display`, which is its
 * own field name and not a typo.
 *
 * The `?` in the header opens the two-question explainer — the same dialog component the sustained
 * viewers line uses, with the other dataset.
 */
export function EventMaintenanceFeeCard({
    summary,
    isLoading,
    isError,
    onRetry,
}: {
    summary: EventSummary | null
    isLoading: boolean
    /** Same split as the analytics card — it reads the same request. */
    isError?: boolean
    onRetry?: () => void
}) {
    const { t, currentLanguage } = useTranslation()
    const { event: eventConfig } = useWebConfig()
    const charge = eventConfig.charge
    const [infoOpen, setInfoOpen] = useState(false)

    return (
        <>
            <EventReportCard
                testId="event-maintenance-fee"
                title={t('event_maintenance_fee_details')}
                onInfo={() => setInfoOpen(true)}
                infoLabel={t('event_maintenance_fee_about')}
            >
                {isLoading ? (
                    <>
                        <div className="flex h-[20px] items-center justify-between">
                            <Skeleton w="24%" />
                            <Skeleton w="30%" />
                        </div>
                        <div className="flex h-[20px] items-center justify-between">
                            <Skeleton w="34%" delay={160} />
                            <Skeleton w="14%" delay={160} />
                        </div>
                    </>
                ) : summary ? (
                    <>
                        <RevenueRow
                            label={t('event_rate')}
                            // Never nullable: the remote config gives every field a fallback in
                            // code, chosen per field — which is why there is no `??` here.
                            value={t('event_rate_value', {
                                fee: charge.fee,
                                minutes: charge.timeUntilNextFee,
                            })}
                            strong
                        />
                        <div className="flex min-w-0 items-baseline gap-2">
                            <span className="type-dense-default min-w-0 truncate text-(--text-subtitle)">
                                {t('event_periods_charged')}
                            </span>
                            <span className="ms-auto flex items-center gap-1">
                                <StarMark size={14} />
                                <span className="type-dense-strong tabular-nums text-(--text-title)">
                                    {formatCount(summary.go_live_total_display, currentLanguage)}
                                </span>
                            </span>
                        </div>
                    </>
                ) : (
                    <EventCardState kind={isError ? 'error' : 'empty'} onRetry={onRetry} />
                )}
            </EventReportCard>

            <EventInfoDialog
                open={infoOpen}
                onOpenChange={setInfoOpen}
                title={t('event_maintenance_fee_details')}
                items={MAINTENANCE_FEE_INFO}
                testId="event-maintenance-fee-info"
            />
        </>
    )
}

/**
 * **New members** — memberships bought during the broadcast.
 *
 * Header-only, like legacy's, and drawn **only when there is a summary**: `+0` for an event that has
 * not aired is a figure about nothing.
 */
export function EventNewMembersCard({ summary }: { summary: EventSummary | null }) {
    const { t, currentLanguage } = useTranslation()
    if (!summary) return null

    return (
        <EventReportCard
            testId="event-new-members"
            title={t('event_new_members')}
            action={
                <span className="type-dense-default tabular-nums text-(--text-subtitle)">
                    +{formatCount(summary.new_member_count, currentLanguage)}
                </span>
            }
        />
    )
}

/**
 * **Total revenue** — the figure the whole report exists to produce, pinned to the bottom.
 *
 * Legacy makes this card `position: sticky`, and its offsets do **not** port:
 *
 * ⚠ It uses `bottom: 56px` below `md` to clear its own persistent bottom navigation. **This route
 * draws no tab bar** — `TabBarShell` shows one only on the four tab destinations, and an event page
 * is not one of them (its own doc: "84px of dead space under a page that has no bar" is one of the
 * two ways that decision goes visibly wrong). So 56 here would be a gap under the card on every
 * phone, and it would be the *wrong* number even where a bar exists: this app reserves **84**
 * (48 item + 4 + 32 home indicator), not 56. Shipped as 56 first, caught by reading
 * `tab-bar-shell.tsx` rather than by looking at the screen.
 *
 * `env(safe-area-inset-bottom)` is the reserve that *is* needed — an iPhone's home indicator — and
 * becoming a bar changes **where it is spent**. A card had to be lifted off the bottom edge by it,
 * which left a transparent strip under the card with the report scrolling through it. A bar instead
 * sits at `bottom-0` and pays the inset as **padding**, so its ground runs to the physical edge of
 * the screen while its contents still clear the indicator. It resolves to `0` on every device
 * without one, which is why the padding is a `calc` against the base 16.
 *
 * ## ⚠ A **bar**, not a card — the shape `/get-star` already uses for a pinned total
 *
 * This was an `EventReportCard`: rounded, outlined, `shadow-md`, inset 16px from both window edges
 * on a phone. A rounded card pinned to the bottom edge is a floating widget, and the two 16px
 * channels beside it were open pipes with the report visibly sliding past inside them — the one
 * element on the screen that should read as the window's own edge instead read as a tile dropped on
 * top of it.
 *
 * `GetStarView`'s checkout total is the same problem already solved, so this is its markup rather
 * than a second invention: `-mx-4 px-4 md:mx-0 md:px-0` cancels the column's phone inset so the bar
 * spans the window, `border-t` is the only edge it needs, and the ground is the page colour rather
 * than a surface — a bar *is* the page's floor, so it should not look like something lying on it.
 * The shadow goes with the card: content passing under a full-width bar needs a rule, not a glow.
 *
 * Legacy agrees on the shape, by a route this port could not have followed. It sets
 * `borderRadius: 0` below `md` — but only because its whole phone layout is full-bleed
 * (`disableGutters`), so squaring the corners is all it takes there. Ours keeps the column's inset
 * (`docs/DESIGN_SYSTEM.md` §6, multi-block), so reaching the same result takes the negative margin
 * too. Same destination, and the reason it is not a one-line port is worth knowing.
 *
 * ⚠ **Sticky needs no clipping ancestor.** This element must not sit inside `overflow-hidden` —
 * that establishes a scroll container and would park the bar at the bottom of *that* box instead of
 * following the viewport. The trap is recorded on `PROFILE_PANEL` and `MCN_INVITATION_PANEL`; it was
 * live here while this was a rounded card, since `EventReportCard` is `overflow-clip` (which does
 * **not** establish one — that is the whole distinction).
 *
 * ⚠ **And it needs a containing block taller than itself — `mt-auto` lives on this element for that
 * reason.** A sticky box cannot travel outside its containing block, so wrapping it in anything that
 * hugs its height reduces the travel to nothing: the card then sits at the end of the document and
 * you never see it until you scroll all the way down. That is precisely what shipped — the screen
 * had a `<div className="mt-auto">` around this card to push it to the foot of a short report, which
 * is exactly such a box. Measured at the top of a 1529px report in a 1000px viewport, the card's
 * bottom was at **1505** (below the fold) and is now at **1000** (pinned), settling at 976 — the
 * column's `pb-6` — once the scroll reaches the end.
 *
 * So the margin has to be on the sticky element itself, and the element has to be a **direct child
 * of the column**, which is the arrangement legacy has: its sticky card is a direct child of the
 * `Stack` holding all seven, so its travel is that stack's full height. Nothing warns you when this
 * is wrong — sticky with nowhere to stick renders identically to static.
 *
 * ## ⚠ It takes a **state**, not a number, and that is the bug this card shipped with
 *
 * `formatRevenue(null)` answers `$0`. On a *line* inside a bill that arrived, that is right — a line
 * with no figure earned nothing. On the **headline** it is a confident lie: while the billing
 * request was in flight, and for as long as it stayed failed, this card told the creator in the
 * largest number on the page that they had made **$0**. Two states a nullable number cannot carry,
 * both rendered as money.
 *
 * So `loading` draws a skeleton at the figure's own size and `error` draws an em dash with a retry.
 * Neither is ever `$0`; only a bill that actually arrived can say a creator earned nothing.
 */
export function EventTotalRevenueCard({
    state,
    onRetry,
}: {
    state: TotalState
    onRetry?: () => void
}) {
    const { t, currentLanguage } = useTranslation()

    return (
        <div
            data-testid="event-total-revenue"
            className={cn(
                /*
                 * `-mx-4 px-4 md:mx-0 md:px-0` — cancel the column's phone inset so the bar meets
                 * both window edges, then put the padding back inside it. From `md` the column has
                 * no inset of its own and the bar spans it. `GetStarView`'s total, verbatim.
                 */
                '-mx-4 md:mx-0 sticky bottom-0 z-10 mt-auto px-4 md:px-0',
                /*
                 * `mt-auto` is load-bearing and must stay **on this element**: a sticky box cannot
                 * travel outside its containing block, so any wrapper that hugs its height reduces
                 * the travel to zero — see the note above for the measurement.
                 */
                'flex items-center gap-3 border-(--separator-default) border-t bg-(--background)',
                // The base 16, plus the home indicator where there is one. See the note above.
                'pt-4 pb-[calc(--spacing(4)+env(safe-area-inset-bottom))]',
            )}
        >
            <span className="type-dense-strong min-w-0 text-(--text-title)">
                {t('event_total_revenue')}
            </span>

            <span className="ms-auto flex flex-none items-center gap-2">
                {state.kind === 'loading' ? (
                    /*
                     * Sized to the figure it stands in for, so the bar does not resize when the
                     * number lands: `type-title-t1-bold` is 24px at `--line-height-default`, which
                     * is **1.5** ⇒ a 36px row.
                     *
                     * ⚠ The note here read "20/1.4 ⇒ a 28px row" and was wrong twice over — the line
                     * height is 1.5, not 1.4, so even the old 20px figure was a 30px row against a
                     * 28px reservation. A skeleton that mis-measures its own figure shifts the
                     * layout at the exact moment the reader looks at it, and nothing fails.
                     */
                    <span className="flex h-[36px] items-center">
                        <Skeleton w={112} h={24} />
                    </span>
                ) : state.kind === 'error' ? (
                    <>
                        {/*
                         * An em dash, not `$0` and not `$—`: the currency mark would dress a
                         * non-figure as money. `--text-placeholder` because this is the absence of a
                         * number rather than a number.
                         *
                         * The dash is `aria-hidden` and the sentence is `sr-only`, rather than an
                         * `aria-label` on the span: a bare `<span>` has no role, so a label on it is
                         * not guaranteed to be announced at all (and biome rejects it). A screen
                         * reader gets the words; the eye gets the dash.
                         */}
                        <span aria-hidden className="type-title-t1-bold text-(--text-placeholder)">
                            —
                        </span>
                        <span className="sr-only">{t('event_card_error')}</span>
                        {onRetry && (
                            <Button
                                data-testid="event-total-revenue-retry"
                                variant="secondary"
                                size="small"
                                onClick={onRetry}
                            >
                                {t('common_retry')}
                            </Button>
                        )}
                    </>
                ) : (
                    /*
                     * ⚠ **24/700 in the brand ink, and both halves are legacy's.**
                     *
                     * This shipped as `type-title-t2-semibold` + `--text-link` — 20/600 in the same
                     * blue every accordion header uses. That made the figure the whole report exists
                     * to produce read as one more row of it. Legacy separates them on *two* axes and
                     * the port had collapsed both:
                     *
                     * | | legacy | was | now |
                     * |---|---|---|---|
                     * | accordion subtotal | `#0061FF` 16/600 | `--text-link` 14/600 | unchanged |
                     * | **total revenue** | `#3E2EFF` **24/700** | `--text-link` 20/600 | `--text-brand` **24/700** |
                     *
                     * `#3E2EFF` is not a second link blue, it is the brand's own violet — so the
                     * token is `--text-brand` (`--primary-500`), not `--text-link`. Legacy's hex does
                     * not port (`globals.css` owns the ramp, and `--text-brand` inverts for dark
                     * where a literal cannot); what ports is the *role*, which is "brand emphasis,
                     * deliberately not a link".
                     *
                     * ⚠ It is read against the **page** colour now rather than a surface, so the
                     * contrast was re-measured rather than carried over — and it moved in both modes,
                     * which is the reason to measure: **8.46:1** on `#f4f4f5` (was 9.30 on white) and
                     * **4.31:1** on `#000` (was 3.63 on `#18181b`). Dark got better, light slightly
                     * worse, and both clear AA — 24px bold is large text, where the bar is 3:1.
                     * Worth stating because `accent-inks-fail-aa-in-light` is the opposite case, and
                     * that rule is about ink used for *sentences*.
                     */
                    <span className="type-title-t1-bold tabular-nums text-(--text-brand)">
                        {formatRevenue(state.amount, currentLanguage)}
                    </span>
                )}
            </span>
        </div>
    )
}
