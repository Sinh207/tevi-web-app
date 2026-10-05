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

/**
 * The dashboard's trend line drawing itself in — `tevi-chart-draw` in `globals.css`, which explains
 * the `pathLength` normalisation and why the dashed comparison line cannot use it.
 *
 * Here rather than in `features/analytics` for the reason `STAR_FLOAT` is here: this file is the one
 * list of what moves in this app, and a keyframe with no entry in it is a keyframe the next person
 * re-invents. The 240ms and the curve are the app's, so the plot arrives like everything else.
 */
export const CHART_DRAW =
    'animate-[tevi-chart-draw_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none'

/**
 * The comparison line appearing behind it — `tevi-chart-fade`, delayed until the current line has
 * finished drawing so the two do not compete for the eye.
 *
 * A fade rather than a draw because the dashed line's `stroke-dasharray` **is** its identity, and
 * `tevi-chart-draw` needs that property for itself. `RISE` is not an option either: it translates,
 * and a path pulled 8px off its own axis is a chart that lies for 240ms.
 */
export const CHART_FADE_IN =
    'animate-[tevi-chart-fade_200ms_cubic-bezier(0.32,0.72,0,1)_240ms_both] motion-reduce:animate-none'

/**
 * The glare crossing the recommended plan card — `tevi-premium-sheen` in `globals.css`, which
 * explains why the streak's box is the whole card (it is what keeps the sweep working in RTL) and
 * why three quarters of the cycle is a pause.
 *
 * The fourth animation outside the 240ms curve, and the only one that is purely ornamental: the
 * other three each mark something (an arrival, a departure, a live stream). This one exists because
 * the annual card has to be *picked*, and it carries no information at all — which is also why it
 * is the one loop allowed on a surface a reader is reading.
 *
 * `4500ms` and `infinite` belong here rather than at the call site so a second premium surface
 * cannot get a differently-timed sheen. Whoever adds one puts a base `opacity-0` on the element:
 * see the keyframe's last paragraph.
 */
export const PREMIUM_SHEEN =
    'animate-[tevi-premium-sheen_4500ms_linear_infinite] motion-reduce:animate-none'

/**
 * The Premium mark turning like a coin — `tevi-premium-spin` in `globals.css`, which is where the
 * axis is argued: `rotate: y`, because the mobile app turns it that way and because a flat 360
 * passes through an upside-down crown.
 *
 * **6 seconds**, halved from the 12 the flat spin used. A flat spin is legible the whole way round,
 * so it could afford to be slow; a coin turn spends a third of its cycle nearly edge-on, and at 12s
 * that is four seconds of a badge that looks like a gold sliver. Six keeps the face-on view the
 * thing you mostly see. Linear, because an eased rotation reads as something being turned by hand.
 *
 * The badge is a flat image, so it has no thickness to show at the halfway point: the painted width
 * is `100·cos θ` and reaches **zero** at 90° and 270°. The reference screenshot catches the native
 * badge as a narrow sliver there, which a 3D object has and a `<img>` cannot — a couple of frames of
 * nothing, twice per turn, is the honest cost and it reads as edge-on rather than as a glitch.
 */
export const PREMIUM_SPIN =
    'animate-[tevi-premium-spin_6000ms_linear_infinite] motion-reduce:animate-none'

/**
 * One sparkle thrown out of the Premium mark — `tevi-premium-spark` in `globals.css`.
 *
 * The angle, the distance and the **duration** are all the caller's: the keyframe ends at
 * `var(--spark-x) / var(--spark-y)`, and `PremiumSparkField` sets `animationDelay` *and*
 * `animationDuration` per particle. The 2600ms here is only the fallback for a caller that does not
 * — a field where every particle travels for the same time reads as a pulse rather than a spray, so
 * the one caller there is overrides it with a 1.5–3.6s spread.
 *
 * That is deliberate rather than sloppy: what belongs in this file is the keyframe's name, its
 * easing, that it loops, and what reduced motion does with it. The travel is geometry, and geometry
 * belongs next to the numbers it was chosen against.
 *
 * Pair it with a base `opacity-0` — see the keyframe.
 */
export const PREMIUM_SPARK =
    'animate-[tevi-premium-spark_2600ms_ease-out_infinite] motion-reduce:animate-none'

/**
 * The mark leaning in once every two turns — `tevi-premium-zoom` in `globals.css`.
 *
 * **12000ms, and it must stay exactly twice `PREMIUM_SPIN`'s 6000.** The keyframe's peak is placed
 * at 87.5% of the cycle because that is where the spin has reached 270° and the badge is edge-on;
 * the two animations start in the same frame and never end, so the ratio is what keeps the pulse on
 * that edge. Retiming either one without the other aims the zoom at nothing in particular — and it
 * fails silently, because a badge that pulses mid-face still looks like an effect.
 *
 * It goes on a **wrapper**, not on the element that turns: it scales, so its box must not move, and
 * the two properties cannot share one Tailwind arbitrary animation list legibly.
 */
export const PREMIUM_ZOOM =
    'animate-[tevi-premium-zoom_12000ms_ease-in-out_infinite] motion-reduce:animate-none'

/**
 * The Premium mark's edge — `tevi-premium-rim` in `globals.css`, which is where the whole argument
 * lives: it turns a quarter of a turn ahead of every other surface, so it is broadside at the two
 * angles where the rest of the mark is edge-on and would otherwise be culled.
 *
 * **6000ms, the same as `PREMIUM_SPIN`**, and it has to be: the keyframe writes an angle at every
 * stop on the assumption that one cycle is one turn. It is one animation rather than two because the
 * rotation and the opacity gate are the same idea — the quad may only be seen while it is broadside.
 */
export const PREMIUM_RIM =
    'animate-[tevi-premium-rim_6000ms_linear_infinite] motion-reduce:animate-none'

/**
 * An open microphone on a live seat — a red bloom behind the avatar that grows and fades.
 *
 * 1800ms `ease-in-out`: a breath, slower than `tevi-mic-pulse` on the badge (1.5s, a voice peak)
 * so the two do not lock into one throb. On a blurred element behind the disc, so it never covers
 * a face, and only while the microphone is open. See `tevi-seat-halo`.
 */
export const SEAT_HALO =
    'animate-[tevi-seat-halo_1800ms_ease-in-out_infinite] motion-reduce:animate-none'

/**
 * The gift banner's entrance — in from the leading edge with a small overshoot. 420ms on a
 * spring-like curve; see `tevi-gift-in` for the RTL variable it travels along.
 */
export const GIFT_IN =
    'animate-[tevi-gift-in_420ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none'

/** How long the banner's exit takes — the banner starts it this long before it expires. */
export const GIFT_OUT_MS = 280

/**
 * The gift banner's exit. Under reduced motion the banner simply stays until it is removed, a
 * moment later — the one outcome an exit can have without moving.
 */
export const GIFT_OUT =
    'animate-[tevi-gift-out_280ms_cubic-bezier(0.4,0,1,1)_forwards] motion-reduce:animate-none'

/** The gift picture drifting and tilting while its banner is up. Loops; the plate does not. */
export const GIFT_BOB =
    'animate-[tevi-gift-bob_1800ms_ease-in-out_infinite] motion-reduce:animate-none'

/**
 * The dots between the inviter and the reader in the live invitation — a wave, each dot lifting
 * and brightening in turn. 1200ms loop; the caller staggers the three by 160ms and starts them
 * after the two faces have landed. Under reduced motion the dots sit still at full strength.
 */
export const INVITE_DOT =
    'animate-[tevi-invite-dot_1200ms_ease-in-out_infinite_both] motion-reduce:animate-none'

/** How long `PIN_OUT` takes — the caller clears the pin this long after the press. */
export const PIN_OUT_MS = 200

/**
 * A dismissed pinned message leaving — up 6px and fading, quicker than it arrived. `forwards`, so
 * the last frame holds until the caller unmounts it on `PIN_OUT_MS`.
 */
export const PIN_OUT =
    'animate-[tevi-pin-out_200ms_cubic-bezier(0.4,0,1,1)_forwards] motion-reduce:animate-none'

/**
 * A slow vertical float, for an illustration that is waiting — the empty gift leaderboard's
 * podium. 3200ms `ease-in-out`, 3px: enough to read as alive, too little to pull the eye off the
 * stage. Under reduced motion it simply sits.
 */
export const FLOAT = 'animate-[tevi-float_3200ms_ease-in-out_infinite] motion-reduce:animate-none'

/**
 * A sparkle catching the light — grows, turns and fades out once per 2400ms cycle. Callers stagger
 * siblings with `animation-delay`. Under reduced motion it is hidden (`opacity-0`) rather than
 * frozen mid-glint — it is pure decoration, so nothing is lost.
 */
export const TWINKLE =
    'animate-[tevi-twinkle_2400ms_ease-in-out_infinite_both] motion-reduce:animate-none motion-reduce:opacity-0'

/**
 * A podium step rising from the floor — `scale` on the y axis from nothing, `origin-bottom` on the
 * caller, with a small overshoot. Callers stagger the three so first place lands last.
 */
export const PODIUM_RISE =
    'animate-[tevi-podium-rise_480ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none'

/**
 * A locked padlock giving a small shake — a quick ±12° wobble in the first fifth of a 3200ms cycle,
 * then still for the rest, so it reads as a nudge every few seconds rather than a constant jitter.
 * `origin-top` would hinge it at the shackle; centred is enough at 24px.
 */
export const LOCK_JIGGLE =
    'animate-[tevi-lock-jiggle_3200ms_ease-in-out_infinite] motion-reduce:animate-none'

/**
 * A badge announcing something new — one ripple of its own colour out to 1.9× and gone, once per
 * arrival (the caller keys the element on the count). `forwards`, so it rests invisible.
 */
export const PING =
    'animate-[tevi-ping_700ms_cubic-bezier(0,0,0.2,1)_forwards] motion-reduce:animate-none motion-reduce:opacity-0'

/**
 * The live ring turning — Figma's linear `#8B5CF6 → #E11D48 → #F97316` stroke rotated a full turn
 * every 3s, so the colours travel round the face. Linear, like every continuous spin here. Under
 * reduced motion it rests at 0°, which is exactly the frame Figma draws (violet on the left).
 */
export const LIVE_RING_SPIN =
    'animate-[tevi-live-ring-spin_3000ms_linear_infinite] motion-reduce:animate-none'

/**
 * A ring leaving a mark and fading — 1 → 1.6× over 2.4s, on a loop. Run two, the second
 * `[animation-delay:1200ms]`, for a steady pulse. Hidden under reduced motion rather than frozen
 * half-way out.
 */
export const RIPPLE =
    'animate-[tevi-ripple_2400ms_cubic-bezier(0,0,0.2,1)_infinite_both] motion-reduce:animate-none motion-reduce:opacity-0'
