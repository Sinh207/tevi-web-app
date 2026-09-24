'use client'

import { StarMark } from '@shared/components/star-mark'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn, formatCount } from '@shared/lib/utils'
import { Avatar, AvatarInitials } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { LivePublisher } from '../api/live-types'
import type { SeatArrangement } from '../lib/seat-layout'
import { EVENT_STUDIO_SEAT_VARS } from '../lib/studio'

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
}) {
    const { t } = useTranslation()

    if (!publisher) {
        // An arrangement can have more tiles than the room has people — `P9` with four co-hosts.
        // An empty cell is correct and must not draw a name plate for nobody.
        return <div style={{ gridArea: area }} aria-hidden />
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

    /** The name, on its scrim. Legacy puts the speaker's own avatar in it only over video. */
    const plate = (withAvatar: boolean) => (
        <span className="flex min-w-0 max-w-full flex-none items-center gap-1 rounded-(--radius-fill) bg-black/50 px-2 py-1 backdrop-blur-sm">
            {withAvatar && (
                <Avatar size="2xs" type={avatar ? 'image' : 'initials'} className="flex-none">
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
                <VerifiedBadge image={publisher.verified_tick_badge.image} size={14} />
            )}
        </span>
    )

    const micTitle = t(audio ? 'event_studio_mic_on' : 'event_studio_mic_off')
    const micIcon = audio ? 'microphone' : 'microphone-slash'

    return (
        <div
            data-testid="event-studio-seat"
            data-publisher-id={publisher.id}
            style={{ gridArea: area, aspectRatio: aspect, ...EVENT_STUDIO_SEAT_VARS }}
            className="relative size-full overflow-hidden rounded-xl bg-black"
        >
            {/*
             * The SDK's canvas. Nothing of ours inside it.
             *
             * ⚠ **The SDK draws its own unmute prompt and start button, and both have to go.**
             * VePlayer renders `.veplayer-unmute` ("Click to unmute") and `.xgplayer-start` over
             * the picture, and they land on top of ours. Legacy hides exactly these two selectors.
             *
             * `id` rather than a ref because Agora's `videoTrack.play()` takes a DOM id, and the
             * track arrives on a socket frame long after this rendered.
             */}
            <div
                id={`player-${publisher.id}`}
                className="size-full [&_.veplayer-unmute]:hidden [&_.xgplayer-start]:hidden"
            />

            {/* Gift total, leading-top. Only in a room where there is a ranking to be part of. */}
            {showScore && score > 0 && (
                <div className="absolute start-2 top-2 flex items-center gap-1 rounded-(--radius-fill) bg-black/50 px-2 py-0.5 backdrop-blur-sm">
                    <StarMark size={14} />
                    <span className="type-caption-label-strong text-white">
                        {formatCount(score)}
                    </span>
                </div>
            )}

            {publisher.is_host && (
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
                    style={{
                        background:
                            'linear-gradient(102.78deg, #FF9900 -4.78%, #FFC700 52.5%, #FF6B00 113.18%)',
                    }}
                >
                    <Icon name="crown" weight="filled" size={16} className="size-3 text-white" />
                    <span className="type-micro-overline text-white">{t('event_studio_host')}</span>
                </div>
            )}

            {hasVideo ? (
                /*
                 * **Camera on** — the chrome rides along the foot of the picture, because the
                 * picture is the content. Legacy's `Grid size={8} / size={4}`: the plate takes what
                 * it needs on the leading side and the mic disc is pinned opposite.
                 */
                <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
                    {plate(true)}
                    <span
                        className="flex size-[34px] flex-none items-center justify-center rounded-(--radius-fill) text-white"
                        style={{
                            background: audio
                                ? 'var(--live-seat-mic-on)'
                                : 'var(--live-seat-mic-off)',
                        }}
                    >
                        <Icon name={micIcon} size={20} title={micTitle} />
                    </span>
                </div>
            ) : (
                /*
                 * ⚠ **Camera off is a different composition, not the same one with an avatar added.**
                 *
                 * This port drew the centred avatar *and* kept the foot row, so a muted co-host had
                 * their name in the corner and their mic in the other corner with a disc floating
                 * between them. Legacy replaces the whole arrangement: the avatar is centred, the
                 * mic becomes a **badge on it**, and the name sits directly underneath. That is what
                 * a real broadcast shows, and it reads as one object rather than three.
                 */
                <div className="absolute inset-2 flex flex-col items-center justify-center gap-3 [container-type:size]">
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
                        <div
                            className="relative"
                            style={{
                                /*
                                 * The stack's height minus what the name plate and the gap below
                                 * the disc take (~28 + 12), so on a short tile the disc gives way
                                 * instead of pushing the plate out of the seat.
                                 */
                                width: `min(${isSolo ? 152 : 87}px, 100cqw, calc(100cqh - 44px))`,
                                aspectRatio: '1',
                            }}
                        >
                            {/*
                             * The halo, and it is two rings rather than one: `7px` of `#FF6868` at
                             * a tenth around `5px` of it at a half, then the disc's own `3px` edge.
                             * Legacy draws all three and the gradation is the whole effect — one
                             * ring reads as a border, three read as sound coming off the avatar.
                             *
                             * Muted keeps the geometry and drops the colour, so the disc does not
                             * change size when somebody mutes.
                             */}
                            <span
                                className="flex size-full rounded-full border-[7px]"
                                style={{
                                    borderColor: audio
                                        ? 'var(--live-seat-ring-outer)'
                                        : 'transparent',
                                    background: audio
                                        ? 'var(--live-seat-ring-outer)'
                                        : 'transparent',
                                }}
                            >
                                <span
                                    className="flex size-full rounded-full border-[5px]"
                                    style={{
                                        borderColor: audio
                                            ? 'var(--live-seat-ring-inner)'
                                            : 'transparent',
                                        background: audio
                                            ? 'var(--live-seat-ring-inner)'
                                            : 'transparent',
                                    }}
                                >
                                    <Avatar
                                        size={avatarSize}
                                        type={avatar ? 'image' : 'initials'}
                                        className="size-full border-[3px]"
                                        /*
                                         * The disc's own ground follows the microphone too, not
                                         * just its edge — legacy sets `background: #FF6868` with
                                         * the matching border. It shows through wherever the
                                         * avatar image does not cover, and on an initials
                                         * fallback it is the whole disc.
                                         */
                                        style={{
                                            background: audio
                                                ? 'var(--live-seat-mic-on)'
                                                : 'var(--live-seat-ground)',
                                            borderColor: audio
                                                ? 'var(--live-seat-mic-on)'
                                                : 'var(--live-seat-ground)',
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
                                </span>
                            </span>

                            {/*
                             * ⚠ **The mic is a badge on the disc, at 18% in from its lower trailing
                             * corner** — legacy's `anchorOrigin` plus a `bottom/right: 18%`
                             * override, which lands it on the avatar's edge rather than outside it.
                             *
                             * `insetInlineEnd` rather than `right`: it has to mirror in Arabic with
                             * the rest of the tile, and a physical property would leave it on the
                             * wrong side of a face.
                             */}
                            <span
                                className={cn(
                                    'absolute flex translate-x-1/2 translate-y-1/2 items-center justify-center overflow-hidden rounded-full border-[3px] rtl:-translate-x-1/2',
                                    // Legacy's `pulseMic`; the keyframe's own note says why it sits
                                    // on the badge rather than on the glyph inside it.
                                    audio && 'animate-[tevi-mic-pulse_1.5s_ease-out_infinite]',
                                    'motion-reduce:animate-none',
                                )}
                                style={{
                                    bottom: '18%',
                                    insetInlineEnd: '18%',
                                    borderColor: audio ? '#FFFFFF' : 'var(--live-seat-ground)',
                                    background: audio
                                        ? 'var(--live-seat-mic-on)'
                                        : 'var(--live-seat-mic-off)',
                                    width: isSolo ? 40 : 20,
                                    height: isSolo ? 40 : 20,
                                }}
                            >
                                {/*
                                 * ⚠ Legacy's small badge carries a **12px** glyph and the DS
                                 * sprite's smallest step is 16 — `IconSize` is
                                 * `16 | 18 | 20 | 22 | 24 | 32`, and a size off that scale is a
                                 * type error rather than a blurry icon. So the 16 is scaled to
                                 * legacy's 12 instead of a step being invented, and the badge
                                 * clips: a 20px disc with a 3px collar has a 14px hole and the
                                 * glyph's layout box stays 16 whatever it draws at.
                                 */}
                                <Icon
                                    name={micIcon}
                                    size={isSolo ? 24 : 16}
                                    title={micTitle}
                                    className={cn('text-white', !isSolo && 'scale-75')}
                                />
                            </span>
                        </div>
                    </div>

                    {/* Legacy's `maxWidth: 80%` — the name never runs the full width of a seat. */}
                    <span className="flex max-w-[80%] flex-none justify-center">
                        {plate(false)}
                    </span>
                </div>
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
                'grid size-full gap-2',
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
                        // The area is unique per arrangement and stable across a publisher
                        // joining or leaving, which is what keeps a tile's mount node — and the
                        // track painting into it — from being torn down by a reorder.
                        key={area}
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
                    />
                )
            })}
        </div>
    )
}
