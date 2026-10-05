'use client'

import { useChannelStats } from '@features/channel'
import { liveShareContext } from '@features/share'
import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import type { ReactNode } from 'react'
import type { EventDetail } from '../api/types'
import {
    EVENT_STUDIO_BACKDROP,
    EVENT_STUDIO_CHROME_INSET,
    EVENT_STUDIO_CHROME_INSET_END,
    EVENT_STUDIO_SCRIM,
    EVENT_STUDIO_STAGE,
} from '../lib/studio'
import { eventPath } from '../routes'
import {
    EventStudioBackButton,
    EventStudioChannelBar,
    EventStudioToolbar,
} from './event-studio-chrome'
import { StudioPortal } from './event-studio-screen'

/**
 * **The studio's frame, with nothing running in it** — the blurred ground, the back button, the
 * channel plate and the toolbar, around one centred card.
 *
 * For a question that must be answered **before** anything of the broadcast is asked for: the 18+
 * confirmation. `EventStudioScreen` mounted behind a card would already have requested the preview
 * (spending one of the device's three looks), the playback, the gift catalogue and the board, and
 * joined the room — counting the reader as a viewer before they agreed to watch. This draws the
 * same frame and runs none of that: its only request is the channel's follower count, which the
 * details page shows anyway.
 *
 * Legacy draws its `AgeRestricted` screen inside `LiveView` in this same frame (back, channel bar,
 * Get Star / Get App, a card on the art), which is what this restores — the gate used to be the
 * details page's, so a reader on the studio saw the page, then the gate, then the studio.
 *
 * When the card's question is answered, the caller swaps this for the studio in the same frame:
 * the stage, the chat and the tray arrive on their own entrances over an unchanged ground.
 */
export function EventStudioShell({
    event,
    backdropUrl = null,
    children,
}: {
    event: EventDetail
    /** The proxy-blurred ground — see `studioBackdropUrl`. Falls back to the sharp art. */
    backdropUrl?: string | null
    children: ReactNode
}) {
    const channel = event.channel
    const { stats } = useChannelStats(channel?.slug ?? '', { enabled: Boolean(channel?.slug) })
    const art = event.images.banner ?? channel?.images.thumb ?? null

    return (
        <StudioPortal>
            <main data-testid="event-studio-shell" className={EVENT_STUDIO_STAGE}>
                {art && (
                    <div aria-hidden className={EVENT_STUDIO_BACKDROP}>
                        {/* `next/image`, not a `url(…)` in a style: see the studio's own note. */}
                        <Image
                            src={backdropUrl ?? art}
                            alt=""
                            fill
                            sizes="50vw"
                            className="object-cover"
                        />
                    </div>
                )}
                <div aria-hidden className={EVENT_STUDIO_SCRIM} />

                <div
                    data-studio-chrome
                    className={cn(
                        'absolute z-10 flex items-center gap-2',
                        EVENT_STUDIO_CHROME_INSET,
                    )}
                >
                    <EventStudioBackButton
                        slug={channel?.slug ?? null}
                        testId="event-studio-back"
                    />
                    <EventStudioChannelBar
                        channel={channel}
                        followerCount={stats?.follower_count ?? null}
                        eventTitle={event.title}
                        // Called only when the ⋯ panel opens — after hydration, as the studio does.
                        getShareUrl={() =>
                            event.shareable_url ??
                            (event.code && channel?.slug
                                ? `${window.location.origin}${eventPath(channel.slug, event.code)}`
                                : null)
                        }
                        shareContext={liveShareContext(event, channel?.slug)}
                        testId="event-studio-channel"
                    />
                </div>
                <div
                    data-studio-chrome
                    className={cn('absolute z-10 gap-2', EVENT_STUDIO_CHROME_INSET_END)}
                >
                    <EventStudioToolbar testId="event-studio-toolbar" />
                </div>

                <div className="relative z-0 flex h-full items-center justify-center p-3">
                    {children}
                </div>
            </main>
        </StudioPortal>
    )
}
