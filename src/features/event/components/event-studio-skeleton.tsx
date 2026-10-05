'use client'

import { useChannelStats } from '@features/channel'
import { liveShareContext } from '@features/share'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { EventDetail } from '../api/types'
import {
    EVENT_STUDIO_BACKDROP,
    EVENT_STUDIO_CHAT_VARS,
    EVENT_STUDIO_CHROME_INSET,
    EVENT_STUDIO_CHROME_INSET_END,
    EVENT_STUDIO_COLUMN,
    EVENT_STUDIO_PANEL,
    EVENT_STUDIO_SCRIM,
    EVENT_STUDIO_TRAY_BAND,
} from '../lib/studio'
import { eventPath } from '../routes'
import { EventGiftTray } from './event-gift-tray'
import {
    EventStudioBackButton,
    EventStudioChannelBar,
    EventStudioToolbar,
} from './event-studio-chrome'
import { StageLoader } from './event-studio-compact'

/** The DS bar, lifted for the studio's dark glass — `--opacity-labels-55` vanishes on it. */
const BAR = 'bg-white/30'

/**
 * **The studio, before anything in it has arrived** — the same frame, the same three regions,
 * each holding its place: the stage's loader where the stream will play, the tray's placeholder
 * tiles at its foot, and the chat column with its header, podium, rows and composer.
 *
 * Two callers, one shape, so nothing jumps between them:
 *
 * - **`EventScreen`, before the studio is decided** (`EventStudioSkeleton`). The studio arrives in
 *   an effect — it must, see `useLiveStudio` — so a live stream used to paint the *details* skeleton
 *   (a white column), then swap to a black full-screen studio. Now a live stream paints this from
 *   `md` and the details skeleton below it. **CSS picks, not JavaScript**: nothing here guesses the
 *   viewport in HTML, which is the one thing `useLiveStudio` forbids, and a phone never sees it.
 *   Rendered in place rather than through `StudioPortal`, whose portal does not exist on the server
 *   render and whose `inert` would freeze a phone's shell behind a frame it cannot see.
 * - **The studio itself, while the stream is coming up** (`EventStudioChatSkeleton`,
 *   `EventStudioTraySkeleton`): the chat column and the tray are session-only, so they used to pop
 *   in beside a spinner the moment the stream started. Their placeholders now hold the space.
 */
export function EventStudioSkeleton({
    event,
    backdropUrl = null,
    className,
}: {
    event: EventDetail
    backdropUrl?: string | null
    className?: string
}) {
    const channel = event.channel
    const { stats } = useChannelStats(channel?.slug ?? '', { enabled: Boolean(channel?.slug) })
    const art = event.images.banner ?? channel?.images.thumb ?? null

    return (
        <div
            data-testid="event-studio-skeleton"
            aria-busy="true"
            className={cn('fixed inset-0 z-[45] overflow-hidden bg-black', className)}
        >
            {art && (
                <div aria-hidden className={EVENT_STUDIO_BACKDROP}>
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
                className={cn('absolute z-10 flex items-center gap-2', EVENT_STUDIO_CHROME_INSET)}
            >
                <EventStudioBackButton slug={channel?.slug ?? null} testId="event-studio-back" />
                <EventStudioChannelBar
                    channel={channel}
                    followerCount={stats?.follower_count ?? null}
                    eventTitle={event.title}
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

            <div className="relative z-0 flex h-full">
                <div className="relative flex min-w-0 flex-1 flex-col">
                    <div
                        data-studio-chrome
                        className={cn('absolute z-10 gap-2', EVENT_STUDIO_CHROME_INSET_END)}
                    >
                        <EventStudioToolbar testId="event-studio-toolbar" />
                    </div>
                    <div className={cn(EVENT_STUDIO_COLUMN, 'min-h-0 flex-1')}>
                        <StageLoader />
                    </div>
                    <EventStudioTraySkeleton />
                </div>
                <EventStudioChatSkeleton />
            </div>
        </div>
    )
}

/** The tray band with the strip's own loading tiles — `EventGiftTray` draws them itself. */
export function EventStudioTraySkeleton() {
    return (
        <div className={EVENT_STUDIO_TRAY_BAND}>
            <EventGiftTray
                packages={[]}
                isLoading
                pendingId={null}
                canSend={false}
                onSend={() => {}}
                isCatalogOpen={false}
                onOpenCatalog={() => {}}
                onCloseCatalog={() => {}}
            />
        </div>
    )
}

/** Widths for the transcript's rows — varied, as real messages are, and fixed so SSR agrees. */
const ROWS = [
    [96, 210],
    [72, 150],
    [110, 240],
    [84, 120],
    [100, 190],
    [64, 170],
    [90, 220],
] as const

/**
 * The chat column, empty — its real panel (`EVENT_STUDIO_PANEL`), the header band, the board's
 * podium of three, the transcript's rows (avatar, name, a line of message) and the composer pill,
 * each at the height the loaded column gives it. Staggered by the DS's 160ms, top to bottom.
 */
export function EventStudioChatSkeleton() {
    return (
        <aside
            data-testid="event-studio-chat-skeleton"
            aria-busy="true"
            className={cn(EVENT_STUDIO_PANEL, 'flex h-full flex-col')}
            style={EVENT_STUDIO_CHAT_VARS as CSSProperties}
        >
            {/* The header band: the board's title and its podium. */}
            <div className="flex flex-none flex-col gap-3 bg-(--live-chat-header) px-4 pt-4 pb-3">
                <div className="flex h-6 items-center">
                    <Skeleton w={150} className={BAR} />
                </div>
                <div className="flex items-end justify-center gap-6 pt-1">
                    {[
                        { size: 40, lift: 'mb-0', delay: 160 },
                        { size: 52, lift: 'mb-3', delay: 0 },
                        { size: 40, lift: 'mb-0', delay: 320 },
                    ].map(({ size, lift, delay }) => (
                        <div key={delay} className={cn('flex flex-col items-center gap-2', lift)}>
                            <Skeleton circle w={size} delay={delay} className={BAR} />
                            <Skeleton w={44} h={8} delay={delay} className={BAR} />
                        </div>
                    ))}
                </div>
            </div>

            {/* The transcript, anchored to the bottom as the real one is. */}
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 overflow-hidden px-4 py-3">
                {ROWS.map(([name, line], i) => (
                    <div key={name + line} className="flex items-start gap-2">
                        <Skeleton circle w={28} delay={i * 160} className={BAR} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                            <Skeleton w={name} h={10} delay={i * 160} className={BAR} />
                            <Skeleton
                                w={`min(${line}px, 100%)`}
                                h={10}
                                delay={i * 160}
                                className={BAR}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* The composer: one 44px pill on a 12px inset. */}
            <div className="flex-none p-3">
                <div className="flex h-11 items-center gap-3 rounded-full bg-white/[0.08] px-4 ring-1 ring-inset ring-white/10">
                    <Skeleton w="45%" className={BAR} />
                    <span className="flex-1" />
                    <Skeleton circle w={20} className={BAR} />
                    <Skeleton circle w={20} className={BAR} />
                </div>
            </div>
        </aside>
    )
}
