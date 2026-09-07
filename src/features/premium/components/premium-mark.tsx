'use client'

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

const { width: SIZE, height: BOX } = PREMIUM_ART.logo
const HALF = PREMIUM_MARK_THICKNESS / 2
/**
 * Where each slice of metal sits, in px, from just behind the front face to just in front of the
 * back one — the thickness shared out, with no slice at either face's own depth.
 *
 * Computed once at module scope rather than in the render, and it doubles as each slice's **key**:
 * the depth *is* the slice's identity, where an array index is only its position in a list that
 * never reorders. Same list, one fewer thing to be wrong about.
 */
const SLICE_DEPTHS = Array.from({ length: PREMIUM_MARK_SLICES }, (_, i) => {
    const step = PREMIUM_MARK_THICKNESS / (PREMIUM_MARK_SLICES + 1)
    return HALF - (i + 1) * step
})

/**
 * The artwork's own alpha channel, as a mask — how each slice of the thickness gets its shape.
 *
 * The slices were cut with a `clip-path` hexagon first, and its corners were **sharp** where the
 * badge's are rounded, so the gold showed as six little spurs past the artwork's outline. There is
 * no rounding a polygon in `clip-path`, and hand-fitting a `path()` to somebody else's illustration
 * is a shape that goes stale the next time Brand exports it.
 *
 * Masking with the artwork itself is exact by construction: the WebP is transparent outside the
 * badge, so the mask *is* the silhouette, corner radii and all, and it stays right if the drawing
 * changes. It costs one extra request for the raw file (16 KB, and the eight slices share it) —
 * `next/image` serves the face from its own optimised URL, which a mask cannot reference.
 */
const SILHOUETTE_MASK = {
    maskImage: `url(${PREMIUM_ART.logo.src})`,
    maskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskImage: `url(${PREMIUM_ART.logo.src})`,
    WebkitMaskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
} as const

/**
 * The Premium mark, turning like a coin — **and it is a solid**.
 *
 * ## Why it is a 3D scene and not a rotated image
 *
 * A flat `<img>` rotated about the vertical axis projects to `d·|cos θ|`, which is **zero** at 90°
 * and 270°: the badge vanished for a few frames twice per turn. The reference screenshot catches the
 * native badge at that exact moment and it is not gone — it is a gold sliver, because a medallion
 * has thickness. So this is a real object under `transform-style: preserve-3d`: two faces and the
 * metal between them.
 *
 * **No `perspective`.** The projection is orthographic, which is what the reference shows: a uniform
 * bar at the halfway point rather than a near edge growing towards the reader. A perspective
 * ancestor would also make the mark's apparent size depend on where it sits in the viewport.
 *
 * ## ⚠ The thickness is **slices parallel to the face**, and the obvious construction fails
 *
 * The first two attempts built the rim as one quad turned a quarter of the way round, perpendicular
 * to the face. Both were wrong, and the second failure is the instructive one:
 *
 * 1. With the quad at `z = 0` it **intersects** the face and Chrome drew it straight down the middle
 *    of the artwork — a gold seam across the badge at every angle but face-on.
 * 2. Pushing the face to `z = t/2` fixed the seam at 45° and left a **hairline** at 70°, which is
 *    the geometry telling the truth: a perpendicular quad crosses the face's plane whatever the
 *    offset, and the half of it nearer the reader is genuinely in front. Chrome splits intersecting
 *    planes per pixel, so it drew exactly that.
 *
 * Planes that are **parallel** never intersect, so there is nothing to sort and nothing can poke
 * through. Eight gold slices cut to the mark's own silhouette, spread through the thickness, give a
 * solid whose edge-on projection is a bar `t` wide (each slice projects to a line, one pixel apart)
 * and whose 45° projection is a gold crescent down one side — which is what a coin at 45° looks
 * like. It is the standard way to extrude in CSS, and here it is also the only one that behaves.
 *
 * ## Two faces, because half the turn shows the back
 *
 * The artwork appears twice: once at `z = +t/2` and once mirrored at `z = -t/2`, each with
 * `backface-visibility: hidden` so it is drawn only from its own side. Without the second copy the
 * rearmost slice would be nearest for half the cycle and the badge would spend three seconds as a
 * plain gold hexagon.
 *
 * ## Once every two turns it leans in
 *
 * `PREMIUM_ZOOM` on the **outer** wrapper, 12000ms — exactly two turns — with its peak at 87.5% of
 * that cycle, which is where the spin has reached 270° and the badge is edge-on. So the flourish
 * lands on the moment the mark is a gold sliver and is gone before the face is back. The ratio is
 * the mechanism and the keyframe says so; the zoom is a separate element because it scales, and the
 * element that turns must keep its own box.
 *
 * ## The sparkles are not here
 *
 * They were: six gold stars on this badge's rim, flying outward. The reference has a wide field
 * instead, so that moved to `PremiumSparkField`, a sibling of this component in the band rather than
 * a child of it — the field spans the band's full width and a 100px box cannot hold it.
 *
 * `alt=""` plus `aria-hidden` on the whole scene: the bar above and the heading below both say "Tevi
 * Premium" in the reader's own language, so describing the badge would announce the title a third
 * time, and its thickness is not a thing anybody needs told about.
 *
 * ## ⚠ **Nothing here rotates an ancestor**, and that is what stopped the blink
 *
 * The turn used to be one animation on the wrapper, with the surfaces riding along inside it. That
 * made the mark **blink twice per turn**: `rotateY(90deg)` is a singular matrix, Chrome culls an
 * element whose accumulated transform is singular, and every surface inherited the wrapper's. It was
 * first measured as one unreachable frame at exactly 270.000° — wrong, and the way it was wrong is
 * worth keeping: the cull has a *range*, so it is visible at speed, and no fix applied to a
 * descendant reaches around it. Slices whose boxes measured 65px wide still painted nothing.
 *
 * So the wrapper holds `preserve-3d` and **no transform at all** — its matrix is the identity and
 * can never be singular — and each surface runs the turn itself, phase-shifted by a negative
 * `animation-delay`. The back face is half a turn behind the front; the slices are a degree or so
 * apart. At any angle at most one or two surfaces are near their own singularity and the rest are
 * painting, so there is nothing left to see go missing. The shared 3D context is still the wrapper's,
 * which is what keeps the faces sorted in front of the metal.
 *
 * Reduced motion leaves the scene unrotated: the front face is square-on and every slice is exactly
 * behind it, so what remains is the badge as it always was.
 */
export function PremiumMark() {
    return (
        <span
            aria-hidden
            /*
             * The zoom's own element. It has no size of its own — the inner span carries that — so
             * scaling it cannot move anything around it, and the badge grows about its own centre.
             */
            className={PREMIUM_ZOOM}
        >
            <span
                /*
                 * The box is the mark's drawn size and the rotation is a transform, so the turn cannot
                 * move the layout — a transformed element still occupies its untransformed box.
                 *
                 * **No animation and no transform on this element**, only `preserve-3d`: it is the
                 * shared 3D context the surfaces are sorted in, and the moment it carries the
                 * rotation itself its matrix goes singular twice a turn and takes the whole mark with
                 * it. See the note above.
                 */
                className="relative block [transform-style:preserve-3d]"
                style={{ width: SIZE, height: BOX }}
            >
                {/*
                 * `priority`: it is the first thing on the page and the only image above the fold. Left
                 * to lazy-load it pops in after the copy has already been read. Only the front face
                 * carries it — the back is the same bytes from the browser's cache.
                 */}
                <Image
                    src={PREMIUM_ART.logo.src}
                    alt=""
                    width={SIZE}
                    height={BOX}
                    priority
                    className={cn('absolute inset-0 [backface-visibility:hidden]', PREMIUM_SPIN)}
                    style={{ transform: `translateZ(${HALF}px)` }}
                />
                <Image
                    src={PREMIUM_ART.logo.src}
                    alt=""
                    width={SIZE}
                    height={BOX}
                    className={cn('absolute inset-0 [backface-visibility:hidden]', PREMIUM_SPIN)}
                    /*
                     * Half a turn behind the front, so the two faces are back to back. The `rotate`
                     * property carries the animation and `transform` the depth — they are separate
                     * properties, and the spec applies `rotate` first, so the translation happens in
                     * the turned frame exactly as `rotateY(180deg) translateZ(…)` would.
                     */
                    style={{
                        animationDelay: premiumSpinPhase(180),
                        transform: `translateZ(${HALF}px)`,
                    }}
                />

                {SLICE_DEPTHS.map(z => (
                    <span
                        key={z}
                        className={cn('absolute inset-0', PREMIUM_GOLD, PREMIUM_SPIN)}
                        style={{ transform: `translateZ(${z}px)`, ...SILHOUETTE_MASK }}
                    />
                ))}

                {/*
                 * The edge, and it exists for two frames a turn.
                 *
                 * Every surface above is parallel to the face, which is what keeps them from ever
                 * poking through it — and it is also why they all go singular together at 90° and
                 * 270°, where Chrome culls them and the mark blinked. This quad turns a quarter of a
                 * turn ahead of them, so it is **broadside** at exactly those two angles and carries
                 * the mark through them. `tevi-premium-rim` also gates its opacity to that window,
                 * because a perpendicular quad crosses the face's plane and the half nearer the
                 * reader is genuinely in front of it: outside 79°-101° that shows as a gold seam down
                 * the artwork, which is the defect this construction started with.
                 *
                 * `inset-y-0` and the full silhouette mask would both be wrong here — the quad is
                 * seen end-on, so what it needs is the badge's *height*, not its outline.
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
