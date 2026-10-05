/**
 * **Does the stage box need to drop below the floating chrome** — answered from geometry, not by
 * always paying for it.
 *
 * The channel plate and the balance plate float at the stage's top corners. A box that fills the
 * full height runs under them, so the stage used to reserve 64px at the top for every layout. But
 * a narrow portrait box (`P1`, `P3`) sits in the middle, between the two plates, and never touches
 * either — for those the 64px was ~9% of the picture's height given away for nothing.
 *
 * So: work out where the box *would* land with the tight 12px inset, and only if that rectangle
 * meets a chrome plate (within `CHROME_GAP`) does the stage take the clear inset instead. The box
 * is the largest of its ratio that fits, centred on both axes — `seatBoxStyle`'s rule, restated
 * here in numbers. Pure, so the decision is testable without a browser.
 */

/** The inset on the top and sides when nothing is in the way. */
export const STAGE_INSET = 12

/**
 * The bottom inset — 4px less, because the tray band under the stage opens with `py-1` before
 * its plate starts. 8 + 4 is the same 12 the box keeps from the top; at 12 the gap under the box
 * was visibly the larger of the two.
 */
export const STAGE_INSET_BOTTOM = 8

/** The top inset that clears the chrome: `top-3` (12) + a 40px plate + 12. */
export const STAGE_INSET_CLEAR = 64

/** How close the box may come to a plate before it counts as touching. */
const CHROME_GAP = 8

export interface Rect {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
}

export function needsChromeClearance({
    stage,
    ratio,
    chrome,
}: {
    /** The stage area's border box, padding included. */
    stage: Rect
    /** The box's width over its height. */
    ratio: number
    chrome: Rect[]
}): boolean {
    const availableW = stage.width - STAGE_INSET * 2
    const availableH = stage.height - STAGE_INSET - STAGE_INSET_BOTTOM
    if (availableW <= 0 || availableH <= 0 || ratio <= 0) return true

    const boxW = Math.min(availableW, availableH * ratio)
    const boxH = boxW / ratio
    const left = stage.left + STAGE_INSET + (availableW - boxW) / 2
    const top = stage.top + STAGE_INSET + (availableH - boxH) / 2
    const right = left + boxW

    return chrome.some(
        plate =>
            plate.width > 0 &&
            plate.height > 0 &&
            plate.bottom + CHROME_GAP > top &&
            plate.left < right + CHROME_GAP &&
            plate.right > left - CHROME_GAP,
    )
}
