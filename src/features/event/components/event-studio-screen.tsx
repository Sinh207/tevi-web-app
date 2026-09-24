'use client'

import { useAuth } from '@features/auth'
import {
    ChannelAutoFollow,
    useChannel,
    useChannelStats,
    useFollowedLives,
    useMyChannel,
} from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
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
import { useLiveStream } from '../hooks/use-live-stream'
import { usePremiumNudge } from '../hooks/use-premium-nudge'
import { useSeatScores } from '../hooks/use-seat-scores'
import { useSendGift } from '../hooks/use-send-gift'
import { useSustainedFee } from '../hooks/use-sustained-fee'
import {
    EVENT_STUDIO_BACKDROP,
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
import { EventGiftAnimation } from './event-gift-animation'
import { EventGiftFloat } from './event-gift-float'
import { EventGiftPanel } from './event-gift-panel'
import { EventGiftTray } from './event-gift-tray'
import { EventInvitationDialog } from './event-invitation-dialog'
import { EventMembershipTile } from './event-membership-tile'
import { EventOutOfStarDialog } from './event-out-of-star-dialog'
import { EventPremiumNudge } from './event-premium-nudge'
import { EventStudioAd } from './event-studio-ad'
import { EventStudioChat, EventStudioChatStrip } from './event-studio-chat'
import {
    EventStudioBackButton,
    EventStudioChannelBar,
    EventStudioToolbar,
} from './event-studio-chrome'
import { EventStudioStage } from './event-studio-stage'
import { EventKickedOutPanel, EventSignInPanel, EventWatchPanel } from './event-watch-panel'

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

    /*
     * **Live ended, and the reader follows channels that are live right now** — legacy's ended
     * content, which replaces the ended card with a rail of those lives. Asked only once the
     * stream is off air, so a playing studio does not pay for a list it cannot show.
     */
    const { currentLanguage } = useTranslation()
    const endedLives = useFollowedLives({ expanded: true, enabled: state.kind === 'off-air' })
    const showEndedRail = state.kind === 'off-air' && endedLives.visible.length > 0

    /*
     * **A guest is asked to sign in, on any broadcast** — legacy's `!isAuthenticated → LivePreview`,
     * whose own fetches then never run without a `currentUser`. See `EventSignInPanel`. Both stream
     * hooks are off for them: playback and the preview each need a bearer, and asking without one
     * only spends a request on a refusal.
     */
    const { isAuthenticated } = useAuth()
    const needsSignIn = !isAuthenticated && (state.kind === 'watchable' || state.kind === 'locked')

    const preview = useLivePreview({
        code: event.code ?? null,
        enabled: !isKickedOut && !needsSignIn && state.kind === 'locked',
    })

    /*
     * **The live room**, and it is gated on the same thing the preview is *not*.
     *
     * A reader looking at a refusal has no room to be in — joining one would put them in the
     * broadcast's concurrent-viewer count without watching it, and that number is one its creator
     * reads. So the socket opens for a stream that is actually playing: the preview while it runs,
     * and (once the `watchable` branch routes here) the stream itself.
     *
     * `useLiveRoom` adds its own gates on top — a real account, and a code.
     */
    /*
     * **The real stream**, for a reader who is allowed to watch — the other half of the pair.
     *
     * `watchState` decides which of the two is asked for, and they are mutually exclusive by
     * construction: `locked` gets the ten-second sample, `watchable` gets the broadcast. Nobody
     * fetches both, so a paying viewer never spends a preview and a locked one never asks for a
     * stream they will be refused.
     */
    const stream = useLiveStream({
        code: event.code ?? null,
        enabled: !isKickedOut && !needsSignIn && state.kind === 'watchable',
    })

    /** Whichever of the two is actually on screen. The stage, the room and the chat all read it. */
    const live = preview.isPlaying ? preview : stream
    const isPlaying = preview.isPlaying || stream.isPlaying

    const room = useLiveRoom({ code: event.code ?? null, enabled: isPlaying })
    const chat = useLiveChat({ event, room, enabled: isPlaying })
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
    useLiveEventSync({ code: event.code ?? null, room })
    useLiveRefusals({ room, onKickedOut: () => setIsKickedOut(true), onBlocked })
    const invite = useLiveInvitation(room)
    /*
     * The sustained fee runs on the same gate as the room: only while something is playing. A
     * clock ticking behind a paywall would bill somebody for a screen that is refusing them.
     */
    const fee = useSustainedFee({ event, enabled: isPlaying })

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
    useEffect(() => {
        if (isPlaying) {
            hasPlayed.current = true
            setHasEnded(false)
            return
        }
        if (hasPlayed.current) setHasEnded(true)
    }, [isPlaying])

    /**
     * Folded or not — the comps' `Panel Contract` pair (`Right menu/Type=collapse`).
     *
     * It lives here rather than in the column because both halves are the stage's business: the
     * video area is `flex-1`, so folding the chat is what gives the stream the width back. The
     * column drew a collapse button only when handed `onCollapse`, and nothing ever handed it one.
     */
    const [isChatOpen, setIsChatOpen] = useState(true)
    const showChat = isPlaying || hasEnded

    /*
     * ⚠ **Gifts ride on the real stream, not on the preview.**
     *
     * `isPlaying` is either of the two, and the tray must not be on the preview: the ten-second
     * sample already carries the paywall card pinned to the bottom of the column, and a second
     * plate in the same place would cover the purchase the sample exists to advertise. A reader who
     * has not got in has something to buy before they have something to give.
     */
    const canGift = stream.isPlaying
    /*
     * The space, for **follow state** — viewer-relative, so not the event payload's seeded copy.
     * Shared with the channel plate's Follow (same query key, one request). `isViewerKnown` because
     * the seed says `is_followed: false` for everybody until the account's own body lands.
     */
    const { channel: space, isViewerKnown } = useChannel(event.channel?.slug ?? '')
    const isFollowed = isViewerKnown && Boolean(space?.is_followed)
    const { isPremium } = useMyChannel()
    const nudge = usePremiumNudge({
        chargedAt: chat.chargedAt,
        feeNoticeShown: fee.notice !== null,
        isPremium,
        // Legacy's right panel is the session's, not the preview's — the same scope as the tray.
        enabled: canGift,
    })
    const catalog = useGiftCatalog({ event, enabled: canGift })
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
            <div className={cn('absolute z-10 flex items-center gap-2', EVENT_STUDIO_CHROME_INSET)}>
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
             * stream stays centred in *what is left* when the 390px chat is open — not centred on
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
                    <div className={cn('absolute z-10', EVENT_STUDIO_CHROME_INSET_END)}>
                        <EventStudioToolbar testId="event-studio-toolbar" />
                    </div>
                    <div
                        className={
                            isPlaying && live.playback
                                ? EVENT_STUDIO_PLAY_AREA
                                : EVENT_STUDIO_COLUMN
                        }
                    >
                        {/*
                         * The channel's art, sharp, behind a **refusal** only — legacy's six gate
                         * screens draw it so a paywall reads as "this, but not for you". Never
                         * behind the seats: legacy's session puts black tiles straight on the
                         * blurred ground, and a sharp copy here showed through every gap between
                         * tiles and either side of the grid.
                         */}
                        {art && !(isPlaying && live.playback) && (
                            <Image
                                src={art}
                                alt=""
                                aria-hidden
                                fill
                                sizes="510px"
                                className="object-cover"
                            />
                        )}
                        {isPlaying && live.playback ? (
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
                                        playback={live.playback}
                                        layout={live.layout}
                                        publishers={live.publishers}
                                        scores={scores}
                                    />
                                </div>
                                {/*
                                 * The paywall rides along with the **preview** only. A reader
                                 * watching the real stream has already got past it, and pinning a
                                 * "purchase access" card to the bottom of their video would be
                                 * asking them to buy what they are already watching.
                                 */}
                                {preview.isPlaying && (
                                    <div className="absolute inset-x-3 bottom-3 z-10 flex justify-center">
                                        <EventWatchPanel event={event} surface="studio" />
                                    </div>
                                )}
                            </>
                        ) : isKickedOut ? (
                            <EventKickedOutPanel />
                        ) : needsSignIn ? (
                            <EventSignInPanel event={event} />
                        ) : showEndedRail ? null : (
                            <EventWatchPanel event={event} surface="studio" />
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
                                {nudge.isOpen && (
                                    <EventPremiumNudge
                                        secondsLeft={nudge.secondsLeft}
                                        onClose={nudge.close}
                                    />
                                )}
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
                        <div className="absolute inset-0 z-10 flex items-center">
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

                    {canGift && (
                        <div className={EVENT_STUDIO_TRAY_BAND}>
                            <EventGiftTray
                                packages={catalog.packages}
                                isLoading={catalog.isLoading}
                                pendingId={gift.pendingId}
                                canSend={gift.canSend}
                                onSend={pkg => gift.send(pkg, recipient)}
                                isCatalogOpen={isCatalogOpen}
                                onOpenCatalog={() => setIsCatalogOpen(true)}
                                onCloseCatalog={() => setIsCatalogOpen(false)}
                                testId="event-gift-tray"
                            />
                            <EventMembershipTile event={event} enabled={canGift} />
                        </div>
                    )}

                    {/*
                     * The catalogue, docked to the **trailing edge of the stage area** — the same
                     * edge the balance plate uses, and for the same reason: inside `<main>` it would
                     * land under the chat, and inside the column it would land 300px short of where
                     * the comps put it. It clears the tray below and the toolbar above.
                     */}
                    {canGift && isCatalogOpen && (
                        <div className="absolute end-3 bottom-[99px] top-16 z-20 flex items-end">
                            <EventGiftPanel
                                packages={catalog.packages}
                                exclusive={catalog.exclusive}
                                publishers={live.publishers}
                                recipient={recipient}
                                onSelectRecipient={setPickedRecipient}
                                pendingId={gift.pendingId}
                                canSend={gift.canSend}
                                onSend={(pkg, to) => gift.send(pkg, to)}
                                onClose={() => setIsCatalogOpen(false)}
                                testId="event-gift-panel"
                            />
                        </div>
                    )}

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
                <EventOutOfStarDialog
                    open={isPlaying && fee.isOutOfStar}
                    fee={fee.charge?.fee ?? null}
                />

                {showChat &&
                    (isChatOpen ? (
                        <EventStudioChat
                            event={event}
                            chat={chat}
                            fee={fee}
                            hasEnded={hasEnded}
                            onCollapse={() => setIsChatOpen(false)}
                        />
                    ) : (
                        /* The folded strip sits at the top of the space the column had, which is
                           where `Right menu/Type=collapse` puts it. */
                        <div className="flex-none p-3">
                            <EventStudioChatStrip
                                event={event}
                                chat={chat}
                                onExpand={() => setIsChatOpen(true)}
                            />
                        </div>
                    ))}
            </div>
        </main>
    )

    return contained ? stage : <StudioPortal>{stage}</StudioPortal>
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
