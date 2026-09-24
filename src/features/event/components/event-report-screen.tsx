'use client'

import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import {
    AppBar,
    AppBarCluster,
    AppBarSubtitle,
    AppBarTitle,
    AppBarTitleText,
} from '@shared/ui/app-bar'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { EventDetail } from '../api/types'
import { useCanonicalEventSlug } from '../hooks/use-canonical-event-slug'
import { useEvent } from '../hooks/use-event'
import { useEventOwnership } from '../hooks/use-event-ownership'
import { EVENT_LIST_CONTAINER, EVENT_PANEL, EVENT_SCREEN } from '../lib/container'
import { eventPath, eventReportPath } from '../routes'
import { EventOrdersPanel } from './event-orders-panel'
import { EventReportSkeleton } from './event-report-skeleton'
import { EventErrorState, EventNotFoundState } from './event-state-screens'

/**
 * `/@{slug}/event/{code}/report` — **every order behind one broadcast's money.**
 *
 * Legacy opens this in a `ResponsiveModal` from the *Revenue summary* header. It is a route here,
 * and `routes.ts` says why: the browser's own back closes it, a refresh stays on it, and it gets a
 * `loading.tsx` instead of a spinner inside a popup.
 *
 * ## The cost of being a route, paid here
 *
 * A dialog inherited the event and the ownership verdict from the screen that opened it. A route has
 * neither, so this resolves both again — `useEvent` (seeded by the server render, so the first paint
 * is not a skeleton) and `useEventOwnership`. Neither is a second request in practice: both share
 * TanStack keys with the event page, so arriving from it is a cache read.
 *
 * ## A non-host is **sent to the event page**, not shown a wall
 *
 * Every endpoint behind this answers for the bearer about an event the bearer must own, so the
 * backend is the guarantee and this is a rendering decision. What makes a redirect right rather than
 * a refusal is that there *is* a page for them one level up — the event itself. A wall would be a
 * dead end on a URL whose parent they are welcome on.
 *
 * `replace`, not `push`: this URL must not become a history entry they have to press back through.
 *
 * ⚠ The redirect waits for `'viewer'` and never fires on `'unknown'`. Ownership is a tri-state and
 * the third value is "the session has not resolved yet" — bouncing on it would throw a host off
 * their own report during the bootstrap, which is the same class of bug `useEventOwnership`'s doc
 * records from the other direction.
 */
export function EventReportScreen({
    code,
    slug,
    initialEvent,
}: {
    code: string
    /**
     * From the URL, so the back control works before the event lands — and **only** until it does.
     *
     * The moment the payload arrives, `event.channel.slug` is the authority and this is superseded
     * everywhere: an event is addressed by its code, so the handle in the path is whatever link
     * somebody followed, which after a rename is a space that no longer answers to it. Left in place
     * it would be the destination of both the back control and the non-host bounce below — two ways
     * to send a host to a handle that is wrong.
     */
    slug: string
    initialEvent?: EventDetail | null
}) {
    const { t } = useTranslation()
    const router = useRouter()
    const { event, isLoading, notFound, isError, refetch } = useEvent({ code, initialEvent })
    const ownership = useEventOwnership(event)

    /*
     * **The event's own handle wins over the URL's, as soon as there is one.**
     *
     * `parent` is where both the back control and the non-host bounce go, so a stale handle in the
     * path is a stale handle in two destinations. Falling back to the URL's covers the beat before
     * the payload lands, which is the only reason `slug` is a prop at all.
     */
    const canonicalSlug = event?.channel?.slug ?? null
    const parent = eventPath(canonicalSlug ?? slug, code)

    /*
     * And the address bar is corrected too, for the same reason the event page does it. The route
     * itself redirects first where it can; this covers the two renders it cannot reach — a failed
     * server fetch, and a client-side navigation. It is a `history.replaceState`, so it costs no
     * navigation and no refetch — see the hook.
     *
     * That is a reversal, and a deliberate one: this route shipped arguing a redirect would be
     * "motion with no reason behind it" because the page is `noindex, nofollow` and shared with
     * nobody, so a handle variant costs no crawler and no attribution. True, and beside the point —
     * the cost is *internal*. This URL's handle is read back out as `parent`, and the host who
     * presses back after a rename lands on a space page for a handle that does not resolve. The SEO
     * argument was answering a question nobody had asked.
     */
    useCanonicalEventSlug({
        requested: slug,
        canonical: canonicalSlug,
        code,
        path: eventReportPath,
    })

    useEffect(() => {
        if (ownership === 'viewer') router.replace(parent)
    }, [ownership, parent, router])

    return (
        <main className={cn('flex flex-1 flex-col', EVENT_SCREEN)}>
            <div className={cn('sticky top-0 z-20', EVENT_SCREEN)}>
                <AppBar className={cn(EVENT_LIST_CONTAINER, 'md:px-0')}>
                    <AppBarCluster className="min-w-0">
                        {/*
                         * ⚠ **`router.back()` when there is history, the event page when there is
                         * not** — the idiom `PageBackBar`, `ChannelTopBar`, `ProfileTopBar`,
                         * `TwoFaBackBar` and, in this very feature, `EventTopBar` all use.
                         *
                         * This shipped as an unconditional `router.push(parent)`, argued from a real
                         * constraint: the URL is refreshable and bookmarkable, so it is routinely the
                         * first page of a session, and a bare `router.back()` would leave the site.
                         * True — and `history.length > 1` is precisely the guard for it, which is why
                         * five other bars already read it. The conclusion skipped the guard and threw
                         * out the case it was protecting.
                         *
                         * What that cost is what a reader actually reports: **a push is a forward
                         * navigation.** Next's router cache restores a back/forward traversal for
                         * free, but a push to a dynamic route re-fetches its RSC payload
                         * (`staleTimes.dynamic` defaults to **0**, so nothing dynamic is reused on a
                         * forward navigation), which on a slow connection is the event page's
                         * `loading.tsx` raised on the way *back*. Measured on the same round trip:
                         * **1 RSC request before this change, 0 after.**
                         *
                         * ⚠ Scroll position is **not** part of what this buys, which is worth saying
                         * because it is the obvious thing to assume. Measured both ways, the event
                         * page comes back at `scrollY: 0` from 400 — a real back included. The page's
                         * content arrives from client queries after the router has restored, so at
                         * the moment the browser would restore the offset the document is still
                         * short and the position is clamped. Fixing that is a different job
                         * (reserving the height, or restoring after the data lands) and is not
                         * pretended to here.
                         *
                         * `EventTopBar`'s own note says the two sub-page bars must not "read as
                         * different things". They did.
                         */}
                        <BarIconButton
                            data-testid="event-report-back"
                            name="angle-left"
                            weight="filled"
                            mirrored
                            label={t('common_back')}
                            onClick={() => {
                                // Read in the handler, never at render: it is meaningless during SSR
                                // — `PageBackBar` carries the same note.
                                if (window.history.length > 1) router.back()
                                else router.push(parent)
                            }}
                        />
                    </AppBarCluster>

                    {/*
                     * The page's `<h1>`, and here it genuinely is the page's subject — unlike the
                     * event page, whose bar label is a template name and whose `h1` is the event's
                     * own title (see `EventTopBar`).
                     *
                     * The broadcast's name is the bar's **subtitle**, which is what `AppBarSubtitle`
                     * is for. It was a grey line floating between the bar and the card: left-aligned
                     * against a centred title, on the page colour, belonging to neither — an orphan.
                     * A report is *about* something, and the bar is where a screen says what.
                     */}
                    <AppBarTitle className="max-w-[calc(100%-112px)]">
                        <AppBarTitleText as="h1" className="min-w-0 truncate">
                            {t('event_report_details')}
                        </AppBarTitleText>
                        {event?.title && (
                            <AppBarSubtitle className="min-w-0 truncate">
                                {event.title}
                            </AppBarSubtitle>
                        )}
                    </AppBarTitle>
                </AppBar>
            </div>

            <div className={cn('flex flex-1 flex-col pb-6', EVENT_LIST_CONTAINER)}>
                {/*
                 * The event is still resolving, or the session is — and a `'viewer'` is mid-redirect,
                 * which must not flash the report at them on the way out.
                 */}
                {/* Every state is a block in the column — see `EventScreen`, same split. */}
                {/*
                 * The walls take the same panel the list does. This screen is already §6's
                 * single-panel branch (`EVENT_SCREEN` is on the plane unconditionally), so only the
                 * block is needed — without it a wall sat on the page colour from `md` up while the
                 * list it replaces is a card.
                 */}
                {notFound ? (
                    <div className={cn('flex flex-1 flex-col', EVENT_PANEL)}>
                        <EventNotFoundState />
                    </div>
                ) : isError ? (
                    <div className={cn('flex flex-1 flex-col', EVENT_PANEL)}>
                        <EventErrorState onRetry={() => void refetch()} />
                    </div>
                ) : isLoading || !event || ownership !== 'host' ? (
                    <EventReportSkeleton />
                ) : (
                    <>
                        {/*
                         * `docs/DESIGN_SYSTEM.md` §6's **single-panel** branch: this screen is one
                         * block — a list — so the surface runs full-bleed below `md` (painted by
                         * `EVENT_SCREEN` on the column) and becomes a card from `md` up. The event
                         * page is the other branch, a stack of cards with page colour between them.
                         *
                         * It shipped without this and the defect was only visible on a desktop: the
                         * rows sat on the page colour with a surface-coloured sticky header over
                         * them, so the one part of the list that was painted was the part that
                         * floats.
                         *
                         * `flex-1` so the panel **fills the column** rather than hugging its
                         * content. A list of two orders otherwise leaves a 330px card stranded at
                         * the top of a 1000px window with two thirds of the page empty under it —
                         * which is the exact sentence `PROFILE_PANEL` and `MCN_INVITATION_PANEL`
                         * both carry, and the reason they grow too. It also gives the empty and
                         * failed states somewhere to centre.
                         *
                         * ⚠ `overflow-clip`, **not** `overflow-hidden`. The radius has to clip the
                         * sticky controls' square top corners, and `overflow: hidden` would make
                         * this a scroll container — which parks a `position: sticky` descendant at
                         * the bottom of *this* box instead of the viewport, i.e. the controls would
                         * stop following the page. Same trap `MCN_INVITATION_PANEL` records.
                         */}
                        <div className={cn('flex flex-1 flex-col md:overflow-clip', EVENT_PANEL)}>
                            <EventOrdersPanel code={code} />
                        </div>
                    </>
                )}
            </div>
        </main>
    )
}
