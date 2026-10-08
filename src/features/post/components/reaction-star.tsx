'use client'

import { LottieAnimation } from '@shared/components/lottie-animation'
import { useMayAnimate } from '@shared/hooks/use-may-animate'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'

/** The reaction burst — legacy's `icon_star_reactions.json`, committed under `public/`. */
export const REACTION_ART = '/lotties/icon-star-reactions.json'

/** The frame the burst ends on, which is the reacted state in legacy's file. */
export const REACTED_FRAME = 60

/**
 * The file's two **star** layers — left out, so only the burst plays.
 *
 * Both carry colours the theme cannot reach: `Unselect.png` is a raster outline star in `#1B1B1B`,
 * and `Select` fills to legacy's `#EEAD49`. In dark mode the first was a black star on a black page
 * — the control simply was not there. The star is drawn from the DS sprite instead (below), and the
 * file keeps the part a glyph cannot do: the `#Joy` particles.
 */
const STAR_LAYERS = ['Unselect.png', 'Select'] as const

/**
 * The reaction control's face: **the sprite's star, with legacy's burst over it.**
 *
 * - At rest it is `<Icon name="star">` — the outline (`star--regular`, the bare id) in
 *   `--icon-secondary` when the reader has not reacted, **the same ink as every other glyph in the
 *   action row** (comment, send, bookmark, share), and the filled weight in
 *   `--accents-warning-active` when they have. Both are glyphs from `/dev/icons`, so both follow the
 *   theme; the file's own stills did not.
 * - A press that **reacts** mounts one burst on top (`burstKey` changes), played once from 0 to
 *   `REACTED_FRAME` and unmounted on completion. Taking a reaction back plays nothing — legacy's
 *   reverse segment was the star shrinking back, and the sprite's star simply changes weight.
 * - Reduced motion (`useMayAnimate`) skips the burst; the state still changes.
 *
 * The box is **32**, the same as every other control in the row. The burst keeps the file's
 * proportions — its star sat at 512px in an 800px canvas, ~60% — so it is laid out at 40px around
 * the post's 24px glyph and overflows the button rather than shrinking with it.
 */
export function ReactionStar({
    reacted,
    burstKey,
    onBurstEnd,
    size,
}: {
    reacted: boolean
    /** Changes once per reacting press; `0` means no burst. */
    burstKey: number
    onBurstEnd: () => void
    size: 'post' | 'reply'
}) {
    const mayAnimate = useMayAnimate()
    // The post row's controls are all 32 with a 24 glyph (`ActionButton`); the reply row's are 32
    // with a 20 one.
    const glyph = size === 'post' ? 24 : 20

    return (
        <span className="relative grid size-8 flex-none place-items-center">
            {reacted ? (
                <Icon
                    name="star"
                    weight="filled"
                    size={glyph}
                    className="text-(--accents-warning-active)"
                />
            ) : (
                <Icon name="star" size={glyph} className="text-(--icon-secondary)" />
            )}
            {burstKey > 0 && mayAnimate ? (
                <LottieAnimation
                    key={burstKey}
                    src={REACTION_ART}
                    once={[0, REACTED_FRAME]}
                    hideLayers={STAR_LAYERS}
                    onComplete={onBurstEnd}
                    /*
                     * The burst is drawn in its file's own proportions around the star — 40px for
                     * the post's 24px glyph, as legacy sized it — so it overflows the 32px button by
                     * 4 a side rather than shrinking. The reply's 20px glyph gets the 32px box.
                     */
                    className={cn(
                        'pointer-events-none absolute',
                        size === 'post' ? '-inset-1' : 'inset-0',
                    )}
                />
            ) : null}
        </span>
    )
}
