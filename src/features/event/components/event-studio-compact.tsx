'use client'

import type { useChannelStats, useFollowedLives } from '@features/channel'
import { liveShareContext } from '@features/share'
import { useTranslation } from '@shared/i18n/use-translation'
import { GIFT_BOB, RISE } from '@shared/lib/motion'
import { cn, formatCount } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { LivePublisher } from '../api/live-types'
import type { EventDetail } from '../api/types'
import type { useGiftBursts } from '../hooks/use-gift-bursts'
import type { useGiftCatalog } from '../hooks/use-gift-catalog'
import type { LiveChatState } from '../hooks/use-live-chat'
import type { useLiveInvitation } from '../hooks/use-live-invitation'
import type { LivePreviewState } from '../hooks/use-live-preview'
import type { LiveRoomState } from '../hooks/use-live-room'
import type { useSendGift } from '../hooks/use-send-gift'
import type { SustainedFeeState } from '../hooks/use-sustained-fee'
import type { ExclusivePhase } from '../lib/exclusive-phase'
import { EVENT_STUDIO_BACKDROP, EVENT_STUDIO_SCRIM, EVENT_STUDIO_STAGE } from '../lib/studio'
import { EventEndedRail } from './event-ended-rail'
import type { ExclusiveReason } from './event-exclusive-overlay'
import { EventPreviewCountdown } from './event-exclusive-overlay'
import { EventGiftAnimation } from './event-gift-animation'
import { EventGiftFloat } from './event-gift-float'
import { EventGiftPanel } from './event-gift-panel'
import { EventInvitationDialog } from './event-invitation-dialog'
import { EventNotEnoughStarsDialog } from './event-not-enough-stars-dialog'
import { EventOutOfStarDialog } from './event-out-of-star-dialog'
import { EventStudioChat } from './event-studio-chat'
import {
    EventStudioBackButton,
    EventStudioChannelBar,
    EventStudioTopActions,
} from './event-studio-chrome'
import { EventStudioStage } from './event-studio-stage'
import { EventGeoRestrictedPanel, EventKickedOutPanel, EventWatchPanel } from './event-watch-panel'

/** The stage's wait — a small glass disc with the loader, over the art or the blurred ground. */
export function StageLoader() {
    return (
        <span className="relative z-10 grid size-14 place-items-center rounded-full bg-black/40 backdrop-blur-md animate-[tevi-chart-fade_240ms_ease-out_both] motion-reduce:animate-none">
            <Loader className="text-white" />
        </span>
    )
}

/** What a stage feed carries — the stream's, the preview's, or a room frozen behind the wall. */
interface StageFeed {
    playback: LivePreviewState['playback']
    layout: LivePreviewState['layout']
    publishers: LivePublisher[]
}

/**
 * Everything `EventStudioScreen` has already decided, handed over whole: this layout computes
 * nothing of its own, so the portrait and the desktop studio cannot disagree about a state.
 */
export interface CompactStudioModel {
    art: string | null
    backdropUrl: string | null
    onStage: boolean
    blurOnly: boolean
    stageFeed: StageFeed
    scores: Map<string, number>
    isPlaying: boolean
    setSeatCardId: Dispatch<SetStateAction<string | null>>
    seatCardId: string | null
    isExclusive: boolean
    phase: ExclusivePhase | null
    isStreamPending: boolean
    isGeoRestricted: boolean
    isKickedOut: boolean
    kickMessage: string | null
    showEndedRail: boolean
    event: EventDetail
    isLockedByRoom: boolean
    room: LiveRoomState
    canGift: boolean
    channel: EventDetail['channel']
    stats: ReturnType<typeof useChannelStats>['stats']
    getShareUrl: () => string | null
    chat: LiveChatState
    preview: LivePreviewState
    setPaywallReason: Dispatch<SetStateAction<ExclusiveReason | null>>
    isGuest: boolean
    bursts: ReturnType<typeof useGiftBursts>
    showChat: boolean
    fee: SustainedFeeState
    hasEnded: boolean
    showTray: boolean
    setIsCatalogOpen: Dispatch<SetStateAction<boolean>>
    seatCardLayer: ReactNode
    isCatalogOpen: boolean
    catalog: ReturnType<typeof useGiftCatalog>
    live: StageFeed
    recipient: LivePublisher | null
    setPickedRecipient: Dispatch<SetStateAction<LivePublisher | null>>
    gift: ReturnType<typeof useSendGift>
    endedLives: ReturnType<typeof useFollowedLives>
    currentLanguage: string
    paywallLayer: ReactNode
    invite: ReturnType<typeof useLiveInvitation>
    isWalled: boolean
}

/*
 * **The portrait studio** — below `STUDIO_MIN_WIDTH` there is no room for a chat column beside
 * the stage, so the studio becomes a full-screen vertical player: the stage edge to edge, the
 * chrome over its top on a fading scrim, and the chat floating over its foot (`variant="overlay"`)
 * with the gift button beside the composer. Every state is the desktop studio's own — the same
 * hooks, the same phase, the same paywall, seat card and refusals — only placed for a phone.
 * The tray is not drawn (one row of gifts has no room here); the gift button opens the
 * catalogue docked to the foot instead, capped in height rather than a bottom sheet.
 */
export function EventStudioCompact({
    model,
    contained = false,
}: {
    model: CompactStudioModel
    /** In a box rather than over the viewport — `/dev/event`'s phone frame. */
    contained?: boolean
}) {
    const { t } = useTranslation()
    const {
        art,
        backdropUrl,
        onStage,
        blurOnly,
        stageFeed,
        scores,
        isPlaying,
        setSeatCardId,
        seatCardId,
        isExclusive,
        phase,
        isStreamPending,
        isGeoRestricted,
        isKickedOut,
        kickMessage,
        showEndedRail,
        event,
        isLockedByRoom,
        room,
        canGift,
        channel,
        stats,
        getShareUrl,
        chat,
        preview,
        setPaywallReason,
        isGuest,
        bursts,
        showChat,
        fee,
        hasEnded,
        showTray,
        setIsCatalogOpen,
        seatCardLayer,
        isCatalogOpen,
        catalog,
        live,
        recipient,
        setPickedRecipient,
        gift,
        endedLives,
        currentLanguage,
        paywallLayer,
        invite,
        isWalled,
    } = model
    /** Two or more on stage — a grid, which takes the height the short chat window gives up. */
    const isGrid = stageFeed.publishers.length > 1

    return (
        <main
            data-testid="event-studio"
            data-option-value="compact"
            className={
                contained ? 'relative size-full overflow-hidden bg-black' : EVENT_STUDIO_STAGE
            }
        >
            {art && (
                <div aria-hidden className={EVENT_STUDIO_BACKDROP}>
                    <Image
                        src={backdropUrl ?? art}
                        alt=""
                        fill
                        sizes="100vw"
                        loading="eager"
                        className="object-cover"
                    />
                </div>
            )}
            <div aria-hidden className={EVENT_STUDIO_SCRIM} />

            {/* The stage, edge to edge. */}
            <div className="absolute inset-0 z-0 flex items-center justify-center">
                {art && !onStage && !blurOnly && (
                    <Image
                        src={art}
                        alt=""
                        aria-hidden
                        fill
                        sizes="100vw"
                        loading="eager"
                        className="object-cover"
                    />
                )}
                {onStage ? (
                    /*
                     * One face on stage is the whole screen, the chat floating over the picture.
                     * Two or more is a grid, and a grid under the chat loses its bottom row — so
                     * it is confined between the top row and the chat's window instead.
                     */
                    <div
                        className={cn(
                            'absolute animate-[tevi-chart-fade_320ms_ease-out_both] motion-reduce:animate-none',
                            isGrid
                                ? cn(
                                      // Down to the short chat window's top (see `overlayHeight`).
                                      'inset-x-0 bottom-[calc(min(26vh,220px)+72px)]',
                                      // Below the preview's clock while it hangs under the top row.
                                      phase === 'preview'
                                          ? 'top-[calc(env(safe-area-inset-top)+112px)]'
                                          : 'top-[calc(env(safe-area-inset-top)+60px)]',
                                  )
                                : 'inset-0',
                        )}
                    >
                        <EventStudioStage
                            playback={stageFeed.playback}
                            layout={stageFeed.layout}
                            publishers={stageFeed.publishers}
                            scores={scores}
                            stillOnly={!isPlaying}
                            onSelectPublisher={
                                isPlaying
                                    ? p =>
                                          setSeatCardId(current => (current === p.id ? null : p.id))
                                    : undefined
                            }
                            selectedId={seatCardId}
                            // Space first on a phone: a lone face fills the screen, a grid
                            // hangs from the top with a 4px edge (see `fill`).
                            fill
                        />
                    </div>
                ) : (
                    <div
                        // Clear of the chrome above (two rows + safe area), and scrollable: a card
                        // with a QR (platform-restricted) is taller than a short phone.
                        className="absolute inset-0 z-10 overflow-y-auto overscroll-contain"
                    >
                        <div className="flex min-h-full w-full items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+112px)] pb-8">
                            {isExclusive ? (
                                phase === 'loading' && <StageLoader />
                            ) : isStreamPending ? (
                                <StageLoader />
                            ) : isGeoRestricted ? (
                                <EventGeoRestrictedPanel />
                            ) : isKickedOut ? (
                                <EventKickedOutPanel message={kickMessage} />
                            ) : showEndedRail ? null : (
                                <EventWatchPanel
                                    event={event}
                                    surface="studio"
                                    lockedMidStream={isLockedByRoom}
                                />
                            )}
                        </div>
                    </div>
                )}
                <EventGiftAnimation room={room} enabled={canGift && event.gift_effect} />
            </div>

            {/*
             * Top: **one row** on a scrim fading into the picture — back, the channel (avatar,
             * name, followers, Follow, ⋯), and the head count. Star and Get App moved to the rail;
             * the upsell pill has no room on a phone. The preview's clock hangs under the row.
             */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-40 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.55),rgba(0,0,0,0.2)_70%,transparent)] pt-[env(safe-area-inset-top)] pb-10">
                <div className="pointer-events-auto flex items-center gap-2 px-3 pt-3 animate-[tevi-chart-fade_240ms_ease-out_both] motion-reduce:animate-none">
                    <EventStudioBackButton
                        slug={channel?.slug ?? null}
                        testId="event-studio-back"
                    />
                    {/* The head count, right after back — a compact glass chip. */}
                    {chat.ccu !== null && !isExclusive && (
                        <span className="type-micro-overline flex h-8 flex-none items-center gap-1 rounded-full bg-black/40 px-2 tabular-nums text-white ring-1 ring-inset ring-white/10 backdrop-blur-md">
                            <Icon name="eye" size={16} className="size-3.5 text-white/80" />
                            <span key={chat.ccu} className={RISE}>
                                {formatCount(chat.ccu)}
                            </span>
                        </span>
                    )}
                    <div className="flex min-w-0 flex-1">
                        <EventStudioChannelBar
                            channel={channel}
                            followerCount={stats?.follower_count ?? null}
                            eventTitle={event.title}
                            getShareUrl={getShareUrl}
                            shareContext={liveShareContext(event, channel?.slug)}
                            compact
                            testId="event-studio-channel"
                        />
                    </div>
                    <EventStudioTopActions />
                </div>
                {phase === 'preview' && (
                    <div className="pointer-events-auto mt-3 flex justify-center px-3">
                        <EventPreviewCountdown
                            secondsLeft={preview.secondsLeft}
                            totalSeconds={preview.totalSeconds}
                            onUnlock={() => setPaywallReason('unlock')}
                            signIn={isGuest}
                        />
                    </div>
                )}
            </div>

            {/* Gift banners, over the chat's top edge. */}
            {canGift && (
                <div
                    className={cn(
                        'pointer-events-none absolute start-3 z-20',
                        isGrid
                            ? 'bottom-[calc(min(26vh,220px)+96px)]'
                            : 'bottom-[calc(min(36vh,320px)+96px)]',
                    )}
                >
                    <EventGiftFloat bursts={bursts} testId="event-gift-float" />
                </div>
            )}

            {/*
             * Bottom: the chat over the picture, on a scrim fading up into it, the composer on one
             * row with the gift button right after the field. Star and Get App are on the top row.
             */}
            {(showChat || isExclusive) && !showEndedRail && (
                <div className="absolute inset-x-0 bottom-0 z-20 bg-[linear-gradient(to_top,rgba(0,0,0,0.72),rgba(0,0,0,0.35)_55%,transparent)] pt-16 animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_120ms_both] motion-reduce:animate-none">
                    <EventStudioChat
                        variant="overlay"
                        event={event}
                        chat={chat}
                        fee={fee}
                        hasEnded={hasEnded && !isExclusive}
                        onLocked={isExclusive ? () => setPaywallReason('chat') : undefined}
                        lockedBySignIn={isGuest}
                        /*
                         * ⚠ A grid's bottom row must not sit under the words: with two or more on
                         * stage the transcript takes the short window and the grid the height it
                         * gives up. One face keeps the tall window — it is behind the chat anyway.
                         */
                        overlayHeight={isGrid ? 'short' : 'tall'}
                        // The gift sits right after the field, on the composer's own row.
                        accessory={
                            showTray && (
                                <button
                                    type="button"
                                    data-testid="event-studio-gift-trigger"
                                    aria-expanded={isCatalogOpen}
                                    aria-label={t('event_seat_send_gift')}
                                    onClick={() =>
                                        isExclusive
                                            ? setPaywallReason('gift')
                                            : setIsCatalogOpen(open => !open)
                                    }
                                    className={cn(
                                        'grid size-11 flex-none place-items-center rounded-full text-white',
                                        'bg-[linear-gradient(135deg,#9B6BFF,#501BC0)] shadow-[0_6px_18px_rgba(80,27,192,0.55)] ring-1 ring-inset ring-white/25',
                                        'transition-transform active:scale-90 motion-reduce:transition-none',
                                    )}
                                >
                                    <span className={cn('flex', GIFT_BOB)}>
                                        <Icon name="gift-simple" size={22} />
                                    </span>
                                </button>
                            )
                        }
                    />
                </div>
            )}

            {seatCardLayer && (
                <div
                    className={cn(
                        'absolute inset-x-0 z-30',
                        isGrid
                            ? 'bottom-[calc(min(26vh,220px)+80px)]'
                            : 'bottom-[calc(min(36vh,320px)+80px)]',
                    )}
                >
                    {seatCardLayer}
                </div>
            )}

            {/* The catalogue, docked to the foot and capped — a panel, not a bottom sheet. */}
            {showTray && isCatalogOpen && (
                <>
                    <button
                        type="button"
                        aria-label={t('common_close')}
                        tabIndex={-1}
                        onClick={() => setIsCatalogOpen(false)}
                        className="absolute inset-0 z-30 bg-black/40 animate-[tevi-chart-fade_200ms_ease-out_both] motion-reduce:animate-none"
                    />
                    <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[72dvh] justify-center px-2 pb-[max(8px,env(safe-area-inset-bottom))] [&>*]:w-full [&>*]:max-w-none">
                        <EventGiftPanel
                            packages={catalog.packages}
                            exclusive={catalog.exclusive}
                            publishers={live.publishers}
                            recipient={recipient}
                            onSelectRecipient={setPickedRecipient}
                            pendingId={isExclusive ? null : gift.pendingId}
                            canSend={isExclusive || gift.canSend}
                            onSend={(pkg, to) => {
                                if (!isExclusive) return gift.send(pkg, to)
                                setIsCatalogOpen(false)
                                setPaywallReason('gift')
                            }}
                            onClose={() => setIsCatalogOpen(false)}
                            testId="event-gift-panel"
                        />
                    </div>
                </>
            )}

            {showEndedRail && (
                <div className="absolute inset-0 z-10 flex items-center overflow-y-auto bg-black/55 px-3 py-24 backdrop-blur-2xl animate-[tevi-chart-fade_320ms_ease-out_both] motion-reduce:animate-none">
                    <EventEndedRail lives={endedLives.visible} locale={currentLanguage} />
                </div>
            )}

            {/* The paywall over the stage, under the chrome (z-40) so Star and back stay reachable. */}
            <div className="pointer-events-none absolute inset-0 z-30 [&>*]:pointer-events-auto">
                {paywallLayer}
            </div>

            <EventInvitationDialog
                invitation={invite.invitation}
                shareUrl={invite.invitation ? getShareUrl() : null}
                onClose={invite.dismiss}
            />
            <EventNotEnoughStarsDialog open={gift.notEnough.open} onClose={gift.notEnough.close} />
            <EventOutOfStarDialog open={isWalled} />
            {isWalled && (
                <div
                    aria-hidden
                    className="pointer-events-none fixed inset-0 z-40 bg-black/20 backdrop-blur-[6px] animate-[tevi-chart-fade_240ms_ease-out_both] motion-reduce:animate-none"
                />
            )}
        </main>
    )
}
