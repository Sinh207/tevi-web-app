'use client'

import { useAuth } from '@features/auth'
import { useBalance } from '@features/balance'
import {
    ChannelAutoFollow,
    useChannel,
    useChannelStats,
    useFollowedLives,
    useMyChannel,
} from '@features/channel'
import { liveShareContext } from '@features/share'
import { useTranslation } from '@shared/i18n/use-translation'
import { GIFT_BOB, RISE } from '@shared/lib/motion'
import { cn, formatCount } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LivePublisher } from '../api/live-types'
import type { EventDetail } from '../api/types'
import { useGiftBursts } from '../hooks/use-gift-bursts'
import { useGiftCatalog } from '../hooks/use-gift-catalog'
import { useLiveChat } from '../hooks/use-live-chat'
import { useLiveEventSync } from '../hooks/use-live-event-sync'
import { useLiveInvitation } from '../hooks/use-live-invitation'
import { useLivePreview } from '../hooks/use-live-preview'
import { useLiveRefusals } from '../hooks/use-live-refusals'
import { useLiveRoom } from '../hooks/use-live-room'
import { type LiveStreamState, useLiveStream } from '../hooks/use-live-stream'
import { useCompactStudio } from '../hooks/use-live-studio'
import { usePremiumNudge } from '../hooks/use-premium-nudge'
import { useRoomSeats } from '../hooks/use-room-seats'
import { useSeatScores } from '../hooks/use-seat-scores'
import { useSendGift } from '../hooks/use-send-gift'
import { useSustainedFee } from '../hooks/use-sustained-fee'
import { exclusivePhase } from '../lib/exclusive-phase'
import type { LiveChatLine } from '../lib/live-message'
import {
    EVENT_STUDIO_BACKDROP,
    EVENT_STUDIO_CHAT_WIDTH,
    EVENT_STUDIO_CHROME_INSET,
    EVENT_STUDIO_CHROME_INSET_END,
    EVENT_STUDIO_COLUMN,
    EVENT_STUDIO_PLAY_AREA,
    EVENT_STUDIO_SCRIM,
    EVENT_STUDIO_STAGE,
    EVENT_STUDIO_TRAY_BAND,
} from '../lib/studio'
import { watchState } from '../lib/watch-state'
import { eventPath } from '../routes'
import { EventEndedRail } from './event-ended-rail'
import {
    EventExclusivePaywall,
    EventPreviewCountdown,
    type ExclusiveReason,
} from './event-exclusive-overlay'
import { EventGiftAnimation } from './event-gift-animation'
import { EventGiftFloat } from './event-gift-float'
import { EventGiftPanel } from './event-gift-panel'
import { EventGiftTray } from './event-gift-tray'
import { EventInvitationDialog } from './event-invitation-dialog'
import { EventMembershipTile } from './event-membership-tile'
import { EventNotEnoughStarsDialog } from './event-not-enough-stars-dialog'
import { EventOutOfStarDialog } from './event-out-of-star-dialog'
import { EventPremiumNudge } from './event-premium-nudge'
import { EventSeatCard } from './event-seat-card'
import { EventStudioAd } from './event-studio-ad'
import { EventStudioChat, EventStudioChatStrip } from './event-studio-chat'
import {
    EventStudioBackButton,
    EventStudioChannelBar,
    EventStudioToolbar,
} from './event-studio-chrome'
import { EventStudioCompact, StageLoader } from './event-studio-compact'
import { EventStudioChatSkeleton, EventStudioTraySkeleton } from './event-studio-skeleton'
import { EventStudioStage } from './event-studio-stage'
import { EventGeoRestrictedPanel, EventKickedOutPanel, EventWatchPanel } from './event-watch-panel'

/**
 * **Live studio** — the stream, full-viewport, with the site's chrome behind it.
 *
 * ```
 * ┌───────────────────────────────────────────────────────────┐
 * │ (←) ( ◍ channel )                    ( ★ balance · Get App ) │  ← floating chrome
 * │                                                           │
 * │                    ┌─────────────┐                        │
 * │   blurred banner   │   the 510   │   blurred banner       │
 * │   under a 60%      │   column    │   under a 60% scrim    │
 * │   scrim            └─────────────┘                        │
 * └───────────────────────────────────────────────────────────┘
 * ```
 *
 * The third of the event area's three screens — see `lib/studio.ts` for the taxonomy and for why
 * the surface rules of `docs/DESIGN_SYSTEM.md` §6 deliberately do not apply to it.
 *
 * ## What is in the 510px column today, and what is coming
 *
 * The column holds `EventWatchPanel` on its `studio` plate, which means **every refusal is already
 * final**: off air, platform-restricted, locked behind a price or a membership. Those are the
 * screens legacy calls `ended`, `platformRestricted` and `eventIsLocked`, and they are the reason
 * the studio is worth having before the player is — a reader who is refused gets the refusal on the
 * screen the refusal is about, with the creator, their balance and a way into the app all in frame.
 *
 * The `watchable` branch is the one that is **not** finished: it renders the app hand-off, which is
 * the truthful answer while the web player does not exist, and it is where `LivePreview` and
 * `LiveSession` land. `docs/EVENT.md` holds the phasing; `EventScreen` is the gate that decides
 * whether this screen is reached at all, and it deliberately does not route a playable stream here
 * yet — doing so would swap a details page carrying a banner, a title, a host and a description for
 * a black field saying "get the app".
 *
 * ## States that exist in legacy and are not branches here
 *
 * `geoRestricted` and `kickout`. Neither is knowable from this payload: geo arrives as code `E003`
 * from `v1/streaming-events/{code}/preview/`, and a kickout arrives as a socket frame inside the
 * live room. This client calls neither, so a branch for them would be a screen nothing can raise —
 * the same rule `lib/watch-state.ts` states at length, and they land with the things that raise
 * them.
 *
 * The **age gate** is also not here, and that is a decision rather than a gap. `EventScreen` raises
 * `EventAgeGate` *before* this screen mounts, so an 18+ stream is confirmed on the details page and
 * the studio opens behind the answer. Legacy puts its gate over the video stage instead, which
 * means it draws the stream's own art — blurred, but the creator's — behind the question asking
 * whether the reader should be seeing it.
 */
export function EventStudioScreen({
    event,
    backdropUrl = null,
    onBlocked,
    onBanned,
    contained = false,
}: {
    event: EventDetail
    /**
     * Render in place instead of portalling over the site, and leave the shell alone. For
     * `/dev/event`, which shows several studios side by side in their own boxes — a portal would lift
     * every one of them over the whole harness.
     */
    contained?: boolean
    /**
     * The ground, already blurred by the image proxy — see `studioBackdropUrl`. Falls back to the
     * original art, which the CSS blur then carries alone.
     */
    backdropUrl?: string | null
    /**
     * The live room said this reader is banned from the channel (`block_user`). `EventScreen` holds
     * the answer, because the wall it raises replaces Live details as well as this screen.
     */
    onBlocked: () => void
    /** The room's `ban` frame, with the server's sentence — `EventScreen` draws the card. */
    onBanned: (message: string) => void
}) {
    const channel = event.channel

    /*
     * The follower count under the creator's name. A separate request from the event's, and it is
     * allowed to fail silently — `EventStudioChannelBar` simply omits the row, which is also what
     * it does for a creator who has none. Nothing on this screen depends on the number.
     *
     * `enabled` is off without a slug rather than the hook being called conditionally: hooks are
     * unconditional, and an event payload that reached this screen has a channel, so the guard is
     * for the type rather than for a case that happens.
     */
    const { stats } = useChannelStats(channel?.slug ?? '', { enabled: Boolean(channel?.slug) })

    /*
     * Legacy's fallback chain, exactly: the event's own banner, then the space's avatar. Both can
     * be absent — a creator who has uploaded neither — and the stage is simply black, which is
     * correct rather than broken. It is a video player with nothing playing yet.
     */
    const art = event.images.banner ?? channel?.images.thumb ?? null

    /*
     * **The free ten-second look**, and it is offered on exactly one state.
     *
     * Legacy's condition is `isExclusive || !isAuthenticated → <LivePreview/>`, which is its
     * tangled predicate for "this reader is outside the gate". `watchState`'s `locked` is the
     * replacement for that predicate (`@features/event/access` records why), so it is what gates
     * the request here — and gating matters rather than being tidy: a preview costs one of three
     * per device, so asking for one on a state that did not need it spends something real.
     */
    const state = watchState(event)

    /*
     * **Removed by the creator** — legacy's `isKickout`, from the room's `kickout` frame.
     *
     * A latch held *here*, above the stream hooks, because it switches them off: a reader who has
     * been removed must stop pulling the broadcast, and the room — gated on `isPlaying` — leaves
     * with it, which takes them out of the concurrent-viewer count the creator is looking at.
     * Legacy puts `Kickout` among the studio's own screens, so it is a studio refusal, not a page.
     */
    const [isKickedOut, setIsKickedOut] = useState(false)
    /** The server's sentence when the removal was learned from a refused join — the card's body. */
    const [kickMessage, setKickMessage] = useState<string | null>(null)

    /*
     * **Live ended, and the reader follows channels that are live right now** — legacy's ended
     * content, which replaces the ended card with a rail of those lives. Asked only once the
     * stream is off air, so a playing studio does not pay for a list it cannot show.
     */
    const { t, currentLanguage } = useTranslation()
    /** Below `STUDIO_MIN_WIDTH`: the portrait layout (`mobileStage`). */
    const isCompact = useCompactStudio()
    const endedLives = useFollowedLives({ collapsible: false, enabled: state.kind === 'off-air' })
    const showEndedRail = state.kind === 'off-air' && endedLives.visible.length > 0

    /*
     * **A guest previews, then is asked to sign in** — legacy's `!isAuthenticated → LivePreview`, on
     * any broadcast, free or paid. Every visitor carries an anonymous session, which is the bearer
     * the preview is asked with; the full stream is the signed-in reader's only. Nothing is asked
     * for while the session is bootstrapping: a reader about to be restored as signed in would
     * otherwise spend a look under the anonymous account.
     */
    const { isAuthenticated, isBootstrapping } = useAuth()
    const isGuest = !isAuthenticated
    const wantsPreview = state.kind === 'locked' || (state.kind === 'watchable' && isGuest)

    /*
     * **Locked mid-stream** — legacy's `isLocked`, raised by the room's `lock` frame.
     *
     * `watchState` alone cannot tell this reader from one who walked up to a gated stream: both are
     * `locked`. They are not treated alike: a reader locked **mid-watch** gets no preview (it would
     * spend one of the device's three looks on a stream they were just watching). The room they
     * were in stays on stage **frozen** — the same seats, every face shown with camera and
     * microphone off (`frozenRoom`, drawn `stillOnly`: no player, no Agora, no sound) — under the
     * wall, which says *Event is locked … to continue watching*. Legacy's `EventIsLocked` drops
     * the room for the channel art; keeping the seats is the product's ask, and says "this, once
     * you pay" with the people in it. Cleared once they are let back in (a purchase, or the host
     * lifting the lock), so a later lock is a fresh one.
     */
    const [isLockedByRoom, setIsLockedByRoom] = useState(false)
    /** The room as it was when the lock landed — see `freezeRoom`. */
    const [frozenRoom, setFrozenRoom] = useState<FrozenRoom | null>(null)
    const wasLocked = useRef(false)
    useEffect(() => {
        if (state.kind === 'locked') wasLocked.current = true
        else if (state.kind === 'watchable' && wasLocked.current) {
            wasLocked.current = false
            setIsLockedByRoom(false)
            setFrozenRoom(null)
        }
    }, [state.kind])

    const preview = useLivePreview({
        code: event.code ?? null,
        enabled: !isKickedOut && !isBootstrapping && !isLockedByRoom && wantsPreview,
    })

    /*
     * **The live room**, and it is gated on the same thing the preview is *not*.
     *
     * A reader looking at a refusal has no room to be in — joining one would put them in the
     * broadcast's concurrent-viewer count without watching it, and that number is one its creator
     * reads. So the socket opens for the **session** only — never for the preview, which is watched
     * from outside the room (see `isSession` below).
     *
     * `useLiveRoom` adds its own gates on top — a real account, and a code.
     */
    /*
     * **The real stream**, for a reader who is allowed to watch — the other half of the pair.
     *
     * `watchState` decides which of the two is asked for, and they are mutually exclusive by
     * construction: `locked` gets the preview, `watchable` gets the broadcast. Nobody
     * fetches both, so a paying viewer never spends a preview and a locked one never asks for a
     * stream they will be refused.
     */
    const stream = useLiveStream({
        code: event.code ?? null,
        enabled: !isKickedOut && isAuthenticated && state.kind === 'watchable',
    })

    /** Whichever of the two is actually on screen. The stage reads it. */
    const live = preview.isPlaying ? preview : stream
    const isPlaying = preview.isPlaying || stream.isPlaying
    /**
     * **The session** — the real stream, and the only thing that joins the room, runs the fee
     * clock or can end into the chat's *Live ended* state. The preview is none of those: it is
     * watched from outside, so it does not count as a viewer the creator sees.
     */
    const isSession = stream.isPlaying

    /*
     * **The exclusive layout** — see `exclusivePhase`. A reader outside the gate gets the
     * session's own layout (stage, chat column, tray) around the preview, with every action that
     * needs access raising the paywall. `paywallReason` is which door they tried; it only matters
     * while the preview plays, since once it is `closed` the paywall is up regardless.
     */
    /*
     * **Geo-restricted** — legacy's `isGeoRestricted`, set by the preview's `E003`. The one state
     * the event payload cannot carry, so it is read off the refusal; it outranks the exclusive
     * layout (there is nothing to sell somebody the stream cannot reach) and has its own card.
     */
    const isGeoRestricted = preview.refusal === 'geo-restricted'
    const exclusive = exclusivePhase({
        state: state.kind,
        isGuest,
        isResolving: isBootstrapping,
        isLockedByRoom,
        isKickedOut,
        preview,
    })
    const phase = isGeoRestricted ? null : exclusive
    const isExclusive = phase !== null
    const [paywallReason, setPaywallReason] = useState<ExclusiveReason | null>(null)
    // Leaving the exclusive layout (a purchase, the lock lifted) forgets the last prompt, so a later
    // lock starts clean rather than reopening on a stale reason.
    useEffect(() => {
        if (!isExclusive) setPaywallReason(null)
    }, [isExclusive])
    const showPaywall = phase === 'closed' || (phase === 'preview' && paywallReason !== null)
    /*
     * **Behind the wall, the room stays on screen** — faces only, every camera and microphone off
     * (`stillOnly` + `muteAll`): no player, no Agora, no sound, no open-mic ring.
     *
     * Where the seats come from, in order: the room frozen at a mid-watch lock (`frozenRoom`); the
     * preview's own room once its look ran out; and, when no look was had at all (spent, refused),
     * the room asked for on its own (`useRoomSeats`) — `layout/` plays nothing and spends no look.
     * None of the three: the channel art, as before.
     */
    const needsSeats =
        phase === 'closed' && !(isLockedByRoom && frozenRoom) && preview.publishers.length === 0
    const roomSeats = useRoomSeats({ code: event.code ?? null, enabled: needsSeats })
    const stillRoom: FrozenRoom | null =
        phase !== 'closed'
            ? null
            : isLockedByRoom && frozenRoom
              ? frozenRoom
              : preview.publishers.length > 0
                ? {
                      playback: preview.playback,
                      layout: preview.layout,
                      publishers: muteAll(preview.publishers),
                  }
                : roomSeats.publishers.length > 0
                  ? {
                        playback: null,
                        layout: roomSeats.layout,
                        publishers: muteAll(roomSeats.publishers),
                    }
                  : null
    const showStillStage = stillRoom !== null
    /** Something on the stage: a stream playing, or the room behind the wall without its picture. */
    const onStage = Boolean(isPlaying && live.playback) || showStillStage
    const stageFeed = isPlaying ? live : (stillRoom ?? preview)
    /*
     * **The seat whose card is open** — by id, so a refreshed seat list keeps it, and a publisher
     * who leaves the stage takes their card with them (the lookup below comes back empty).
     */
    const [seatCardId, setSeatCardId] = useState<string | null>(null)
    /*
     * The card closes when the paywall rises or the stage stops playing. Two reasons: the seat is
     * behind the frost (or gone), and both layers listen for Escape on `window` — left open
     * together, one press dismissed the paywall *and* the card. Nor may a stale id reopen a card
     * when playback comes back.
     */
    useEffect(() => {
        if (showPaywall || !isPlaying) setSeatCardId(null)
    }, [showPaywall, isPlaying])
    /** The publisher whose card is open, if they are still on stage. */
    const seatCard =
        seatCardId === null ? null : (stageFeed.publishers.find(p => p.id === seatCardId) ?? null)
    /*
     * A reader who may watch, whose stream is on its way: the session is being asked for (or the
     * account is still being restored, which is when it will be). Neither failed nor playing yet.
     */
    const isStreamPending =
        state.kind === 'watchable' &&
        !isKickedOut &&
        !stream.hasFailed &&
        !stream.isPlaying &&
        (isBootstrapping || stream.isLoading)
    /*
     * The refusals with **nothing behind them to be kept out of** — over, not on this platform, not
     * in this region. Their card stands on the blurred ground alone; the sharp art behind a paywall
     * says "this, but not for you", and for these there is no "this" to show.
     */
    const blurOnly =
        state.kind === 'off-air' ||
        state.kind === 'platform-restricted' ||
        isGeoRestricted ||
        // Removed by the creator: the room is shut to this reader, so there is nothing to show.
        isKickedOut

    const room = useLiveRoom({ code: event.code ?? null, enabled: isSession })
    // Enabled for the exclusive layout too: its board is HTTP (`top-stars`), and without a room
    // nothing else in the hook can fire.
    const chat = useLiveChat({ event, room, enabled: isSession || isExclusive })
    const scores = useSeatScores({
        code: event.code ?? null,
        publisherCount: live.publishers.length,
        topStars: chat.topStars,
        enabled: isPlaying,
    })
    /*
     * The room also reports that the event *record* changed — a rename, paid chat switched on, the
     * paywall dropped mid-stream. Both of those frames had no consumer at all; see the hook.
     */
    useLiveEventSync({
        code: event.code ?? null,
        room,
        onLocked: () => {
            // Freeze the room on screen *now*, while the stream's seats are still in hand.
            if (stream.isPlaying) setFrozenRoom(freezeRoom(stream))
            setIsLockedByRoom(true)
        },
    })
    useLiveRefusals({ room, onKickedOut: () => setIsKickedOut(true), onBlocked, onBanned })
    /*
     * ⚠ **A refused join is the removal, learned on the way back in.** A reader the creator
     * removed who reloads gets no `kickout` frame — they are not in the room to receive one — but
     * `join_event` refuses them. Treated as `connected`, the stream played on with the chat and the
     * gifts dead and nothing saying why; legacy has the same hole (its kick is page state, so a
     * reload undoes it). Any refusal is read as "not allowed in this room": the card says so in
     * the server's own words when it sent some, the stream stops and the room is left (a latch,
     * as the frame's is). Which `err_code` means *removed* specifically is **B121**.
     */
    useEffect(() => {
        if (!room.isRefused) return
        setKickMessage(room.refusalMessage)
        setIsKickedOut(true)
    }, [room.isRefused, room.refusalMessage])
    const invite = useLiveInvitation(room)
    /*
     * The sustained fee runs on the same gate as the room: only while something is playing. A
     * clock ticking behind a paywall would bill somebody for a screen that is refusing them.
     */
    const fee = useSustainedFee({ event, enabled: isSession })
    const { resyncPremium, isPremium } = useMyChannel()
    const { refresh: refreshBalance } = useBalance()
    /*
     * **Back from the other tab.** Both offers on *Out of Star* open in a new tab, so the reader
     * pays there and returns here. The socket frames (`premium_info`, `balance_change`) normally
     * deliver that news, but a frame can be missed — a sleeping tab, a reconnect — and then the wall
     * would stand over a reader who has already paid. So while it is up, coming back to the tab
     * re-reads the Premium state (past the ETag) and the balance; either lifts the wall.
     */
    const isWalled = isSession && fee.isOutOfStar
    useEffect(() => {
        if (!isWalled) return
        const onReturn = () => {
            if (document.visibilityState !== 'visible') return
            void resyncPremium()
            void refreshBalance()
        }
        document.addEventListener('visibilitychange', onReturn)
        window.addEventListener('focus', onReturn)
        return () => {
            document.removeEventListener('visibilitychange', onReturn)
            window.removeEventListener('focus', onReturn)
        }
    }, [isWalled, resyncPremium, refreshBalance])

    /**
     * ⚠ **The column has to outlive the stream that opened it.**
     *
     * `isPlaying` alone unmounts the chat the instant playback stops, which takes the conversation
     * away at the exact moment a broadcast ends — and the comps have a state for precisely that
     * (`Right menu/Type=Ended`: no header, no composer, a disabled *Live broadcast has ended*
     * pill). So a reader who *watched* it stop keeps the column; a reader who arrives at a stream
     * that was already over never sees it, because for them nothing ever played.
     *
     * A ref for "did it ever play" and state for "has it stopped": the ref is what makes this
     * one-way, so a reconnect mid-broadcast does not print an obituary.
     */
    const [hasEnded, setHasEnded] = useState(false)
    const hasPlayed = useRef(false)
    /*
     * ⚠ On the **session**, not on `isPlaying`: a preview that ran out stopped "playing" too, and
     * keyed on that the chat announced *Live broadcast has ended* over a stream that was still on.
     */
    useEffect(() => {
        if (isSession) {
            hasPlayed.current = true
            setHasEnded(false)
            return
        }
        if (hasPlayed.current) setHasEnded(true)
    }, [isSession])

    /**
     * Folded or not — the comps' `Panel Contract` pair (`Right menu/Type=collapse`).
     *
     * It lives here rather than in the column because both halves are the stage's business: the
     * video area is `flex-1`, so folding the chat is what gives the stream the width back. The
     * column drew a collapse button only when handed `onCollapse`, and nothing ever handed it one.
     */
    const [isChatOpen, setIsChatOpen] = useState(true)
    /**
     * The last line on screen when the chat was folded — what the strip counts *new* from. A line
     * object rather than an index or a count: the transcript is trimmed from the front, so a
     * position moves under it and a length stops growing at the cap.
     */
    const [foldedAt, setFoldedAt] = useState<LiveChatLine | null>(null)
    /*
     * Not for a reader the creator removed: the room is closed to them, and the column would
     * otherwise read the dropped session as *Live broadcast has ended* — a second, wrong account
     * of what happened, beside the card that says the right one.
     */
    const showChat = !isKickedOut && (isSession || hasEnded || isExclusive)

    /*
     * ⚠ **Gifts are sent on the session only.** The exclusive layout draws the tray too
     * (`showTray`), but a reader outside the gate has something to buy before they have something
     * to give, so there a gift opens the paywall. Everything that only means anything inside the
     * room — banners, the full-stage animation, the ad, the Premium nudge, auto-follow — stays on
     * the session.
     */
    const canGift = stream.isPlaying
    /*
     * The space, for **follow state** — viewer-relative, so not the event payload's seeded copy.
     * Shared with the channel plate's Follow (same query key, one request). `isViewerKnown` because
     * the seed says `is_followed: false` for everybody until the account's own body lands.
     */
    const { channel: space, isViewerKnown } = useChannel(event.channel?.slug ?? '')
    const isFollowed = isViewerKnown && Boolean(space?.is_followed)
    const nudge = usePremiumNudge({
        chargedAt: chat.chargedAt,
        feeNoticeShown: fee.notice !== null,
        isPremium,
        // Legacy's right panel is the session's, not the preview's — the same scope as the tray.
        enabled: canGift,
    })
    /** The tray is drawn for the exclusive layout too — its gifts open the paywall instead. */
    const showTray = canGift || isExclusive
    const catalog = useGiftCatalog({ event, enabled: showTray })
    const gift = useSendGift({ event, isConnected: room.isConnected })
    const bursts = useGiftBursts({ room, enabled: canGift })
    const [isCatalogOpen, setIsCatalogOpen] = useState(false)

    /**
     * Who the gift goes to.
     *
     * **Derived, not synchronised.** The reader's own pick wins; failing that the host's own seat,
     * and failing *that* nobody — at which point `useSendGift` falls back to `event.host`, which is
     * the id legacy sends on a solo broadcast. Legacy keeps this in state and pushes the host into
     * it from an effect keyed on `publishers`, so a seat list that arrives twice silently discards
     * whatever the reader had chosen in between.
     */
    const [pickedRecipient, setPickedRecipient] = useState<LivePublisher | null>(null)
    const recipient = useMemo(
        () =>
            pickedRecipient ??
            live.publishers.find(p => p.id !== null && p.id === event.host) ??
            null,
        [pickedRecipient, live.publishers, event.host],
    )

    /** The open seat's card — one element, docked by whichever layout draws it. */
    const seatCardLayer = seatCard && isPlaying && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center">
            <div className="pointer-events-auto flex w-full justify-center">
                <EventSeatCard
                    // A new person, a new entrance.
                    key={seatCard.id}
                    publisher={seatCard}
                    score={(seatCard.id && scores.get(seatCard.id)) || 0}
                    hostSlug={event.channel?.slug ?? null}
                    onClose={() => setSeatCardId(null)}
                    onSendGift={() => {
                        setSeatCardId(null)
                        // Outside the gate a gift is the paywall's door.
                        if (isExclusive) {
                            setPaywallReason('gift')
                            return
                        }
                        setPickedRecipient(seatCard)
                        setIsCatalogOpen(true)
                    }}
                />
            </div>
        </div>
    )

    /** The exclusive paywall — the same layer in both layouts. */
    const paywallLayer = showPaywall && (
        <EventExclusivePaywall
            event={event}
            reason={
                phase === 'closed'
                    ? (paywallReason ?? closedReason(preview, isLockedByRoom))
                    : paywallReason
            }
            lockedMidStream={isLockedByRoom}
            detail={preview.refusalText}
            // A guest's way in is signing in, whatever the stream costs.
            signIn={isGuest}
            // Only the preview can be returned to; once closed it is the wall.
            onClose={phase === 'preview' ? () => setPaywallReason(null) : undefined}
        />
    )

    const getShareUrl = () =>
        event.shareable_url ??
        (event.code && channel?.slug
            ? `${window.location.origin}${eventPath(channel.slug, event.code)}`
            : null)

    const stage = (
        /*
         * `role="dialog"` would be wrong — nothing here is dismissed by Escape and there is no
         * thing behind it to return to; the studio *is* the page at this width. It is a `<main>`
         * for the same reason the details page is one, and the fact that it happens to be
         * positioned over the shell is presentation.
         *
         * The shell underneath is made `inert` while this is up — see `StudioPortal`.
         */
        <main data-testid="event-studio" className={EVENT_STUDIO_STAGE}>
            {art && (
                /*
                 * `next/image` rather than a `backgroundImage` in a `style` object, and the reason
                 * is not only optimisation. `art` is a **backend-supplied URL**, and interpolating
                 * one into `url(…)` is a CSS-injection sink: a `)` in the string closes the
                 * function early and everything after it is parsed as further declarations. There
                 * is no `CSS.escape` for this — that function escapes *identifiers*, not URLs, and
                 * using it here mangles every real link instead.
                 *
                 * `CLAUDE.md`'s no-CDN rule does not apply: this is content art whose URL the
                 * backend decides, which is the stated exception alongside avatars and post media.
                 */
                <div aria-hidden className={EVENT_STUDIO_BACKDROP}>
                    <Image
                        /*
                         * Legacy's two blurs, both kept: the proxy's `blur(40)` on the file, then
                         * this layer's CSS `blur(20px)`. The server pass is what makes the pair that
                         * soft, and it is the smaller download — a blurred image is a gradient the
                         * encoder compresses well, where the sharp banner is detail fetched only to
                         * be destroyed.
                         */
                        src={backdropUrl ?? art}
                        alt=""
                        fill
                        // Blurred past recognition and then scrimmed, so the largest source this
                        // can ever need is a fraction of the viewport. Anything sharper is bytes
                        // spent on detail the `blur-[20px]` destroys.
                        sizes="50vw"
                        className="object-cover"
                    />
                </div>
            )}
            <div aria-hidden className={EVENT_STUDIO_SCRIM} />

            {/*
             * The chrome is `absolute` over the column rather than a row above it, because the
             * column is full-height: the stream fills the stage and the plates float on it. That is
             * legacy's arrangement and it is also what the comps show.
             */}
            <div
                // Measured by the stage to decide whether its box has to clear this row.
                data-studio-chrome
                className={cn('absolute z-10 flex items-center gap-2', EVENT_STUDIO_CHROME_INSET)}
            >
                <EventStudioBackButton slug={channel?.slug ?? null} testId="event-studio-back" />
                <EventStudioChannelBar
                    channel={channel}
                    followerCount={stats?.follower_count ?? null}
                    eventTitle={event.title}
                    /*
                     * A function, and called only when the ⋯ panel opens: the fallback reads
                     * `window.location.origin`, which during a render is a hydration mismatch —
                     * `event-share-button.tsx` carries the measurement.
                     */
                    getShareUrl={() =>
                        event.shareable_url ??
                        (event.code && channel?.slug
                            ? `${window.location.origin}${eventPath(channel.slug, event.code)}`
                            : null)
                    }
                    // Copy link and the QR mint a tracked link, as the Live details share sheet does.
                    shareContext={liveShareContext(event, channel?.slug)}
                    testId="event-studio-channel"
                />
            </div>

            {/*
             * The column carries the art a *second* time — unblurred and `bg-cover` — so the panel
             * sits on the stream's own frame rather than on the blur. Legacy draws it on all six of
             * its gate screens and it is what makes a refusal read as "this, but not for you"
             * rather than as an error page.
             */}
            {/*
             * ⚠ **A row, and the chat is the reason.**
             *
             * The stage column is `mx-auto` inside it rather than inside the whole screen, so the
             * stream stays centred in *what is left* when the chat is open — not centred on
             * the viewport with the chat overlapping it. Legacy uses a persistent MUI `Drawer`
             * with `flexShrink: 0`, which is the same arrangement spelled differently.
             */}
            <div className="relative z-0 flex h-full">
                {/*
                 * ⚠ **The stage area, and it has to exist as its own box.**
                 *
                 * The balance plate is pinned to *its* trailing edge, which is neither the
                 * window's nor the 510px column's:
                 *
                 * - inside `<main>`, `end-3` lands at the window edge — **inside the chat**, 180px
                 *   past where the stage ends. That is what shipped;
                 * - inside the column, it lands at the column's edge, ~300px short of it.
                 *
                 * The comps put it at the trailing edge of the video area, just left of the chat.
                 * Measured on a real broadcast at 1512 wide: chat starts at 1122, so the plate
                 * belongs at 1110 — not 1304 (over the chat) and not 804 (the column).
                 */}
                <div className="relative flex min-w-0 flex-1 flex-col">
                    <div
                        data-studio-chrome
                        // Above the exclusive paywall (z-30): its Star balance and Get App stay
                        // reachable while the paywall is up — both are ways to pay.
                        className={cn('absolute z-40 gap-2', EVENT_STUDIO_CHROME_INSET_END)}
                    >
                        <EventStudioToolbar testId="event-studio-toolbar" />
                        {/*
                         * The folded chat rides in the toolbar row — legacy's `ExpandDrawer`, which
                         * sits in the right panel's nav bar beside Star / Get App. It used to be a
                         * column of its own beside the stage area, which kept ~300px of the stage
                         * (and the tray under it) reserved for a pill; folding the chat is what is
                         * supposed to give the stage that width back.
                         */}
                        {showChat && !isChatOpen && (
                            <EventStudioChatStrip
                                event={event}
                                chat={chat}
                                onExpand={() => setIsChatOpen(true)}
                                since={foldedAt}
                                // Locked, there is nothing unread — the session's lines are not
                                // this reader's any more (the column shows none of them either).
                                hideUnread={isExclusive}
                                // Arrives once the column is half gone, so the two do not
                                // compete for the eye — the app's entrance, on its own curve.
                                className="animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_120ms_both] motion-reduce:animate-none"
                            />
                        )}
                    </div>
                    <div className={onStage ? EVENT_STUDIO_PLAY_AREA : EVENT_STUDIO_COLUMN}>
                        {/*
                         * The channel's art, sharp, behind a **refusal** only — legacy's six gate
                         * screens draw it so a paywall reads as "this, but not for you". Never
                         * behind the seats: legacy's session puts black tiles straight on the
                         * blurred ground, and a sharp copy here showed through every gap between
                         * tiles and either side of the grid.
                         */}
                        {/*
                         * …except once the broadcast is **over**: there is nothing behind the
                         * notice to be kept out of, so the sharp copy only fought the card for the
                         * eye. The blurred ground alone, edge to edge, as the ended rail has it.
                         */}
                        {art && !onStage && !blurOnly && (
                            <Image
                                src={art}
                                alt=""
                                aria-hidden
                                fill
                                sizes="510px"
                                className="object-cover"
                            />
                        )}
                        {onStage ? (
                            /*
                             * The preview, playing. Two things sit on it: the stream itself, and the
                             * paywall card pinned to the **bottom** rather than centred — legacy moves it
                             * out of the way while there is something to watch, and puts it back in the
                             * middle the moment the countdown ends. The card would otherwise cover the
                             * ten seconds it is advertising.
                             *
                             * ⚠ `blur-[4px]` is the backend's `is_preview` flag made visible, and it is
                             * legacy's own treatment (`Seats` applies it to the whole seat area). The
                             * sample is meant to show that something is happening and who is on camera,
                             * not to be watchable in itself.
                             */
                            <>
                                <div className="absolute inset-0 z-0">
                                    {/*
                                     * `EventStudioStage` owns the transport choice and the 4px preview
                                     * blur — both are properties of the *stream*, not of this screen, and
                                     * a preview of a multi-host room is an Agora room like any other.
                                     */}
                                    <EventStudioStage
                                        playback={stageFeed.playback}
                                        layout={stageFeed.layout}
                                        publishers={stageFeed.publishers}
                                        scores={scores}
                                        // Preview over: the seats stay, the picture goes.
                                        stillOnly={!isPlaying}
                                        // A seat opens its publisher's card; the same seat again
                                        // closes it. Only while something plays — under a paywall
                                        // wall the seats are behind the frost.
                                        onSelectPublisher={
                                            isPlaying
                                                ? p =>
                                                      setSeatCardId(current =>
                                                          current === p.id ? null : p.id,
                                                      )
                                                : undefined
                                        }
                                        selectedId={seatCardId}
                                    />
                                </div>
                                {/*
                                 * The paywall rides along with the **preview** only. A reader
                                 * watching the real stream has already got past it, and pinning a
                                 * "purchase access" card to the bottom of their video would be
                                 * asking them to buy what they are already watching.
                                 */}
                                {seatCardLayer}
                                {phase === 'preview' && (
                                    <div className="absolute inset-x-3 bottom-3 z-10 flex justify-center">
                                        <EventPreviewCountdown
                                            secondsLeft={preview.secondsLeft}
                                            totalSeconds={preview.totalSeconds}
                                            // Buy mid-preview: the paywall opens over the sample.
                                            onUnlock={() => setPaywallReason('unlock')}
                                            signIn={isGuest}
                                        />
                                    </div>
                                )}
                            </>
                        ) : isExclusive ? (
                            /*
                             * Exclusive, nothing playing: the art alone. The paywall over the
                             * stage area carries the offer; a second card here would say it twice.
                             */
                            phase === 'loading' && <StageLoader />
                        ) : isStreamPending ? (
                            /*
                             * ⚠ **Still fetching the stream is not "watch it in the app".** The
                             * column used to fall straight through to `EventWatchPanel`, whose
                             * `watchable` card is the hand-off for a playback the backend
                             * *refused* — so every visit flashed "can only be watched in the Tevi
                             * app" for as long as the playback and layout requests took, and only
                             * then started the stream.
                             */
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

                        {/*
                         * ⚠ **The gift banners, inside the stage box — legacy's own inset.**
                         *
                         * Legacy pins them at `bottom: 12px; left: 12px` of the **stage box**, which
                         * already stops above the 95px tray (`bottom: 100px` is only for a reader
                         * who has not followed, to clear an auto-follow bar this port does not draw
                         * — R3). They were positioned in the stage *area* instead, below which the
                         * tray also sits, so the offset had to be the tray's height spelled out
                         * (`bottom-[102px]`, then `99px`): one number per guess at the band.
                         * Anchored here, the tray's height is nobody's business.
                         *
                         * Logical inset: the plate is rounded on its leading edge and flies in from
                         * that side, so in Arabic both have to be the other one.
                         */}
                        {canGift && (
                            <div
                                className={cn(
                                    'pointer-events-none absolute start-3 z-10',
                                    // Legacy's `channel.is_followed ? 12px : 100px` — up out of the
                                    // way of the auto-follow bar, which only a non-follower gets.
                                    isFollowed ? 'bottom-3' : 'bottom-[100px]',
                                )}
                            >
                                <EventGiftFloat bursts={bursts} testId="event-gift-float" />
                            </div>
                        )}

                        {/*
                         * The full-stage gift animation — legacy's `SVGAPlayer`, a sibling of the
                         * seats inside the stage box. The session only, and only while the creator
                         * has not switched gift effects off.
                         */}
                        <EventGiftAnimation room={room} enabled={canGift && event.gift_effect} />

                        {/*
                         * The ad tile, bottom-trailing on the stage box — legacy's right panel
                         * stacks it at the foot of the stage, opposite the gift banners. Same scope
                         * as the tray: the real stream only, never the preview's paywall.
                         */}
                        {canGift && (
                            /*
                             * Legacy's right-panel foot — `Stack alignItems='flex-end' gap='4px'`,
                             * the ad first and the Premium card under it.
                             */
                            <div className="absolute bottom-3 end-3 z-10 flex flex-col items-end gap-1">
                                <EventStudioAd channel={event.channel} />
                                {/* Mounted on `open` so it can animate out — see the card. */}
                                <EventPremiumNudge
                                    open={nudge.isOpen}
                                    secondsLeft={nudge.secondsLeft}
                                    onClose={nudge.close}
                                />
                            </div>
                        )}
                    </div>

                    {/*
                     * The tray — **a row of its own at the foot of the stage area**, full width.
                     * `EVENT_STUDIO_TRAY_BAND` carries why it is no longer floated over the stream
                     * and no longer capped to the refusal column's 510px.
                     */}
                    {/*
                     * The ended rail, centred on the stage — legacy's `Container maxWidth='md'` at
                     * `top/left: 50%` with a translate. Wider than the 510 refusal column by design:
                     * it is three and a half cards across, not one notice.
                     */}
                    {showEndedRail && (
                        /*
                         * The poster blurred out **in full** and dimmed, so the rail's text and
                         * cards stand on a quiet ground — it sat straight on the column art and
                         * read only where the art happened to be dark.
                         */
                        <div className="absolute inset-0 z-10 flex items-center bg-black/55 px-3 backdrop-blur-2xl animate-[tevi-chart-fade_320ms_ease-out_both] motion-reduce:animate-none">
                            <EventEndedRail lives={endedLives.visible} locale={currentLanguage} />
                        </div>
                    )}

                    {/*
                     * The auto-follow bar — legacy mounts the space page's own `AutoFollowChannel`
                     * here, 100px up the stage area so it rides above the tray. The session only,
                     * and only once the account's own answer is in (see `isFollowed`).
                     */}
                    {canGift && space && isViewerKnown && (
                        <ChannelAutoFollow channel={space} placement="stage" />
                    )}

                    {showTray && (
                        <div className={EVENT_STUDIO_TRAY_BAND}>
                            <EventGiftTray
                                packages={catalog.packages}
                                isLoading={catalog.isLoading}
                                pendingId={isExclusive ? null : gift.pendingId}
                                canSend={isExclusive || gift.canSend}
                                // Outside the gate a gift is the door to the paywall, not a send.
                                onSend={pkg =>
                                    isExclusive
                                        ? setPaywallReason('gift')
                                        : gift.send(pkg, recipient)
                                }
                                isCatalogOpen={isCatalogOpen}
                                onOpenCatalog={() => setIsCatalogOpen(true)}
                                onCloseCatalog={() => setIsCatalogOpen(false)}
                                testId="event-gift-tray"
                            />
                            {canGift && <EventMembershipTile event={event} enabled={canGift} />}
                        </div>
                    )}

                    {/*
                     * The catalogue, docked to the **trailing edge of the stage area** — the same
                     * edge the balance plate uses, and for the same reason: inside `<main>` it would
                     * land under the chat, and inside the column it would land 300px short of where
                     * the comps put it. It clears the tray below and the toolbar above.
                     */}
                    {/*
                     * The stream is coming up: the tray is session-only, so without this it
                     * popped in under a spinner. The placeholder is the strip's own loading tiles.
                     */}
                    {!showTray && isStreamPending && <EventStudioTraySkeleton />}
                    {showTray && isCatalogOpen && (
                        <div className="absolute end-3 bottom-[99px] top-16 z-20 flex items-end">
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
                    )}

                    {paywallLayer}

                    {/*
                     * The chat is open only while something is actually playing. A reader looking at a
                     * refusal has no room to talk in — `useLiveRoom` is gated on the same condition, so
                     * the column and the socket appear and disappear together rather than leaving an
                     * empty panel beside a paywall.
                     */}
                </div>
                {/*
                 * The sustained fee's wall — legacy's `OutOfStar` beside the stage. Only while
                 * something plays: the fee clock is gated on the same thing, so outside it
                 * `isOutOfStar` can never rise.
                 */}
                <EventInvitationDialog
                    invitation={invite.invitation}
                    // Only computed while the dialog is open — which is after hydration, on a frame.
                    shareUrl={
                        invite.invitation
                            ? (event.shareable_url ??
                              (event.code && event.channel?.slug
                                  ? `${window.location.origin}${eventPath(event.channel.slug, event.code)}`
                                  : null))
                            : null
                    }
                    onClose={invite.dismiss}
                />
                <EventNotEnoughStarsDialog
                    open={gift.notEnough.open}
                    onClose={gift.notEnough.close}
                />
                <EventOutOfStarDialog open={isWalled} />
                {/*
                 * ⚠ **The paid picture is frosted while the fee is unpaid.** The dialog's own scrim
                 * is the DS's 75% black, and through it the stream stayed perfectly watchable —
                 * which made the wall a speed bump: dismissing nothing, a reader could simply sit
                 * and keep watching behind it. This softens the whole stage under the dialog (the
                 * dialog portals at `z-50`) — **deliberately not opaque**: 6px of blur keeps the
                 * stream recognisable, people and movement still there, but no longer comfortable
                 * to watch. The reader can see what they are missing, which is the case for paying;
                 * a 40px frost (tried first) hid it entirely and made the wall read as a blank. It fades in with the dialog. `shared/ui/dialog.tsx` is not
                 * touched: its scrim is the DS's, and this is the studio's own rule.
                 */}
                {isWalled && (
                    <div
                        aria-hidden
                        data-testid="event-studio-fee-frost"
                        className="pointer-events-none fixed inset-0 z-40 bg-black/20 backdrop-blur-[6px] animate-[tevi-chart-fade_240ms_ease-out_both] motion-reduce:animate-none"
                    />
                )}

                {/* The same for the chat column: its place held while the stream comes up. */}
                {!showChat && isStreamPending && <EventStudioChatSkeleton />}
                {showChat && (
                    /*
                     * ⚠ **Folding animates the column's width, and the chat stays mounted.**
                     *
                     * Legacy's persistent `Drawer` transitions `margin` so the stage widens as the
                     * panel leaves; this is the same motion on the app's 240ms curve (`tevi-rise`'s
                     * note). The chat keeps its width (`EVENT_STUDIO_CHAT_WIDTH`) inside a clip that shrinks, and `justify-end`
                     * pins it to the trailing edge, so it slides out rather than being cropped from
                     * its far side — logical, so in Arabic it leaves to the left.
                     *
                     * Kept mounted, which is also what keeps the transcript's scroll position across
                     * a fold. `inert` while folded takes it out of focus order and the accessibility
                     * tree, the job the unmount used to do.
                     */
                    <div
                        inert={!isChatOpen}
                        className={cn(
                            'flex flex-none justify-end overflow-clip',
                            'transition-[width] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                            isChatOpen ? EVENT_STUDIO_CHAT_WIDTH : 'w-0',
                        )}
                    >
                        <EventStudioChat
                            event={event}
                            chat={chat}
                            fee={fee}
                            /*
                             * ⚠ Not while exclusive. A lock stops the session, which is what
                             * `hasEnded` watches — so the column announced *Live broadcast has
                             * ended* (header gone, ended pill) over a broadcast that is still on.
                             * Locked, the reader gets the preview's locked column instead.
                             */
                            hasEnded={hasEnded && !isExclusive}
                            onCollapse={() => {
                                setFoldedAt(chat.lines.at(-1) ?? null)
                                setIsChatOpen(false)
                            }}
                            onLocked={isExclusive ? () => setPaywallReason('chat') : undefined}
                            lockedBySignIn={isGuest}
                        />
                    </div>
                )}
            </div>
        </main>
    )

    const view = isCompact ? (
        <EventStudioCompact
            contained={contained}
            model={{
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
            }}
        />
    ) : (
        stage
    )
    return contained ? view : <StudioPortal>{view}</StudioPortal>
}

/** The stage's feed for a room frozen by a mid-watch lock: what the seats need, nothing to play. */
interface FrozenRoom {
    playback: LiveStreamState['playback']
    layout: LiveStreamState['layout']
    publishers: LivePublisher[]
}

/**
 * The room at the moment it was locked, **with everybody's camera and microphone off** — so the
 * seats keep their arrangement and faces but show no picture, no open-mic ring and no red badge.
 * The playback is kept only for `liveTransport` to know the stage has seats to draw; `stillOnly`
 * guarantees nothing is mounted from it.
 */
function freezeRoom(stream: LiveStreamState): FrozenRoom {
    return {
        playback: stream.playback,
        layout: stream.layout,
        publishers: muteAll(stream.publishers),
    }
}

/** Everybody's camera and microphone off — a room shown behind the wall says nothing is live. */
function muteAll(publishers: LivePublisher[]): LivePublisher[] {
    return publishers.map(p => ({ ...p, audio: false, video: false }))
}

/**
 * Why the preview is not playing, once the paywall is a wall — so a reader who gets no sample is
 * told which of the three it was. Without it, "you have used your three looks" and "the request
 * failed" both looked like the preview simply not working.
 */
function closedReason(
    preview: { isComplete: boolean; isExhausted: boolean },
    isLockedByRoom: boolean,
): ExclusiveReason | null {
    // Locked mid-stream, the card already says "Event is locked … to continue": no second line.
    if (isLockedByRoom) return null
    if (preview.isComplete) return 'preview-ended'
    if (preview.isExhausted) return 'preview-exhausted'
    // Refused or never started: the API's own sentence, when it sent one, rides on the chip.
    return 'preview-unavailable'
}

/**
 * **The studio, out of the shell — and the shell, out of reach.**
 *
 * The stage is `fixed inset-0` over the site, and until now everything under it stayed mounted
 * *and focusable*: Tab walked from the stage into the hidden navbar, the rail and the details page
 * behind it, and a screen reader read the page the reader could not see. That was held back while
 * the stage's only control was Back — containing focus there would have trapped the reader *out* of
 * the page. It has a player, a chat, gifts and a channel plate now, so the reason is gone.
 *
 * `inert` on the shell (`[data-app-shell]`, `(main)/layout.tsx`) takes all of it out of focus order
 * and the accessibility tree at once — the platform's own "modal" without a hand-rolled trap. And it
 * forces the portal: `inert` is inherited, and the studio renders *inside* the shell, so marking the
 * shell would make the studio inert with it. Portalled to `<body>`, the stage is a sibling of what
 * it covers; React context still reaches it through the portal, so every provider keeps working.
 *
 * Dialogs the studio raises (base-ui) portal to `<body>` too, so they are never inside the inert
 * subtree. The attribute is only removed if this put it there.
 */
export function StudioPortal({ children }: { children: ReactNode }) {
    const [target, setTarget] = useState<HTMLElement | null>(null)

    useEffect(() => {
        setTarget(document.body)
        const shell = document.querySelector('[data-app-shell]')
        if (!shell || shell.hasAttribute('inert')) return
        shell.setAttribute('inert', '')
        return () => shell.removeAttribute('inert')
    }, [])

    return target ? createPortal(children, target) : null
}
