/**
 * The arithmetic behind `ChannelImageViewer`'s shared-element zoom — pure, so it is tested rather
 * than eyeballed.
 *
 * The frame is laid out **once, at its final rect** (the image contained in the viewport), and every
 * other state is a `transform` + `clip-path` off that rect. Animating `width`/`height`/`top` instead
 * would re-lay-out every frame; these two properties are composited.
 */

export type Rect = { x: number; y: number; w: number; h: number }

/** Space kept round the image from `sm` (612) up. Below it the image runs to the bezels. */
const GUTTER_FROM_SM = 48

/** Where an image of `nw`×`nh` sits when contained in a `vw`×`vh` viewport. */
export function containRect(nw: number, nh: number, vw: number, vh: number): Rect {
    const pad = vw >= 612 ? GUTTER_FROM_SM : 0
    const aw = Math.max(vw - pad * 2, 1)
    const ah = Math.max(vh - pad * 2, 1)
    // An unknown size (0×0) is drawn square rather than dividing by zero.
    const ratio = nw > 0 && nh > 0 ? nw / nh : 1
    const w = Math.min(aw, ah * ratio)
    const h = w / ratio
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h }
}

/**
 * The frame's style when it looks exactly like the thumbnail on the page.
 *
 * The page **crops** (`object-cover` — a circle for the avatar, a 402:140 band for the cover) while
 * the viewer **contains**, so this is a scale plus a clip, not a scale alone:
 *
 * - scale by the *cover* factor, so the image is at least as large as the source box on both axes;
 * - clip it back down to the source box, centred — which is what `object-cover` shows;
 * - and round the clip by the source's radius.
 *
 * `clip-path` is in the frame's own (pre-transform) coordinates, so the inset and the radius are
 * divided by the scale to come out at the right size on screen.
 */
export function sourceKeyframe(target: Rect, source: Rect, radius: number): Keyframe {
    const scale = Math.max(source.w / target.w, source.h / target.h)
    const insetX = (target.w - source.w / scale) / 2
    const insetY = (target.h - source.h / scale) / 2
    const dx = source.x + source.w / 2 - (target.x + target.w / 2)
    const dy = source.y + source.h / 2 - (target.y + target.h / 2)
    return {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        clipPath: `inset(${insetY}px ${insetX}px round ${radius / scale}px)`,
    }
}

/** The frame at rest: where `containRect` put it, nothing clipped. */
export const RESTING_KEYFRAME: Keyframe = {
    transform: 'translate(0px, 0px) scale(1)',
    clipPath: 'inset(0px 0px round 0px)',
}

/**
 * Drag-to-dismiss: how far the frame has been pulled, as `0..1` of the distance that dims the
 * backdrop out entirely. The frame also shrinks a little as it goes, to read as "going away".
 */
export function dragProgress(dy: number): number {
    return Math.min(Math.abs(dy) / 320, 1)
}

/** Released past this many pixels — or flicked faster than `DISMISS_VELOCITY` — the viewer closes. */
export const DISMISS_DISTANCE = 120
/** px/ms. */
export const DISMISS_VELOCITY = 0.5
