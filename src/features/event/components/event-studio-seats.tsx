'use client'

import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { SEAT_HALO } from '@shared/lib/motion'
import { cn, formatCount } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { LivePublisher } from '../api/live-types'
import type { SeatArrangement } from '../lib/seat-layout'
import { EVENT_HOST_GRADIENT, EVENT_STUDIO_GIFT_VARS, EVENT_STUDIO_SEAT_VARS } from '../lib/studio'

/**
 * **One person's tile**, and the chrome over it.
 *
 * ```
 * ┌──────────────────────────┐
 * │ ★ 1.2k            [HOST] │  ← gift score (multi-seat only) · host mark
 * │                          │
 * │        the video,        │  ← painted by the SDK into #player-{id}
 * │     or their avatar      │     when the camera is off
 * │                          │
 * │ ( ◍ Ada ✓ )         (🎤) │  ← name plate · mic state
 * └──────────────────────────┘
 * ```
 *
 * ⚠ **The mount node is empty and must stay empty.** Agora and VePlayer both *replace* the
 * contents of the element they are given, so anything rendered inside `#player-{id}` disappears
 * the moment a track starts playing. Every overlay here is a sibling of it, absolutely positioned.
 * Legacy renders the same way, and the `id` is the contract: `useAgoraRoom` plays into
 * `player-${uid}` and nothing connects the two but that string.
 */
function EventStudioSeat({
    publisher,
    area,
    aspect,
    hasVideo,
    showScore,
    score,
    avatarSize,
    onSelect,
    isSelected = false,
    bleed = false,
}: {
    publisher: LivePublisher | null
    area: string
    aspect?: string
    /**
     * Is a video track actually painting into this tile *right now*.
     *
     * Two sources and they disagree on purpose: `publisher.video` is what the **room payload**
     * said when it was fetched, and `useAgoraRoom`'s `videoUids` is what is **live on the wire**.
     * The wire wins — a co-host who turned their camera off a second ago is still `video: true`
     * in a payload nobody has refetched, and trusting it leaves a black rectangle where their
     * avatar belongs.
     */
    hasVideo: boolean
    /** Gift totals are only meaningful when there is somebody to be ranked against. */
    showScore: boolean
    score: number
    /**
     * How big the avatar may be when the camera is off, as an `Avatar` size.
     *
     * Derived from the **tile count**, not from a spotlight flag. It shipped as `xl` (64px) for
     * every tile except the spotlit one, which overflowed its own box from `P5` onwards: at nine
     * tiles a seat is roughly 80px wide, so a 64px disc with its mic ring sat over the name plate
     * and the host mark — visible in one harness screenshot and in no test.
     */
    avatarSize: 'medium' | 'large' | 'xl' | '2xl'
    /** Press the seat to open its publisher's card. Absent, the seat is not interactive. */
    onSelect?: () => void
    /** This seat's card is open — the tile is lit so the card has a visible owner. */
    isSelected?: boolean
    /** The whole screen (one face on a phone): no corner and no hairline to frame it. */
    bleed?: boolean
}) {
    const { t } = useTranslation()

    if (!publisher) {
        /*
         * **An open seat** — an arrangement can have more tiles than the room has people (`P9`
         * with four co-hosts), and the cell is correct; what it must not draw is a name plate for
         * nobody.
         *
         * It used to draw nothing at all, which on the blurred backdrop left a hole in the grid
         * the shape of a missing person. Legacy's `Player` at least paints `#000`.
         *
         * **The gift tray's glass, not an opaque tile.** An occupied seat is solid because a
         * picture fills it; an open one has nothing to show, so it lets the stage's backdrop
         * through — which is what makes it read as *vacant* rather than as a co-host with their
         * camera off. Same fill, blur and hairline as the tray (`--live-gift-tray`), so the stage
         * has one material for everything that is not a person. The hairline is load-bearing: on
         * a dark backdrop it is the only thing marking the seat's edge. In it, an empty chair — a
         * glass disc the size an avatar would be, with `user-plus` in it.
         *
         * **Static on purpose.** Up to eight of these can sit around a live picture, and anything
         * that moves in them competes with the people who are actually on camera.
         */
        return (
            <div
                aria-hidden
                data-testid="event-studio-seat-empty"
                style={
                    {
                        gridArea: area,
                        aspectRatio: aspect,
                        '--live-gift-tray': EVENT_STUDIO_GIFT_VARS['--live-gift-tray'],
                    } as CSSProperties
                }
                className={cn(
                    'relative size-full overflow-hidden rounded-xl [container-type:size]',
                    'bg-(--live-gift-tray) ring-1 ring-inset ring-white/10 backdrop-blur-md',
                )}
            >
                <div className="absolute inset-0 flex items-center justify-center">
                    <span
                        className={cn(
                            'grid aspect-square place-items-center rounded-full',
                            'bg-[linear-gradient(180deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.05)_100%)]',
                            'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(0,0,0,0.25)]',
                            'ring-1 ring-white/10',
                        )}
                        style={{ width: 'min(56px, 36cqmin)' }}
                    >
                        <Icon name="user-plus" size={20} className="text-white/60" />
                    </span>
                </div>
            </div>
        )
    }

    const name = publisher.name ?? ''
    const avatar = publisher.avatar
    const audio = Boolean(publisher.audio)
    /*
     * Legacy's one switch through this whole component is `layout?.layout === 'P1'` — the solo
     * portrait stage, where everything is drawn about twice the size. `2xl` is what `avatarSize`
     * resolves to at one tile, so it is the same question asked in this port's own vocabulary, and
     * it keeps answering correctly for `L1` (also one tile) where the literal string would not.
     */
    const isSolo = avatarSize === '2xl'
    /*
     * **The camera-off avatar's diameter** — ~30% of the seat's width, capped by layout (104 solo,
     * 88 two-up, 64 from three tiles on) and by height. At 42% and 128px it filled a tall seat's
     * middle and dwarfed the name under it; a face at about a third of the width reads as a
     * person in a room rather than a portrait. Height: the column it stands in also holds the
     * rings' bleed above and below (13% a side) and the name plate under them (~36px), so
     * `(100cqh − 36px) / 1.4` keeps the whole cluster inside a short seat. Resolved against the
     * stack, which is the query container.
     */
    const disc = `min(${isSolo ? 104 : avatarSize === 'xl' ? 88 : 64}px, 30cqw, calc((100cqh - 36px) / 1.4))`

    /** The name, on its scrim. Legacy puts the speaker's own avatar in it only over video. */
    const plate = (withAvatar: boolean) => (
        /*
         * `shrink`, not `flex-none`: beside the mic disc on a narrow tile the plate has to give
         * way, and as `flex-none` it pushed the disc out past the seat's edge, where the
         * `overflow-hidden` cut it in half.
         */
        <span
            className={cn(
                'flex min-w-0 max-w-full shrink items-center gap-1 rounded-(--radius-fill) px-2 py-1',
                /*
                 * Over video, dark glass — the frame behind is bright. On the camera-off ground,
                 * light glass with a hairline: `black/50` on a near-black ground was a pill nobody
                 * could see, which is why the name read as bare text.
                 */
                withAvatar
                    ? 'bg-black/50 backdrop-blur-sm'
                    : 'bg-white/12 ring-1 ring-inset ring-white/15 backdrop-blur-md',
            )}
        >
            {withAvatar && (
                /*
                 * Dropped on a narrow foot (`@container` on the row below): over video the face
                 * is already on screen, and at ~110px beside the mic disc the 22px disc left the
                 * name room for one letter.
                 */
                <Avatar
                    size="2xs"
                    type={avatar ? 'image' : 'initials'}
                    className="flex-none @max-[150px]:hidden"
                >
                    {avatar ? (
                        <Image
                            src={avatar}
                            alt=""
                            width={22}
                            height={22}
                            className="size-full rounded-full object-cover"
                        />
                    ) : (
                        <AvatarInitials>{(name || '?').slice(0, 2).toUpperCase()}</AvatarInitials>
                    )}
                </Avatar>
            )}
            <span className="type-caption-label-strong truncate text-white">{name}</span>
            {publisher.verified_tick_badge?.image && (
                <VerifiedBadge image={publisher.verified_tick_badge.image} size="caption" />
            )}
        </span>
    )

    const micTitle = t(audio ? 'event_studio_mic_on' : 'event_studio_mic_off')
    // The sprite (`/dev/icons`) has no slashed microphone; a muted seat shows the muted speaker.
    const micIcon = audio ? 'microphone' : 'volume-off-slash'

    return (
        <div
            data-testid="event-studio-seat"
            data-publisher-id={publisher.id}
            style={{ gridArea: area, aspectRatio: aspect, ...EVENT_STUDIO_SEAT_VARS }}
            className={cn(
                'relative size-full overflow-hidden bg-black',
                bleed ? 'rounded-none' : 'rounded-xl',
            )}
        >
            {/*
             * The SDK's canvas. Nothing of ours inside it.
             *
             * ⚠ **The SDK draws its own unmute prompt and start button, and both have to go.**
             * VePlayer renders `.veplayer-unmute` ("Click to unmute") and `.xgplayer-start` over
             * the picture, and they land on top of ours. Legacy hides exactly these two selectors.
             *
             * ⚠ **`hidden!`, and the `!` is the whole fix.** Tailwind v4 emits utilities inside
             * `@layer utilities`; the vendor sheet (`@byteplus/veplayer/live/style`) is imported
             * **unlayered**, and unlayered CSS beats every layer whatever the specificity — so the
             * SDK's `.veplayer-unmute { display: flex }` won over our `display: none` and the prompt
             * kept printing over the stream. An `!important` declaration in a layer beats a normal
             * unlayered one, which is the only lever that reaches past the layer boundary.
             *
             * `id` rather than a ref because Agora's `videoTrack.play()` takes a DOM id, and the
             * track arrives on a socket frame long after this rendered.
             */}
            <div
                id={`player-${publisher.id}`}
                className={cn(
                    'relative size-full [&_.veplayer-unmute]:hidden! [&_.xgplayer-start]:hidden!',
                    /*
                     * The picture fills the seat on both transports. `!` for the reason above
                     * (the vendor sheet is unlayered), and because Agora sets `object-fit` as an
                     * **inline** style on the `<video>` it creates — only `!important` outranks it.
                     *
                     * `size-full` alone was measured to leave the picture 150px tall in a 244px
                     * seat: the SDK's wrapper sits between, with an automatic height, so the
                     * video's `100%` had nothing to resolve against. So the wrapper (the node's
                     * direct child) is stretched, and the video is pinned to the nearest
                     * positioned box — the wrapper when the SDK positions it, this node otherwise.
                     */
                    '[&>*]:size-full!',
                    '[&_video]:absolute! [&_video]:inset-0! [&_video]:size-full! [&_video]:object-cover!',
                )}
            />

            {/*
             * **The camera-off layer — above the picture, not under it.** It carries its own
             * ground, because on the CDN path the rendition keeps playing a dark or held frame
             * after the camera goes off, and a ground *behind* the mount node is covered by that
             * frame. Fades in over the video rather than replacing it.
             */}
            <div
                aria-hidden={hasVideo}
                className={cn(
                    'absolute inset-0 transition-opacity duration-300 ease-out motion-reduce:transition-none',
                    'pointer-events-none',
                    'bg-[radial-gradient(circle_at_50%_42%,rgba(155,141,188,0.22),transparent_68%),linear-gradient(180deg,#2F2A3B,var(--live-seat-ground))]',
                    hasVideo ? 'opacity-0' : 'opacity-100',
                )}
            >
                {/*
                 * **Camera off: the person's own avatar, blurred, as the ground** — the way a video
                 * call fills a tile whose camera is off, so a grid of muted co-hosts is a grid of
                 * people rather than of identical grey boxes. Dimmed, so the disc in the middle stays
                 * the subject. Static: it is a still image, blurred once.
                 *
                 * `CLAUDE.md`'s no-CDN rule does not reach this — an avatar is the stated exception.
                 */}
                {avatar && (
                    <>
                        <Image
                            src={avatar}
                            alt=""
                            aria-hidden
                            fill
                            sizes="160px"
                            className="scale-125 object-cover opacity-50 blur-2xl"
                        />
                        <div aria-hidden className="absolute inset-0 bg-black/35" />
                    </>
                )}
                {/*
                 * ⚠ **Camera off is a different composition, not the same one with an avatar
                 * added.** This port drew the centred avatar *and* kept the foot row, so a muted
                 * co-host had their name in one corner and their mic in the other with a disc
                 * floating between them. Legacy replaces the whole arrangement: the avatar is
                 * centred, the mic becomes a **badge on it**, and the name sits directly
                 * underneath — one object rather than three.
                 */}
                <div
                    className={cn(
                        'absolute inset-2 flex flex-col items-center justify-center [container-type:size]',
                        /*
                         * Edge to edge on a phone, the bottom of the screen is the chat's — so the
                         * face centres in what is left above it, clear of the top row too.
                         */
                        bleed &&
                            'top-[calc(env(safe-area-inset-top)+56px)] bottom-[calc(min(36vh,320px)+72px)]',
                        /*
                         * Rides the layer's cross-fade with a settle from 90%: the person steps
                         * forward as the picture goes, rather than appearing in place.
                         */
                        'transition-[scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                        hasVideo ? 'scale-90' : 'scale-100',
                    )}
                >
                    {/*
                     * ⚠ **The container is the stack, and the row is content-sized.**
                     *
                     * Legacy's camera-off tile is a *centred* `Stack spacing={1.5}` — the disc and
                     * the name directly under it, 12px apart, the pair in the middle of the seat.
                     * This row was `flex-1` for a while, to give the disc a definite height to be
                     * capped against on a short tile; what that also did was stretch the row to the
                     * full seat, so the name plate landed on the seat's floor instead of under the
                     * face. The cap now reads the *stack's* size (`cqh` minus the plate), which is
                     * definite because the stack is `inset-2`, and the row stays as tall as its disc.
                     */}
                    <div className="relative flex items-center justify-center">
                        {/*
                         * ⚠ **The disc is one box, and everything hangs off it.**
                         *
                         * Two things went wrong when it was not: setting an explicit `width` *and*
                         * `height` with `max-*` caps turns the avatar into an **ellipse** the
                         * moment either cap binds, because an explicit pair overrides
                         * `aspect-square`; and anchoring the mic to the *row* instead of the disc
                         * leaves it floating in the corner of the tile whenever the avatar is
                         * smaller than the space — visible on every four-up and six-up grid.
                         *
                         * So: one square box, sized `min(legacy px, whatever fits)` — the same
                         * fit-inside rule `seatBoxStyle` uses, for the same reason — and the rings
                         * and the badge both measured from it.
                         */}
                        {/*
                         * ⚠ `flex`, not a block: `Avatar` is `inline-flex`, so inside a block it
                         * sits on a line box and the strut's descender added ~4px under it. The
                         * box came out 36×40 instead of square, and every ring sized off it —
                         * `-inset-[5%]` of a taller box — was drawn as an oval, thick at the bottom.
                         */}
                        <div className="relative flex" style={{ width: disc, aspectRatio: '1' }}>
                            {/*
                             * ⚠ **The box is the avatar itself, and the rings bleed outside it.**
                             *
                             * They used to be padding *inside* the box — 8% + 6% a side, kept
                             * even when muted so the disc would not change size. That made the
                             * box 28% wider than the face: muted, the face sat in a transparent
                             * margin, the name looked far below it, and the badge was placed on a
                             * box rather than on the circle you can see. Drawn as absolute rings
                             * around a box that *is* the circle, the face, the badge and the gap
                             * to the name are all measured from what is on screen — and muting
                             * fades the rings out instead of leaving an empty band.
                             *
                             * The bloom (`SEAT_HALO`) sits behind both, so nothing ever covers
                             * the face.
                             */}
                            {audio && (
                                <span
                                    aria-hidden
                                    className={cn(
                                        'pointer-events-none absolute -inset-[24%] rounded-full bg-[rgba(255,104,104,0.2)] blur-md',
                                        SEAT_HALO,
                                    )}
                                />
                            )}
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute -inset-[13%] rounded-full bg-(--live-seat-ring-outer)',
                                    'transition-opacity duration-300 motion-reduce:transition-none',
                                    audio ? 'opacity-100' : 'opacity-0',
                                )}
                            />
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute -inset-[6%] rounded-full bg-(--live-seat-ring-inner)',
                                    'transition-opacity duration-300 motion-reduce:transition-none',
                                    audio ? 'opacity-100' : 'opacity-0',
                                )}
                            />
                            <Avatar
                                size={avatarSize}
                                type={avatar ? 'image' : 'initials'}
                                className="relative size-full border-2 shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition-colors duration-300 motion-reduce:transition-none"
                                /*
                                 * The disc's own ground follows the microphone — legacy sets
                                 * `background: #FF6868`. It shows wherever the image does not
                                 * cover, and on an initials fallback it is the whole disc. Muted,
                                 * a light hairline rather than legacy's 3px of the tile's ground,
                                 * which on a blurred-avatar ground read as the face cut out.
                                 */
                                style={{
                                    background: audio
                                        ? 'var(--live-seat-mic-on)'
                                        : 'var(--live-seat-ground)',
                                    borderColor: audio
                                        ? 'var(--live-seat-mic-on)'
                                        : 'rgba(255, 255, 255, 0.22)',
                                }}
                            >
                                {avatar ? (
                                    <Image
                                        src={avatar}
                                        alt=""
                                        width={160}
                                        height={160}
                                        className="size-full rounded-full object-cover"
                                    />
                                ) : (
                                    <AvatarInitials>
                                        {(name || '?').slice(0, 2).toUpperCase()}
                                    </AvatarInitials>
                                )}
                            </Avatar>

                            {/*
                             * ⚠ **The mic badge sits on the avatar's rim, at its lower trailing
                             * corner.** On a box that is the circle, the rim at 45° is 14.6% in
                             * (1 − cos 45° over 2); 17% puts the badge's centre just inside it, so
                             * it overlaps the face slightly rather than hanging off it.
                             * `insetInlineEnd` so it mirrors in Arabic with the rest of the tile.
                             *
                             * A share of the avatar, clamped (`24%`, 14–30px): fixed sizes were
                             * either most of a small grid seat's face or a quarter of the solo one.
                             */}
                            <span
                                className={cn(
                                    'absolute flex translate-x-1/2 translate-y-1/2 items-center justify-center overflow-hidden rounded-full rtl:-translate-x-1/2',
                                    'ring-2 ring-black/30 shadow-[0_2px_8px_rgba(0,0,0,0.4)]',
                                    'transition-colors duration-300 motion-reduce:transition-none',
                                    audio
                                        ? 'bg-(--live-seat-mic-on)'
                                        : 'bg-[rgba(24,20,32,0.78)] backdrop-blur-sm',
                                    // Legacy's `pulseMic`; the keyframe's own note says why it sits
                                    // on the badge rather than on the glyph inside it.
                                    audio && 'animate-[tevi-mic-pulse_1.5s_ease-out_infinite]',
                                    'motion-reduce:animate-none',
                                )}
                                style={{
                                    bottom: '17%',
                                    insetInlineEnd: '17%',
                                    width: 'clamp(14px, 24%, 30px)',
                                    aspectRatio: '1',
                                }}
                            >
                                {/*
                                 * The sprite's smallest step is 16 (`IconSize`), so the glyph keeps
                                 * it and CSS sizes it to 60% of the badge — legacy's 12-in-20, in
                                 * proportion at every badge size.
                                 */}
                                <Icon
                                    name={micIcon}
                                    size={16}
                                    title={micTitle}
                                    className="size-[60%] text-white"
                                />
                            </span>
                        </div>
                    </div>

                    {/*
                     * Legacy's `maxWidth: 80%` — the name never runs the full width of a seat. Its
                     * distance from the face is the rings' bleed (13% of the disc) plus 8px, so the
                     * name clears an open mic's rings and still sits close under a muted face.
                     */}
                    <span
                        className="flex max-w-[80%] flex-none justify-center"
                        style={{ marginTop: `calc(${disc} * 0.13 + 8px)` }}
                    >
                        {plate(false)}
                    </span>
                </div>
            </div>

            {/* Gift total, leading-top. Only in a room where there is a ranking to be part of. */}
            {showScore && score > 0 && (
                <div className="absolute start-2 top-2 flex items-center gap-1 rounded-(--radius-fill) bg-black/50 px-2 py-0.5 backdrop-blur-sm">
                    <StarMark size={14} />
                    <span className="type-caption-label-strong text-white">
                        {formatCount(score)}
                    </span>
                </div>
            )}

            {/* Edge to edge, the corner badge would sit under the top row — and that row
                already names the host. */}
            {publisher.is_host && !bleed && (
                /*
                 * Gold with a crown, not a grey plate — the comps draw it that way and the
                 * reason is legible: every other badge on this screen is a neutral scrim, so
                 * the one that says *whose room this is* has to be the one that is not.
                 *
                 * Literal gradient stops, same category as the gift row and the rank ramp: this
                 * is a decorative mark over video, not a semantic state the DS has a token for.
                 */
                <div
                    className="absolute end-2 top-2 flex h-4 items-center gap-1 rounded-[4px] ps-0.5 pe-1"
                    /*
                     * ⚠ **Legacy's own plate, and every number in it was wrong here.** It is a
                     * 16px-tall chip with a **4px** radius — not a pill — on a three-stop gradient
                     * at 102.78°, with 2px of lead-in and 4px of tail. This shipped as a fully
                     * rounded pill on a two-stop `#FFB020 → #FF7A00`, which is a different mark at
                     * a glance: rounder, flatter and a shade cooler than the badge the app draws
                     * everywhere else.
                     */
                    style={{ background: EVENT_HOST_GRADIENT }}
                >
                    <Icon name="crown" weight="filled" size={16} className="size-3 text-white" />
                    <span className="type-micro-overline text-white">{t('event_studio_host')}</span>
                </div>
            )}

            {/*
             * ⚠ **Both compositions are always mounted, and they cross-fade.** Swapping them on
             * `hasVideo` popped the seat from one arrangement to the other in a frame; now the
             * camera-off layer fades over the picture (and away from it) in 300ms while this one
             * fades the other way, so a camera turning off reads as the person stepping back
             * rather than as the tile breaking. `aria-hidden` on whichever is out.
             */}
            <div
                aria-hidden={!hasVideo}
                className={cn(
                    'absolute inset-0 transition-opacity duration-300 ease-out motion-reduce:transition-none',
                    hasVideo ? 'opacity-100' : 'opacity-0',
                )}
            >
                {/*
                 * **Camera on** — the chrome rides along the foot of the picture, because the
                 * picture is the content. Legacy's `Grid size={8} / size={4}`: the plate takes what
                 * it needs on the leading side and the mic disc is pinned opposite.
                 */}
                {/*
                 * A scrim along the foot, so the plate and the mic read over a bright frame
                 * without each needing a heavier fill of its own.
                 */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/55 to-transparent"
                />
                <div className="@container absolute inset-x-2 bottom-2 flex items-end justify-between gap-1.5">
                    {plate(true)}
                    {/*
                     * Open: the room's red. Muted: the plate's own glass, so a muted mic is
                     * a quiet mark beside the name rather than a second dark disc. The colour
                     * eases between the two instead of snapping.
                     */}
                    <span
                        className={cn(
                            'flex size-8 flex-none items-center justify-center rounded-(--radius-fill) text-white @max-[150px]:size-7',
                            'transition-colors duration-200 ease-out motion-reduce:transition-none',
                            audio
                                ? 'bg-(--live-seat-mic-on) shadow-[0_2px_8px_rgba(255,104,104,0.45)]'
                                : 'bg-black/50 backdrop-blur-sm',
                        )}
                    >
                        <Icon name={micIcon} size={18} title={micTitle} />
                    </span>
                </div>
            </div>

            {/*
             * The seat's edge — the open seat's hairline, so the grid draws one line around every
             * tile whoever is in it. An overlay and last in the DOM, because an inset ring on the
             * seat itself is painted under its children and the video would cover it.
             */}
            <div
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10',
                    bleed && 'hidden',
                )}
            />

            {/*
             * **The seat, pressable** — a transparent button over the whole tile, last in the DOM so
             * it sits above the picture and the plates. Hover lifts a faint wash; the open card's
             * seat is ringed in violet with a soft glow, so the card has a visible owner.
             */}
            {onSelect && (
                <button
                    type="button"
                    data-testid="event-studio-seat-trigger"
                    data-publisher-id={publisher.id}
                    aria-pressed={isSelected}
                    aria-label={t('event_seat_open', { name: publisher.name ?? '' })}
                    onClick={onSelect}
                    className={cn(
                        'absolute inset-0 cursor-pointer transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none',
                        bleed ? 'rounded-none' : 'rounded-xl',
                        'hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70',
                        isSelected &&
                            'shadow-[inset_0_0_0_2px_#7C4DFF,inset_0_0_24px_rgba(124,77,255,0.35)]',
                    )}
                />
            )}
        </div>
    )
}

/**
 * **The seat grid** — an arrangement from `lib/seat-layout.ts`, filled in publisher order.
 *
 * One component for all eighteen layouts. Legacy has eighteen, differing only in how many boxes
 * there are and how big each one is, which is what let four defects hide in them — the table's own
 * doc lists them.
 *
 * ⚠ **Tiles are filled from `publishers[0]`.** Legacy's `L6`, `L7` and `L9` map
 * `publishers[index + 1]`, so the **host is never drawn** in any of the three, and its `L8` reads
 * `index + 1` in two different sub-grids, so publishers 1 and 2 each appear **twice** while 4
 * through 7 appear not at all. Neither is a design; both are off-by-ones in files nobody reads
 * side by side.
 *
 * `is_preview` blurs the whole grid by 4px, which is legacy's own treatment of the free sample.
 */
export function EventStudioSeats({
    arrangement,
    publishers,
    videoUids,
    scores,
    isPreview = false,
    onSelectPublisher,
    selectedId = null,
    fill = false,
    className,
}: {
    arrangement: SeatArrangement
    publishers: LivePublisher[]
    /**
     * Uids with a live video track, from `useAgoraRoom`. Pass `null` on the CDN path, where there
     * is one publisher and the payload's own `video` flag is all there is to go on.
     */
    videoUids: Set<string> | null
    /** Gift totals by uid, for the multi-guest ranking. Empty until the gift socket lands. */
    scores?: Map<string, number>
    isPreview?: boolean
    /** A seat was pressed — the stage opens that publisher's card. */
    onSelectPublisher?: (publisher: LivePublisher) => void
    /** Whose card is open, so their seat is lit. */
    selectedId?: string | null
    /** The portrait studio: 4px between tiles, and a lone seat drawn edge to edge. */
    fill?: boolean
    /*
     * There is deliberately no `isSpotlit` prop. A spotlit room collapses to one tile, and one
     * tile already resolves to the largest avatar step — a second flag saying the same thing is a
     * second thing that can disagree with the grid it is describing.
     */
    className?: string
}) {
    /*
     * One disc size for the whole grid, off the tile count. A per-tile measurement would be more
     * exact and would need a `ResizeObserver` per seat; the count is what actually determines the
     * box, because the stage is a fixed aspect.
     */
    const tiles = arrangement.areas.length
    const avatarSize = tiles === 1 ? '2xl' : tiles <= 2 ? 'xl' : tiles <= 4 ? 'large' : 'medium'

    return (
        <div
            data-testid="event-studio-seats"
            className={cn(
                'grid size-full',
                fill ? 'gap-1' : 'gap-2',
                // The backend's own word for "this is the sample" — see `livePlaybackSchema`.
                isPreview && 'blur-[4px]',
                className,
            )}
            style={{
                gridTemplateColumns: 'repeat(6, 1fr)',
                gridTemplateRows: `repeat(${arrangement.rows}, 1fr)`,
            }}
        >
            {arrangement.areas.map((area, index) => {
                const publisher = publishers[index] ?? null
                const id = publisher?.id ?? null
                return (
                    <EventStudioSeat
                        /*
                         * ⚠ **Keyed on the person, not on the cell.** The mount node inside a seat
                         * is where the SDK is painting that person's picture, so its identity has
                         * to follow *them*. Keyed on `area`, a layout switch between two shapes
                         * with the same tile count (`P3` ↔ `L2`, `P4` ↔ `L4`) gives every seat a
                         * new area string, React tears every seat down and builds a fresh one —
                         * and the `<div>` the stream was playing in is gone with it, so the
                         * picture stops. Keyed on the publisher, the same person's seat is the
                         * same element in any layout: React moves it and updates its
                         * `gridArea`, and the video playing inside is never detached.
                         *
                         * Open seats have nobody to be keyed on, so they take their position.
                         */
                        key={id !== null ? `seat-${id}` : `open-${index}`}
                        publisher={publisher}
                        area={area}
                        aspect={arrangement.aspect}
                        hasVideo={
                            videoUids === null
                                ? Boolean(publisher?.video)
                                : id !== null && videoUids.has(id)
                        }
                        showScore={publishers.length > 1}
                        score={(id && scores?.get(id)) || 0}
                        avatarSize={avatarSize}
                        onSelect={
                            publisher && onSelectPublisher
                                ? () => onSelectPublisher(publisher)
                                : undefined
                        }
                        isSelected={id !== null && id === selectedId}
                        bleed={fill && tiles === 1}
                    />
                )
            })}
        </div>
    )
}
