'use client'

import { cn } from '@shared/lib/utils'
import { useState } from 'react'
import type { EventDetail } from '../api/types'
import { useAgeGate } from '../hooks/use-age-gate'
import { useCanonicalEventSlug } from '../hooks/use-canonical-event-slug'
import { useEvent } from '../hooks/use-event'
import { useEventOwnership } from '../hooks/use-event-ownership'
import { useLiveStudio } from '../hooks/use-live-studio'
import { EVENT_CONTAINER, EVENT_PANEL, EVENT_SCREEN } from '../lib/container'
import { isLive } from '../lib/event-status'
import { EventAgeGate } from './event-age-gate'
import { EventDescriptionCard } from './event-description-card'
import { EventDetailsAutoFollow } from './event-details-auto-follow'
import { EventDetailsCard } from './event-details-card'
import { EventHostCard } from './event-host-card'
import { EventHostLiveScreen } from './event-host-live-screen'
import { EventHostScreen } from './event-host-screen'
import { EventShareButton } from './event-share-button'
import { EventSkeleton } from './event-skeleton'
import { EventBannedState, EventErrorState, EventNotFoundState } from './event-state-screens'
import { EventStudioScreen } from './event-studio-screen'
import { EventTopBar } from './event-top-bar'
import { EventWatchPanel } from './event-watch-panel'

/**
 * `/@{slug}/event/{code}` — **one live event, from a viewer's side.**
 *
 * ```
 * bar          back · "Live details"
 * ─────────────────────────────────────
 * details      banner + access badge · status · title · schedule · share
 * host         "Hosted by" → the space
 * watch        what this reader can do about it   ← lib/watch-state.ts decides
 * description  what the creator wrote
 * ```
 *
 * ## Two pages behind one URL
 *
 * Legacy branches on `myChannel.id === event.channel.id` and shows the **host** something else
 * entirely — a revenue report. Both are here: `useEventOwnership` decides, `EventHostScreen` is the
 * host's, and everything below the bar swaps. The bar, the column and the surfaces are shared,
 * because they are the *page*; only its content differs.
 *
 * ⚠ **The age gate is not shared** — it belongs to the viewer, which is where legacy keeps it
 * (`components/viewer/…/ageRestricted`, and the creator tree has none). It used to sit above this
 * branch here, which asked a creator to confirm they were over 18 before showing them their own
 * revenue report. The branch below carries the rest of that note.
 *
 * Ownership is a **tri-state** and `'unknown'` renders the skeleton — see that hook for the two
 * rules and for what collapsing the third state does to each side (a host briefly shown a paywall
 * for their own stream; a stranger briefly shown revenue).
 *
 * ⚠ `liveAccess`'s `purchased`-after-membership ordering matters on both branches — a host's own
 * stream comes back `purchased: true`, and the wrong order blanked the badge on it. Its own doc
 * carries the reported card.
 *
 * ## Three states before the page, and they are not interchangeable
 *
 * `notFound` (the service said 404), `isError` (the request failed), and loading. The first two are
 * different screens on purpose — see `event-state-screens.tsx`; this URL ends up on posters, and
 * telling somebody their link is broken because a service blinked is a lie with a long tail.
 *
 * The **age gate** comes after those and after the ownership branch — it is a *viewer* state, one of
 * the six legacy lists beside Ended, GeoRestricted, PlatformRestricted, Kickout and Locked. Within
 * the viewer it still comes before everything, because what it withholds is the banner and the
 * description: the material itself. See `EventAgeGate` for why it covers the whole viewer page where
 * legacy's covers only the player.
 */
export function EventScreen({
    code,
    slug: requestedSlug,
    initialEvent,
    backdropUrl = null,
}: {
    code: string
    /**
     * The handle **as this URL spells it**, already through `parseChannelSlug`.
     *
     * Used for one thing only — noticing that it disagrees with the event's own and correcting the
     * address bar (`useCanonicalEventSlug`). Everything this screen *renders* reads
     * `event.channel.slug` instead, because the payload is the authority and the URL is decoration:
     * an event is addressed by its code, and the handle in front of it is whatever the link somebody
     * followed happened to carry.
     */
    slug: string
    /**
     * The server render's copy of the event, or `null` when the render could not get one.
     *
     * `undefined` is a **third** state and it is meaningful: it means no server fetch happened at
     * all (a client-side navigation into this route), and `useEvent` then seeds nothing and shows
     * the skeleton. `null` means the server asked and could not answer, so the client's own fetch
     * is what decides — see `use-event.ts`.
     */
    initialEvent?: EventDetail | null
    /**
     * The Live studio's ground, **pre-blurred by the image proxy** (`studioBackdropUrl`, from the
     * route's server render). `null` on a client-side navigation — the studio then blurs the
     * original in CSS alone.
     */
    backdropUrl?: string | null
}) {
    const { event, isLoading, notFound, isError, refetch } = useEvent({ code, initialEvent })
    const ownership = useEventOwnership(event)

    /*
     * **Banned from the channel** — legacy's event-level `isBlocked`, raised by the live room's
     * `block_user` frame and asked before anything else in the viewer tree.
     *
     * Held here rather than in the studio because it outlives the studio: the frame arrives over a
     * socket the studio owns, and the answer is a wall that replaces *both* viewer screens. A latch,
     * as legacy's is — nothing un-bans a reader mid-visit, and a reload re-asks the room.
     */
    const [isBlocked, setIsBlocked] = useState(false)

    /*
     * Called unconditionally, as a hook must be — `required` is what makes it inert. It reads the
     * event that may not have arrived yet, which is why `required` is `Boolean(event?…)` rather than
     * a bare field access: before the payload lands there is no question to ask, and after it lands
     * the effect inside re-reads the stored answer.
     */
    const age = useAgeGate({
        code,
        required: Boolean(event?.age_restriction),
    })

    const slug = event?.channel?.slug ?? null

    /*
     * The URL's handle against the event's own. The route redirects for this when it can, and there
     * are two renders where it cannot — a failed server fetch, and a client-side navigation. A URL
     * edit rather than a navigation, so nothing is refetched; see the hook. Inert whenever the two
     * already agree, which is almost always.
     */
    useCanonicalEventSlug({ requested: requestedSlug, canonical: slug, code })

    /*
     * **Which block a wall stands in, now that the plane no longer changes.**
     *
     * `EVENT_SCREEN` is on `<main>` and the bar at every state (see the note below it), so the two
     * walls no longer have to switch the surface — they only need the block. `EVENT_PANEL` is that:
     * nothing below `md`, where the wall sits directly on the painted plane like every other block,
     * and the card from `md` up.
     *
     * §6 is explicit about why a wall takes the block its content had: *"the state sits on the same
     * surface as the content it replaces. Floating on `--background` while the list it stands in for
     * is a card reads as a page that failed, not one with nothing in it."*
     *
     * ⚠ The host's live screen is **not** one of them, and it was for a moment. A wall *replaces*
     * the page's content; that screen is the same column with one block swapped, so it stays an
     * ordinary multi-block state.
     */
    const isHostLive = ownership === 'host' && isLive(event?.status ?? null)

    /*
     * **Live details or Live studio** — the viewer's two screens, one URL.
     *
     * `useLiveStudio` is legacy's `EventLayout` condition: wide enough, and the stream is on air or
     * came off it within the last five minutes. It answers `false` on the server and on the first
     * client render, so this page always paints as Live details and the studio arrives in an
     * effect — see the hook for why guessing the viewport in HTML is the one thing it must not do.
     *
     * ⚠ **`watchable` used to be excluded here and no longer is.** While the studio had no
     * player, routing a stream somebody *could* watch into it replaced a page carrying the
     * banner, the title, the host and the description with a black field offering the app —
     * strictly less than the reader had. The clause that did that outlived its reason by a
     * while: the player landed and this was still sending every watchable broadcast to the
     * details page, which is why "why can't I watch the live?" had the answer "because of one
     * `!==`".
     *
     * If the studio ever cannot play a stream again, the fallback belongs **inside** it — the
     * stage already renders the app hand-off for a transport it does not support — and not in
     * this gate, which decides which *screen* the reader is on.
     */
    const studioEligible = useLiveStudio(event)
    // `!isBlocked` is the half of legacy's `EventLayout` condition this port left out — its own
    // comment in `lib/studio.ts` quoted it and the predicate dropped it.
    const inStudio = studioEligible && !isBlocked && ownership === 'viewer' && Boolean(event)

    return (
        <main className={cn('flex flex-1 flex-col', EVENT_SCREEN)}>
            {/*
             * `z-20`, matching every other sub-page bar in this app. The wrapper is what carries the
             * sticky background full-bleed while the bar inside it lines up with the column.
             *
             * ⚠ **`EVENT_SCREEN` at every state, the bar included** — `docs/DESIGN_SYSTEM.md` §6 and
             * `panel-full-bleed-below-md`: below `md` the surface is the whole screen, and the
             * sticky bar has to carry it too, because content scrolls *under* the bar and a
             * transparent one shows rows sliding past the title.
             *
             * This was conditional on `isWall` — the page colour while the page had content, the
             * surface only once a wall replaced it. That came out of a real defect (the plane
             * painted while the blocks were *unpainted*, so a phone showed four transparent cards on
             * one white sheet) but resolved it the wrong way round. `EVENT_CARD` carries the other
             * half now, and its note has the legacy measurement that settles which way round is
             * right.
             */}
            <div className={cn('sticky top-0 z-20', EVENT_SCREEN)}>
                <EventTopBar
                    slug={slug}
                    /*
                     * Share in the bar for the **host's live screen only** — that state drops the
                     * viewer's details card, and with it the Share button that lives inside it. The
                     * viewer keeps its own and must not end up with two.
                     */
                    actions={isHostLive && event ? <EventShareButton event={event} /> : undefined}
                />
            </div>

            {/*
             * No top padding — `AppBar` is 60px around a 44px row, so it already carries 8px of
             * clear space below its contents, and a column that adds its own asks for the gap
             * twice. `PageBackBar`'s doc records the six sub-pages that each picked a different
             * number before this was written down. `gap-4` between blocks is legacy's 16.
             */}
            <div className={cn('flex flex-1 flex-col gap-4 pb-6', EVENT_CONTAINER)}>
                {/*
                 * **Nothing here replaces the page.** Not found and failed are both blocks inside
                 * the column, so the bar, the back button and the URL survive every state this
                 * screen can be in — see `EventNotFoundState` and `EventErrorState`.
                 *
                 * The route boundary (`[code]/not-found.tsx`) composes the same bar and column
                 * around the same block, so a missing event looks identical whether the server or
                 * the browser discovered it.
                 */}
                {notFound ? (
                    // The panel the wall stands on — see `isWall` above.
                    <div className={cn('flex flex-1 flex-col', EVENT_PANEL)}>
                        <EventNotFoundState />
                    </div>
                ) : isError ? (
                    <div className={cn('flex flex-1 flex-col', EVENT_PANEL)}>
                        <EventErrorState onRetry={() => void refetch()} />
                    </div>
                ) : isLoading || !event || ownership === 'unknown' ? (
                    <EventSkeleton />
                ) : isHostLive && event ? (
                    // No panel wrapper — its blocks are cards in the column, like the viewer's.
                    <EventHostLiveScreen event={event} />
                ) : ownership === 'host' ? (
                    /*
                     * ⚠ **Ownership is asked first, and the age gate is one of the viewer's states —
                     * not the page's.** This is legacy's structure, literally: `isMyEvent ? <Creator
                     * /> : <Viewer />`, with `AgeRestricted` living inside the *viewer* tree
                     * (`components/viewer/components/liveView`) among Ended, GeoRestricted,
                     * PlatformRestricted, Kickout and Locked. The creator tree has no age gate at
                     * all.
                     *
                     * This port had it the other way round, with a justification written here: *"it
                     * applies to the host too. A creator who flagged their own broadcast 18+ is not
                     * exempt from confirming it."* That was invented, it contradicts the source, and
                     * what it produced is the thing a creator actually reported — being asked to
                     * confirm they are over 18 before being shown **their own revenue report**. The
                     * gate withholds *content*; a host's branch is a bill.
                     *
                     * The argument was not even self-consistent: a creator who set the flag has
                     * already told us the stream is 18+, so asking them is a consent prompt whose
                     * answer we were handed at creation time.
                     */
                    <EventHostScreen event={event} />
                ) : isBlocked ? (
                    // Before the age gate, as legacy asks it: a banned reader is not asked their age.
                    <div className={cn('flex flex-1 flex-col', EVENT_PANEL)}>
                        <EventBannedState />
                    </div>
                ) : age.isResolving ? (
                    // Only the viewer waits on it now — the stored answer is per account and per
                    // event, and the host branch never asks the question.
                    <EventSkeleton />
                ) : !age.isAllowed ? (
                    <EventAgeGate onConfirm={age.confirm} slug={slug} />
                ) : inStudio ? (
                    /*
                     * The stage is `fixed inset-0 z-40`, so it covers this column and the site's
                     * shell rather than sitting inside them. Rendering it from here — inside the
                     * viewer branch, after the age gate — is what makes the two screens share every
                     * gate ahead of them: ownership, not-found, the outage state and the 18+
                     * confirmation are asked once and answered for both.
                     */
                    <EventStudioScreen
                        event={event}
                        backdropUrl={backdropUrl}
                        onBlocked={() => setIsBlocked(true)}
                    />
                ) : (
                    <>
                        <EventDetailsCard event={event} />
                        {event.channel && <EventHostCard channel={event.channel} />}
                        <EventWatchPanel event={event} />
                        <EventDescriptionCard description={event.description} />
                        <EventDetailsAutoFollow slug={slug} />
                    </>
                )}
            </div>
        </main>
    )
}
