import type { CSSProperties } from 'react'

/**
 * The app's two entrance animations, and the one rule behind both.
 *
 * **Figma carries no motion layer**, so every animation in this app is an addition rather
 * than a port. What keeps them from being invented one screen at a time is that they all
 * reuse the two values the app already moves by — 240ms on `cubic-bezier(0.32, 0.72, 0, 1)`,
 * the menu drawer's screen push (`features/navigation`). One curve for "something arrived",
 * whether it slid, rose or popped.
 *
 * This lives in `shared/` because more than one feature needs it and `features/*` may not
 * import each other's internals (`CLAUDE.md`). `features/identification/lib/motion.ts` is
 * now a re-export of this file.
 */

/**
 * The entrance a region gets when it has just arrived — `tevi-rise` in `globals.css`: 8px
 * up, fading in.
 *
 * `both` keeps the `from` frame while the animation is delayed, which is the whole point of
 * the stagger: without a fill mode a delayed sibling paints at full opacity first, then jumps
 * back to invisible to start — a flash on every load.
 *
 * `motion-reduce:animate-none` means the element simply appears. That is the correct reduced
 * -motion outcome for an entrance: there is nothing being revealed, so nothing is lost.
 */
export const RISE =
    'animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none'

/**
 * The entrance for something that becomes **true** rather than something that arrives — a
 * requirement ticking green, a success mark landing. `tevi-pop` in `globals.css`: from 60%
 * scale, fading in.
 *
 * Kept apart from `RISE` on purpose. A rise says "here is content"; a pop says "that just
 * happened", and using the travelling entrance for a checkmark inside a settled form makes
 * the form look like it is re-laying-out every keystroke.
 *
 * It scales, so it must only ever be put on an element whose *box* does not move — the
 * caller reserves the space (a fixed-size slot) and the glyph pops inside it.
 */
export const POP =
    'animate-[tevi-pop_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none'

/**
 * Stagger for a sibling, in the DS's own increment.
 *
 * 60ms, not the skeleton's 160: a skeleton's stagger is the *point* (it reads as a pulse
 * travelling down the list), while this one only has to keep the regions from arriving as one
 * slab. Four regions at 60ms are all in within 420ms of the first paint — under the threshold
 * where a screen starts to feel like it is assembling itself in front of you.
 */
export function riseDelay(index: number): CSSProperties | undefined {
    return index > 0 ? { animationDelay: `${index * 60}ms` } : undefined
}

/**
 * The heartbeat on a live indicator — `tevi-live-breath` in `globals.css`.
 *
 * Kept apart from `RISE` and `POP` because it is a different *kind* of thing: those fire once
 * because something arrived, this runs while something is true. It is also the one animation that
 * does not reuse the 240ms curve, and the note on the keyframe says why — a breath at 240 is a
 * strobe.
 *
 * Only ever put it on a surface small enough to ignore. It loops forever, so anything it is attached
 * to is competing with the content for the reader's attention for as long as the page is open.
 */
export const LIVE_BREATH =
    'animate-[tevi-live-breath_1600ms_ease-in-out_infinite] motion-reduce:animate-none'

/**
 * The Star amount drifting off the balance when it moves — `tevi-star-float` in `globals.css`.
 *
 * The third animation to sit outside the 240ms "something arrived" curve, and the only one about
 * something **leaving**: it decelerates on `ease-out` as it fades, where `RISE` and `POP` accelerate
 * into place. 2000ms is legacy's *effective* duration — its stated 4s is truncated at 2s by the state
 * that mounts it, so half of it has never played.
 *
 * `forwards`, so the element rests invisible at the end rather than snapping back to full opacity for
 * the frame before it unmounts. Whoever renders it is responsible for giving it a `key` that changes
 * per movement — without one, a second spend inside the two seconds re-renders the same node and CSS
 * does not restart an animation that is already running. Legacy has exactly that bug.
 *
 * ## Reduced motion collapses the duration; it does not remove the animation
 *
 * `motion-reduce:animate-none` — what `RISE`, `POP` and `LIVE_BREATH` all use — is **wrong here**, and
 * wrong in a way that only shows up with the setting on. Those three are entrances or a loop: with no
 * animation the element simply appears, which is the outcome you want. This one is an **exit**, and its
 * consumer removes itself on `animationend`. With no animation there is no `animationend`, so the
 * flash never leaves: `-120 ★` sits over the balance for the rest of the session.
 *
 * 1ms instead. Nothing perceptible moves — which is what the setting asks for — and the animation still
 * *ends*, so the element still goes and the announcement is still made once. The alternative, not
 * rendering at all under reduced motion, would take the screen-reader announcement with it, and a
 * reader who prefers reduced motion is exactly the reader most likely to be relying on it.
 */
export const STAR_FLOAT =
    'animate-[tevi-star-float_2000ms_ease-out_forwards] motion-reduce:animate-[tevi-star-float_1ms_linear_forwards]'
