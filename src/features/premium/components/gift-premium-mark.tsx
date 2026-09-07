'use client'

import { AnimatedAvatar, type AnimatedAvatarProps } from '@shared/components/animated-avatar'
import { PREMIUM_RIM, PREMIUM_SPIN, PREMIUM_ZOOM } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import { PREMIUM_ART } from '../lib/illustrations'
import {
    PREMIUM_GOLD,
    PREMIUM_MARK_SLICES,
    PREMIUM_MARK_THICKNESS,
    premiumSpinPhase,
} from '../lib/premium-surface'

/**
 * The recipient's face in a gold ring, **turning like a coin, with the burst coming off it** — the
 * same object `/premium` puts at the top of its band, with the person on the front.
 *
 * ## The construction is `PremiumMark`'s, and its long note is the reference
 *
 * Everything structural is that component's and is not re-argued here: `preserve-3d` on a wrapper
 * that carries **no transform of its own** (a rotating ancestor goes singular at 90° and Chrome
 * culls every descendant — the mark used to blink twice a turn); each surface running the turn
 * itself, phase-shifted by a negative `animation-delay`; the thickness as **slices parallel to the
 * face** rather than one perpendicular quad, because parallel planes cannot intersect the face and
 * poke through it; a rim quad that is broadside at exactly the two angles the slices vanish at; and
 * the `PREMIUM_ZOOM` flourish on the outer element, landing on the edge-on moment.
 *
 * What differs is the art on the two faces and the shape of the metal — a circle, so the slices are
 * `rounded-full` instead of masked to a silhouette.
 *
 * ## ⚠ The back is the **Premium mark**, not a mirrored face
 *
 * A coin needs a second face — without it the rearmost slice is nearest for half the cycle and the
 * object spends three seconds as a plain gold disc. The obvious choice is the avatar again, and it
 * is the wrong one: a mirrored photograph of a person is uncanny in a way a mirrored badge is not,
 * and it says nothing.
 *
 * The Premium badge says exactly what the screen is for. **A coin with the recipient on one side and
 * Tevi Premium on the other is the gift itself**, and it turns to show you both halves. It also
 * costs no new asset: `PREMIUM_ART.logo` is already committed and already on this page's other
 * screen.
 *
 * (Flagged rather than assumed: the back face is a design decision the brief did not settle, and it
 * is one line to change.)
 *
 * ## The size is the DS's, not the badge's
 *
 * `/premium`'s mark is 100px of artwork. This is an avatar, and `AvatarSize` stops at `2xl` (80) —
 * the DS has no larger box and `CLAUDE.md` makes it the source of truth for anything it covers. So
 * the coin is the 80px face plus the ring's own 4px either side, and the thickness stays
 * {@link PREMIUM_MARK_THICKNESS} so the two screens' objects read as the same metal.
 *
 * `aria-hidden` on the whole scene: the sentence underneath names this person in the reader's own
 * language, so describing the coin would announce them twice, and its thickness is not news.
 */

/** The avatar's own box — `AvatarSize`'s `2xl`. */
const FACE = 80
/** The gold ring either side of it, which is what makes the coin's face 88px across. */
const RING = 4
const SIZE = FACE + RING * 2
const HALF = PREMIUM_MARK_THICKNESS / 2

/**
 * Where each slice of metal sits, in px, from just behind the front face to just in front of the
 * back one — the thickness shared out, with no slice at either face's own depth.
 *
 * Computed at module scope and doubling as each slice's **key**: the depth *is* the slice's
 * identity, where an array index is only its position in a list that never reorders.
 */
const SLICE_DEPTHS = Array.from({ length: PREMIUM_MARK_SLICES }, (_, i) => {
    const step = PREMIUM_MARK_THICKNESS / (PREMIUM_MARK_SLICES + 1)
    return HALF - (i + 1) * step
})

export function GiftPremiumMark({
    avatar,
    initials,
}: {
    /**
     * The recipient's avatar sources, when there are any. Absent on the success screen — no image
     * URL travels in `?gift_token=` (see `lib/gift-token.ts`), so the ring holds initials there.
     */
    avatar?: Pick<AnimatedAvatarProps, 'thumb' | 'avatarVideo' | 'isPremium'>
    initials: string
}) {
    return (
        <span
            aria-hidden
            /*
             * The zoom's own element. It has no size of its own — the inner span carries that — so
             * scaling it cannot move anything around it, and the coin grows about its own centre.
             */
            className={PREMIUM_ZOOM}
        >
            <span
                /*
                 * The shared 3D context, and **nothing else**: no animation and no transform, so its
                 * matrix is the identity and can never be singular. See the note above.
                 */
                className="relative block [transform-style:preserve-3d]"
                style={{ width: SIZE, height: SIZE }}
            >
                {/* The front: the person, inside the gold ring the rest of the screen wears. */}
                <span
                    className={cn(
                        'absolute inset-0 flex rounded-full p-1 [backface-visibility:hidden]',
                        PREMIUM_GOLD,
                        PREMIUM_SPIN,
                    )}
                    style={{ transform: `translateZ(${HALF}px)` }}
                >
                    <AnimatedAvatar
                        size="2xl"
                        thumb={avatar?.thumb ?? null}
                        avatarVideo={avatar?.avatarVideo ?? null}
                        isPremium={avatar?.isPremium ?? false}
                        /* Decorative — the sentence below names this person. */
                        alt=""
                        initials={initials}
                        /* The one avatar above the fold on this screen. */
                        priority
                    />
                </span>

                {/*
                 * The back: the Premium mark, half a turn behind. `rotate` carries the animation and
                 * `transform` the depth — separate properties, and the spec applies `rotate` first,
                 * so the translation happens in the turned frame exactly as
                 * `rotateY(180deg) translateZ(…)` would.
                 */}
                <span
                    className={cn(
                        'absolute inset-0 flex items-center justify-center rounded-full p-1 [backface-visibility:hidden]',
                        PREMIUM_GOLD,
                        PREMIUM_SPIN,
                    )}
                    style={{
                        animationDelay: premiumSpinPhase(180),
                        transform: `translateZ(${HALF}px)`,
                    }}
                >
                    <span className="flex size-full items-center justify-center rounded-full bg-(--primary-500)">
                        <Image
                            src={PREMIUM_ART.logo.src}
                            alt=""
                            width={PREMIUM_ART.logo.width}
                            height={PREMIUM_ART.logo.height}
                            /* Inset so the badge sits inside the disc rather than against its rim. */
                            className="size-[60%] object-contain"
                        />
                    </span>
                </span>

                {/* The metal between them — circles, where the badge's are cut to its silhouette. */}
                {SLICE_DEPTHS.map(z => (
                    <span
                        key={z}
                        className={cn('absolute inset-0 rounded-full', PREMIUM_GOLD, PREMIUM_SPIN)}
                        style={{ transform: `translateZ(${z}px)` }}
                    />
                ))}

                {/*
                 * The edge, and it exists for two frames a turn: every surface above is parallel to
                 * the face, so they all go singular together at 90° and 270° where Chrome culls them.
                 * This quad turns a quarter of a turn ahead, so it is broadside at exactly those
                 * angles and carries the coin through them — and `tevi-premium-rim` gates its opacity
                 * to that window, because a perpendicular quad crosses the face's plane and outside
                 * 79°-101° the near half shows as a gold seam down the middle.
                 */}
                <span
                    className={cn(
                        'absolute inset-y-1 start-1/2 rounded-full opacity-0',
                        PREMIUM_GOLD,
                        PREMIUM_RIM,
                    )}
                    style={{
                        width: PREMIUM_MARK_THICKNESS,
                        marginInlineStart: -PREMIUM_MARK_THICKNESS / 2,
                    }}
                />
            </span>
        </span>
    )
}
