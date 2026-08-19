/**
 * The cropper's geometry, as arithmetic.
 *
 * ## Why this app has its own cropper at all
 *
 * Legacy uses `react-image-crop`; this repo has neither that dependency nor a design-system
 * component to reach for — the DS ships **no** file upload, card media or media player family,
 * which `docs/DESIGN_SYSTEM.md` says explicitly. So the choice was a new dependency or ~120 lines
 * of transform maths, and the maths won: what the cropper actually needs is *pan and zoom inside
 * a fixed-aspect window*, which is one formula in each direction and nothing that a library's
 * generality would help with.
 *
 * ## The model
 *
 * The image is drawn **cover-fitted** to the viewport and then scaled by `zoom` (≥ 1) and moved
 * by `offset` (viewport pixels, from centre). Two consequences fall out of that choice, and both
 * are the reason it was chosen:
 *
 * - at `zoom = 1` the image already fills the window, so there is no state in which the crop can
 *   contain a transparent gap — which is the failure mode of a contain-fit cropper and the thing
 *   that turns into a black bar on a published cover;
 * - the clamp is symmetric and has a closed form (`(displayed − viewport) / 2`), so panning can
 *   never expose an edge and needs no special case for "image smaller than window".
 *
 * Everything here is pure and unit-tested (`image-crop.test.ts`). The one function that touches a
 * canvas takes the rectangle these produce, so the drawing has no arithmetic in it.
 */

export interface Size {
    width: number
    height: number
}

export interface Offset {
    x: number
    y: number
}

export interface Rect extends Offset, Size {}

/** Zoom is a multiplier on the cover fit. 3× is legacy's cropper limit and plenty for a face. */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 3

/**
 * The longest edge any cropped output may have.
 *
 * A phone camera writes 4000px wide. Uploading that as a 96px avatar is ~3 MB of transfer and a
 * server-side downscale to pay for; it also walks straight into the 2 MB limit the picker itself
 * enforces on the *input*, which would then reject the app's own output on a re-crop. Capping the
 * long edge keeps a cover sharp on a 2× 612px column (1224) with room to spare.
 */
export const MAX_OUTPUT_EDGE = 1600

/** The scale at which the natural image exactly covers the viewport. */
export function coverScale(natural: Size, viewport: Size): number {
    if (natural.width <= 0 || natural.height <= 0) return 1
    return Math.max(viewport.width / natural.width, viewport.height / natural.height)
}

/** The image's on-screen size at a given zoom. */
export function displayedSize(natural: Size, viewport: Size, zoom: number): Size {
    const scale = coverScale(natural, viewport) * zoom
    return { width: natural.width * scale, height: natural.height * scale }
}

/**
 * The pan, clamped so no edge of the viewport is ever uncovered.
 *
 * At `zoom = 1` on the axis that fits exactly, the limit is 0 — the image cannot move that way at
 * all, which is correct and is why this returns a clamp rather than a boolean "can move".
 */
export function clampOffset(offset: Offset, natural: Size, viewport: Size, zoom: number): Offset {
    const displayed = displayedSize(natural, viewport, zoom)
    const limitX = Math.max(0, (displayed.width - viewport.width) / 2)
    const limitY = Math.max(0, (displayed.height - viewport.height) / 2)
    return {
        x: Math.min(limitX, Math.max(-limitX, offset.x)),
        y: Math.min(limitY, Math.max(-limitY, offset.y)),
    }
}

/**
 * The pan that keeps the point under `focal` where it is while the zoom changes.
 *
 * ## Zooming to the centre is the thing that makes a cropper feel broken
 *
 * Every zoom control on this dialog is anchored: the wheel zooms toward the cursor, a pinch
 * zooms toward the midpoint between the fingers, and the slider and the ± buttons zoom toward the
 * centre of the frame (`focal = {0, 0}`, which reduces this to `offset × k`). Without that, a
 * scroll wheel over someone's face pushes the face off screen and the person has to pan back
 * every single time — which is the difference between adjusting a crop and fighting one.
 *
 * `focal` is in viewport pixels **from the centre of the frame**, the same space `offset` is in.
 *
 * The derivation, since the formula is otherwise opaque: a point of the image sits on screen at
 * `s = offset + p·S`, where `S` is the total scale. Holding `s = focal` while `S` becomes `S·k`
 * gives `offset′ = focal − (focal − offset)·k`. Not clamped here — the caller clamps, because it
 * is the caller that knows the new zoom.
 */
export function zoomOffset(offset: Offset, focal: Offset, from: number, to: number): Offset {
    if (from <= 0) return offset
    const k = to / from
    return {
        x: focal.x - (focal.x - offset.x) * k,
        y: focal.y - (focal.y - offset.y) * k,
    }
}

/**
 * The crop, in the source image's own pixels.
 *
 * The offset is negated on the way in: dragging the image *right* (positive `x`) reveals what is
 * on its *left*, so the source rectangle moves the other way. Getting that sign wrong produces a
 * cropper that follows the pointer perfectly and saves the mirror image of what was shown — which
 * is invisible on a centred crop and obvious on every other one.
 *
 * The result is clamped into the image and rounded, because it goes to `drawImage`, which will
 * happily read a sub-pixel rectangle from outside the bitmap and return transparent edges.
 */
export function cropRect({
    natural,
    viewport,
    zoom,
    offset,
}: {
    natural: Size
    viewport: Size
    zoom: number
    offset: Offset
}): Rect {
    const scale = coverScale(natural, viewport) * zoom
    if (scale <= 0) return { x: 0, y: 0, width: natural.width, height: natural.height }

    const clamped = clampOffset(offset, natural, viewport, zoom)
    const width = viewport.width / scale
    const height = viewport.height / scale
    const centerX = natural.width / 2 - clamped.x / scale
    const centerY = natural.height / 2 - clamped.y / scale

    const x = Math.round(Math.max(0, Math.min(natural.width - width, centerX - width / 2)))
    const y = Math.round(Math.max(0, Math.min(natural.height - height, centerY - height / 2)))

    return {
        x,
        y,
        width: Math.round(Math.min(width, natural.width - x)),
        height: Math.round(Math.min(height, natural.height - y)),
    }
}

/** The output size for a crop — its own aspect, longest edge capped. Never upscaled. */
export function outputSize(rect: Size): Size {
    const longest = Math.max(rect.width, rect.height)
    if (longest <= MAX_OUTPUT_EDGE) {
        return { width: Math.round(rect.width), height: Math.round(rect.height) }
    }
    const factor = MAX_OUTPUT_EDGE / longest
    return {
        width: Math.max(1, Math.round(rect.width * factor)),
        height: Math.max(1, Math.round(rect.height * factor)),
    }
}

/**
 * Render the crop to a blob.
 *
 * **PNG in, PNG out.** A PNG that carries transparency becomes black wherever it was clear if it
 * is re-encoded as JPEG, and an avatar cut from a logo is exactly the file that has transparency.
 * Everything else is JPEG at 0.92 — visually lossless at these sizes and a fraction of a PNG
 * photograph, which matters because the result is checked against the same 2 MB limit as the
 * input.
 *
 * Rejects rather than resolving `null` when the canvas cannot produce a blob: that is a browser
 * failure with nothing to fall back to, and a `null` here would be indistinguishable from "the
 * user cancelled" two call frames up.
 */
export async function renderCrop(
    image: CanvasImageSource,
    rect: Rect,
    type: string,
): Promise<Blob> {
    const size = outputSize(rect)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context unavailable')

    // The browser's own resampler, at its best setting — a 4000px photo drawn into 1600px with
    // the default `low` quality shows visible aliasing on hair and text.
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, size.width, size.height)

    const mime = type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, mime, mime === 'image/jpeg' ? 0.92 : undefined)
    })
    if (!blob) throw new Error('Canvas produced no blob')
    return blob
}
