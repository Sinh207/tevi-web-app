'use client'

import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { Skeleton } from '@shared/ui/skeleton'
import { useEffect, useState } from 'react'
import { EVENT_STATES, type EventState } from '../api/events-api'
import { useChannelEvents } from '../hooks/use-channel-events'
import { CHANNEL_BAR_HEIGHT } from '../lib/container'
import { LIVE_EVENTS_ART } from '../lib/illustrations'
import { ChannelEmptyState } from './channel-empty-state'
import { ChannelError } from './channel-error'
import { ChannelEventCard } from './channel-event-card'
import { ChannelLiveFilter } from './channel-live-filter'

/**
 * The Live tab — the creator's own events, newest first.
 *
 * **Owner-only, and enforced by the endpoint rather than by a flag.** `v4/events/` answers for the
 * bearer and takes no slug, so there is no visitor version of this question; `channel-tabs.tsx` only
 * offers the tab to an owner, and this component could not show somebody else's events if it tried.
 *
 * ## The heading row, and the half of it that is still missing
 *
 * Legacy's own sticky row: **"My events - {state}"** on the leading side, a filter control on the
 * trailing side. The heading is here and reads the current filter, so it already says "All" and would
 * say "Ended" the moment the filter can change it.
 *
 * The **control** is not, and the reason is narrower than I previously wrote. I claimed the DS ships
 * no dropdown; it does — `preview/dropdown.html`, Figma 107:24417, with `tevi-menu-item`,
 * `tevi-menu-section-title` and `tevi-menu-separator` beside it. What is true is that
 * `components.css` truncates at the 256 KiB read cap partway through `sheet`, and I assumed
 * `dropdown` was on the far side of that. It is not: the concat order puts it **before** `sheet`, so
 * the geometry is readable and the component is portable. That mistaken assumption has been deferring
 * four separate things — this filter, the channel bar's overflow menu, the MCN leave menu, and the
 * per-event Share/QR/Cancel menu.
 *
 * Porting it is a `shared/ui` primitive rather than a line in this file, so it is not smuggled in
 * here. The list is already built for it: `state` is a real query parameter and part of the query
 * key, so each filter is its own cached list and wiring the control up is one prop.
 *
 * `SegmentedControl` is not the stopgap — five options do not fit a 320px phone, and it would be the
 * wrong shape rather than a smaller version of the right one.
 *
 * ## Four states, and the empty one is the interesting one
 *
 * A creator with no events is the **common** case, not an edge: this tab ships before the create-event
 * flow does. So the empty state says what a live event is for rather than "nothing here" — legacy's
 * copy, which it ships with `t('', …)`, i.e. an empty key and no translation in any locale. Ported to
 * real keys.
 */
export function ChannelLiveTab({ slug }: { slug: string }) {
    const { t } = useTranslation()
    /**
     * Held here rather than in the hook so the heading, the menu and the query all read one value.
     * `''` is legacy's "All". Changing it swaps the query key, so each filter is its own cached
     * list and going back to one already fetched is instant.
     */
    const [state, setState] = useState<EventState>('')
    const {
        events,
        isLoading,
        isError,
        refetch,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
        pageSize,
    } = useChannelEvents({ state })

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView && hasNextPage && !isFetchingNextPage) fetchNextPage()
    }, [sentinelInView, hasNextPage, isFetchingNextPage, fetchNextPage])

    const heading = (
        /*
         * Sticky under the tab strip, at `CHANNEL_BAR_HEIGHT + 48` — the page bar plus the tab
         * track, which is the same 108 the panel's own anchors use. Legacy computes it from a
         * `ResizeObserver` on two elements because its bar heights are not fixed; ours are DS
         * constants, so it is arithmetic.
         *
         * `-mx-3 px-3 md:-mx-6 md:px-6` cancels the panel's padding so the sticky background spans
         * the full width — without it the rows scroll visibly through the gutters either side.
         */
        <div
            className="-mx-3 md:-mx-6 sticky z-10 flex min-w-0 items-center justify-between gap-2 bg-(--background-surface) px-3 py-1.5 md:px-6"
            style={{ top: CHANNEL_BAR_HEIGHT + 48 }}
        >
            <h3 className="type-body-strong min-w-0 truncate text-(--text-title)">
                {t('channel_live_my_events')} - {t(EVENT_STATES[state])}
            </h3>
            <ChannelLiveFilter value={state} onChange={setState} />
        </div>
    )

    if (isLoading)
        return (
            <div className="flex min-w-0 flex-col gap-4">
                {heading}
                <EventsSkeleton count={3} />
            </div>
        )

    /*
     * A real error page, unlike the activity feed's silent `return null`. The difference is what the
     * block is: the feed is a courtesy panel inside a tab about something else, while this **is** the
     * tab — going blank here reads as "you have no events", which is a different and alarming claim.
     */
    if (isError)
        return (
            <div className="flex min-w-0 flex-col gap-4">
                {heading}
                <ChannelError kind="unavailable" onRetry={() => refetch()} />
            </div>
        )

    if (events.length === 0) {
        return (
            <div className="flex min-w-0 flex-col gap-4">
                {heading}
                <ChannelEmptyState
                    /*
                     * Legacy's own artwork, not a glyph. It ships it as a 154×183 SVG that is really a
                     * 1536×1024 raster in a cropping pattern — **3 MB** on the wire for an empty state.
                     * Rendered at its drawn size and saved as a 2× PNG (102 KB), the same treatment
                     * `no-blocked-accounts.png` already gets.
                     */
                    art={LIVE_EVENTS_ART.empty}
                    title={t('channel_live_empty_title')}
                    body={t('channel_live_empty_body')}
                />
            </div>
        )
    }

    return (
        <div className="flex min-w-0 flex-col gap-4">
            {heading}
            {events.map((event, index) => (
                /*
                 * Staggered **within the page**, not across the list — `index % pageSize`. Twelve
                 * rows a page here against the activity feed's four, so getting this wrong is
                 * worse: page two would open at a 720ms delay and page three at 1.4s, and by then
                 * the reader is watching a queue drain rather than content arrive.
                 *
                 * Only the new rows animate. React keeps the mounted ones, and a CSS animation
                 * does not re-run on an element that never left.
                 */
                <div
                    key={event.code ?? `${event.title}-${event.start_at}`}
                    className={RISE}
                    style={riseDelay(index % pageSize)}
                >
                    <ChannelEventCard event={event} slug={slug} />
                </div>
            ))}

            {/*
             * The sentinel sits *above* the fold by `useInView`'s 600px `rootMargin`, so the next
             * page is already in flight by the time the last card scrolls up — see
             * `channel-thread-list.tsx`, which established the pattern.
             */}
            {hasNextPage && <div ref={sentinelRef} aria-hidden className="h-px" />}
            {isFetchingNextPage && <EventsSkeleton count={Math.min(2, pageSize)} />}
        </div>
    )
}

/**
 * Legacy's own loading shape, which is also the answer to what the row looks like: a `size={4}`
 * banner at 16:9 beside a `size={8}` column of **three** text lines at 100% / 80% / 40%.
 *
 * Three, where the row has two lines and a chip — legacy's skeleton is not a per-element mirror, it
 * is the *mass* of the block. Kept as-is: the chip is a short pill on its own line, so the third bar
 * at 40% stands in for it more honestly than a fourth bar would.
 */
function EventsSkeleton({ count }: { count: number }) {
    return (
        <div className="flex min-w-0 flex-col gap-4">
            {Array.from({ length: count }, (_, index) => `event-skeleton-${index}`).map(
                (id, index) => (
                    <div key={id} aria-busy="true" className="flex min-w-0 items-start gap-4 p-1">
                        <Skeleton
                            h="auto"
                            className="aspect-video w-1/3 flex-none rounded-(--radius-lg)"
                            delay={index * 160}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            {['100%', '80%', '40%'].map((width, line) => (
                                <div key={width} className="flex h-[21px] items-center">
                                    <Skeleton w={width} delay={index * 160 + line * 60} />
                                </div>
                            ))}
                        </div>
                    </div>
                ),
            )}
        </div>
    )
}
