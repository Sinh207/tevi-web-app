/**
 * **The eighteen seat arrangements**, as data.
 *
 * Legacy ships them as eighteen React components — `seats/components/portrait/p1` …
 * `landscape/l9`, 1,087 lines of MUI `Grid` that differ only in how many boxes there are and how
 * big each one is. Reading them side by side is what surfaced the four defects listed at the foot
 * of this file; each is invisible in its own file and obvious in a table.
 *
 * ## The model
 *
 * A **6-column** CSS grid, because every division legacy uses is a factor of six: halves (MUI
 * `size={6}`), thirds (`size={4}`), and the two-thirds/one-third split of the feature layouts
 * (`size={8}` / `size={4}`). Each seat is one `grid-area`, written `rowStart / colStart / rowEnd /
 * colEnd`. That handles the uniform grids and the main-plus-rail ones in the same shape, which is
 * what lets there be one renderer instead of eighteen.
 *
 * ## The stage box
 *
 * Legacy sizes the container off the observed viewport and then picks an aspect: portrait layouts
 * measure `min(w, h)` and take 9:16 of it, landscape ones take `height × 16/9`. `P3` is the odd
 * one — half width, because two stacked portrait tiles in a full-width box would each be squat.
 */

/**
 * The shape of the stage the grid is laid into — **one measured container ratio per family.**
 *
 * ⚠ These are legacy's own container expressions, not a ratio derived from the tiles. Every
 * `P*`/`L*` file computes `w = h = min(widthLayout, heightLayout)` off a `ResizeObserver` on the
 * seats box and then sizes its container from that:
 *
 * ```
 * P1              width: calc(w * 9/16)   height: h        → 9 / 16
 * P2 P4…P9        width: w                height: h        → 1 / 1   (a square, not a portrait)
 * P3              width: calc(w / 2)      height: h        → 1 / 2
 * L1 L4…L9        width: calc(H * 16/9)   height: H        → 16 / 9
 * ```
 *
 * The two exceptions carry `boxAspect` below. This replaces a derivation this port invented —
 * "the box is `cols × rows` of the tile ratio" — which sounds right, is not what legacy does, and
 * gave every landscape family a different box (`32/18`, `48/18`, `12/6`…) where legacy has one.
 */
export type SeatBox =
    /** 9:16 of the shorter viewport side — `P1` alone. */
    | 'portrait'
    /** Half of `portrait`'s width. `P3` only: two stacked tiles need a narrower column. */
    | 'portrait-narrow'
    /** A square. Every multi-tile portrait grid — the tiles divide it, the box does not follow them. */
    | 'portrait-grid'
    /** `height × 16/9`. Every `L*` layout except the two that override it. */
    | 'landscape'

/** The container ratio each family resolves to, as a CSS `aspect-ratio` value. */
const BOX_ASPECT: Record<SeatBox, string> = {
    portrait: '9 / 16',
    'portrait-narrow': '1 / 2',
    'portrait-grid': '1 / 1',
    landscape: '16 / 9',
}

export interface SeatArrangement {
    box: SeatBox
    /** `grid-template-rows: repeat(rows, 1fr)`. Columns are always 6. */
    rows: number
    /**
     * A container ratio this layout measures out for itself, overriding its family's.
     *
     * Three layouts do. `L2` and `L3` are real measurements off legacy — two 16:9 tiles side by
     * side (`32 / 9`) and two 9:16 ones (`18 / 16`). `P2` is a deliberate divergence, stated at
     * its row. Everything else takes `BOX_ASPECT[box]`.
     */
    boxAspect?: string
    /** One `grid-area` per seat, in publisher order. */
    areas: string[]
    /**
     * `aspect-ratio` on each tile, where legacy sets one.
     *
     * Only the landscape layouts do — a portrait tile fills its grid cell.
     *
     * ⚠ **`L8`'s main tile is `16/9.1` in legacy, and it is not carried — nor needed.** The hero
     * spans two rows *plus* the 12px gap between them, so at 16:9 it would stop short of the two
     * small tiles beside it; legacy's MUI grid sizes each tile from its own ratio, and `9.1` is the
     * hand-tuned nudge that makes the edges meet. This renderer is a CSS grid in which every tile
     * is `size-full` inside its `grid-area`, so the hero's height *is* two rows and a gap by
     * construction. Measured in `/dev/event`: hero bottom 103.1, the rail's second tile 103.5, the
     * bottom row at 111 for all three columns. No number to tune.
     */
    aspect?: string
}

/** `repeat(cols, …)` × `rows`, filled left to right, top to bottom. */
function uniform(cols: number, count: number, box: SeatBox, aspect?: string): SeatArrangement {
    const span = 6 / cols
    const rows = Math.ceil(count / cols)
    const areas = Array.from({ length: count }, (_, i) => {
        const row = Math.floor(i / cols) + 1
        const col = (i % cols) * span + 1
        return `${row} / ${col} / ${row + 1} / ${col + span}`
    })
    return { box, rows, areas, aspect }
}

/**
 * Every layout code the backend can send, and what it draws.
 *
 * ⚠ **The digit is a layout id, not a seat count.** `P3` draws **two** tiles, `P5` draws four,
 * `P7` and `P8` draw six. Reading it as a headcount is the obvious mistake and it was made here
 * first: `P3` settles it, because three publishers cannot go in two boxes by accident. The counts
 * legacy actually ships are `1 · 2 · 2 · 4 · 4 · 6 · 6 · 6 · 9`, identically for `P*` and `L*` —
 * a progression of *arrangements*, each one a shape somebody drew.
 *
 * So a room can hold more people than its code's arrangement has boxes. `seatArrangement` below
 * is what keeps that from dropping somebody.
 */
const ARRANGEMENTS: Record<string, SeatArrangement> = {
    P1: { box: 'portrait', rows: 1, areas: ['1 / 1 / 2 / 7'] },
    /*
     * ⚠ **A deliberate divergence: two 3:4 tiles, not legacy's two 1:2 ones.** Legacy draws `P2`
     * in a *square* (`width = height = min(…)`) split down the middle, so each co-host is a strip
     * twice as tall as it is wide — on a desktop stage that is a pair of floor-to-ceiling columns
     * with a face lost in the middle of each. Every other portrait-grid layout already lands near
     * square tiles (`P3` 1:1, `P4` 1:1, `P6` 2:3); `P2` was the one outlier. A 3:2 box gives 3:4
     * tiles, the proportion a two-up video call uses, and `cover` crops a phone's 9:16 feed to it
     * from the top and bottom rather than the sides.
     */
    P2: { ...uniform(2, 2, 'portrait-grid'), boxAspect: '3 / 2' },
    P3: { box: 'portrait-narrow', rows: 2, areas: ['1 / 1 / 2 / 7', '2 / 1 / 3 / 7'] },
    P4: uniform(2, 4, 'portrait-grid'),
    /** Main over a row of three — legacy's `(height / 3) * 2` then three thirds. */
    P5: {
        box: 'portrait-grid',
        rows: 3,
        areas: ['1 / 1 / 3 / 7', '3 / 1 / 4 / 3', '3 / 3 / 4 / 5', '3 / 5 / 4 / 7'],
    },
    P6: uniform(3, 6, 'portrait-grid'),
    /** Six tiles in two columns — see the table's note on the digit. */
    P7: uniform(2, 6, 'portrait-grid'),
    /** Main two-thirds wide with two stacked beside it, over a row of three. */
    P8: {
        box: 'portrait-grid',
        rows: 3,
        areas: [
            '1 / 1 / 3 / 5',
            '1 / 5 / 2 / 7',
            '2 / 5 / 3 / 7',
            '3 / 1 / 4 / 3',
            '3 / 3 / 4 / 5',
            '3 / 5 / 4 / 7',
        ],
    },
    P9: uniform(3, 9, 'portrait-grid'),

    L1: { box: 'landscape', rows: 1, areas: ['1 / 1 / 2 / 7'] },
    /**
     * ⚠ **Two tiles side by side, not stacked.** This shipped as two full-width bands, which is
     * the wrong drawing entirely: legacy's `l2` is `flexDirection: 'row'` with two boxes of
     * `calc(H * 16/9 - 18px)` and a 12px gap (`landscape/l2/index.js:32,44`). Reading "2 rows"
     * off the digit is what produced the stack.
     */
    L2: {
        box: 'landscape',
        rows: 1,
        areas: ['1 / 1 / 2 / 4', '1 / 4 / 2 / 7'],
        aspect: '16 / 9',
        boxAspect: '32 / 9',
    },
    /** Two portrait tiles side by side — the only landscape layout with a 9:16 tile. */
    L3: { ...uniform(2, 2, 'landscape'), aspect: '9 / 16', boxAspect: '18 / 16' },
    L4: uniform(2, 4, 'landscape', '16 / 9'),
    /** Main with a rail of three down the trailing edge. */
    L5: {
        box: 'landscape',
        rows: 3,
        areas: ['1 / 1 / 4 / 5', '1 / 5 / 2 / 7', '2 / 5 / 3 / 7', '3 / 5 / 4 / 7'],
        aspect: '16 / 9',
    },
    L6: uniform(3, 6, 'landscape', '16 / 9'),
    /** Six tiles. The 4:3 tile is legacy's and appears nowhere else. */
    L7: uniform(3, 6, 'landscape', '4 / 3'),
    /** Main with a pair under it and a rail of three beside — six tiles. */
    L8: {
        box: 'landscape',
        rows: 3,
        areas: [
            '1 / 1 / 3 / 5',
            '3 / 1 / 4 / 3',
            '3 / 3 / 4 / 5',
            '1 / 5 / 2 / 7',
            '2 / 5 / 3 / 7',
            '3 / 5 / 4 / 7',
        ],
        aspect: '16 / 9',
    },
    L9: uniform(3, 9, 'landscape', '16 / 9'),
}

/**
 * **The arrangement for a room** — the code it reports, or something that fits everybody.
 *
 * Two fallbacks, and they answer different failures:
 *
 * 1. **An unknown code** falls back to `P1`, which is legacy's own
 *    (`componentMap[layoutType] || P1`). A layout this client has never seen is the backend adding
 *    one, and one large tile is wrong rather than broken.
 * 2. ⚠ **More publishers than tiles** falls back to a uniform grid sized to the room. A
 *    **deliberate divergence**: legacy draws the arrangement's boxes and anybody past them is
 *    simply not on screen. In normal operation the backend picks a code that fits, so this should
 *    never fire — which is exactly why it matters. When the two do disagree, somebody standing in
 *    a room they were invited into is invisible, the grid looks perfectly composed without them,
 *    and nothing anywhere reports it.
 *
 * `spotlight` overrides everything with `P1`, which is what spotlight *means* — legacy short-circuits
 * to `P1` the same way, and `spotlitPublisher` picks who.
 */
export function seatArrangement({
    layout,
    publisherCount,
    spotlight = false,
}: {
    layout: string | null
    publisherCount: number
    spotlight?: boolean
}): SeatArrangement {
    if (spotlight) return ARRANGEMENTS.P1

    const named = (layout && ARRANGEMENTS[layout]) || ARRANGEMENTS.P1
    if (publisherCount <= named.areas.length) return named

    /*
     * Nobody is dropped. The box and the tile aspect are kept from the named arrangement so the
     * stage does not also change shape — only the grid inside it does. Three columns is legacy's
     * own choice for every layout above four seats.
     */
    const cols = publisherCount <= 2 ? publisherCount : publisherCount <= 4 ? 2 : 3
    return uniform(cols, Math.min(publisherCount, 9), named.box, named.aspect)
}

/**
 * The stage box's aspect, as a CSS `aspect-ratio` value — **looked up, never derived.**
 *
 * ⚠ This function briefly computed the box from the tiles (`cols × rows × tile aspect`). That is a
 * rationalisation, not a port: legacy sizes the *container* from one expression per family and
 * lets each tile carry its own `aspectRatio` inside it, so a six-up landscape grid and a single
 * landscape tile share a 16:9 box. Deriving gave them `48/18` and `16/9` and made every multi-tile
 * layout a different shape from the one that ships.
 *
 * `BOX_ASPECT` carries the four families; `boxAspect` carries the two layouts that measure their
 * own (`L2`, `L3`). Both are quoted from the legacy files at their declarations.
 */
export function seatBoxAspect(arrangement: SeatArrangement): string {
    return arrangement.boxAspect ?? BOX_ASPECT[arrangement.box]
}

/**
 * **The stage box, as inline style** — the ratio plus the one rule that gives it a size.
 *
 * ⚠ `aspect-ratio` **alone sizes nothing.** Measured in a browser across four area shapes: a box
 * carrying only `aspect-ratio` with `max-width:100%` and `max-height:100%`, centred in a flex
 * parent, comes out **0×0** at every ratio. It has no definite dimension to derive the other from,
 * and `max-*` only ever removes size. The stage looked right anyway because the seat grid and the
 * player's `<video>` pushed the box open from the inside — so its shape was whatever the content
 * happened to be, which is why a wrong `aspect-ratio` was invisible for as long as it was.
 *
 * Neither simple fix covers both directions, and that was measured too: `height:100%;width:auto`
 * is correct while the box is *taller* than the area and overflows once it is wider; `width:100%`
 * with a capped height is the exact mirror. The stage meets both — `9/16` for one portrait guest,
 * `48/18` for `L6` — so it needs the rule that fits inside on whichever axis binds:
 *
 * ```
 * width: min(100cqw, calc(100cqh * ratio))
 * ```
 *
 * Container units against the stage area (which therefore carries `container-type: size`), so the
 * box is the largest one of its ratio that fits — the `object-fit: contain` a `<div>` cannot ask
 * for. Legacy computes the same two numbers in JS off an observed viewport (`seatBoxSize`, which
 * this repo ported and never called); CSS does it without measuring, and without a resize listener
 * that can disagree with the render it is in.
 */
export function seatBoxStyle(arrangement: SeatArrangement): {
    aspectRatio: string
    width: string
} {
    const aspectRatio = seatBoxAspect(arrangement)
    const ratio = seatBoxRatio(arrangement)
    return { aspectRatio, width: `min(100cqw, calc(100cqh * ${ratio}))` }
}

/** The box's width over its height, as a number — what the chrome-clearance check measures with. */
export function seatBoxRatio(arrangement: SeatArrangement): number {
    const [w, h] = seatBoxAspect(arrangement)
        .split('/')
        .map(part => Number(part.trim()))
    return h > 0 ? w / h : 1
}

/** Every code this client knows, for the harness. */
export const SEAT_LAYOUT_CODES = Object.keys(ARRANGEMENTS)
