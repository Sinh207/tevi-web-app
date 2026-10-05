/**
 * **Is the picture in the player actually moving** — read off the frames themselves.
 *
 * A CDN rendition runs seconds behind the broadcast, and by a margin the client cannot know (the
 * transcode and CDN hops are invisible to it, and HLS can be 10s+ behind where HTTP-FLV is 2–4s).
 * So "the host turned their camera off" arrives on the socket long before the viewer's picture
 * changes, and no fixed delay lines the two up — a 3s one was tried and still put the avatar over
 * a picture that was playing.
 *
 * The frames do know. A camera-off rendition is a still — black, or the last frame held, or a
 * static card — while a live camera is never pixel-identical from one sample to the next (sensor
 * noise alone moves it). So the player samples a tiny downscale of the frame and this decides, as
 * soon as it can:
 *
 * - **dead, at once** — the latest sample is black: dark *and* flat. Flat is what tells a black
 *   frame from a dim room, which is dark but still has edges in it;
 * - **alive, at once** — the latest sample moved;
 * - **dead** — every sample in the window was still (a held frame or a static card);
 * - `null` — still samples so far, but not yet a full window of them.
 *
 * It used to need four still samples 500ms apart for either answer, which put the avatar a second
 * or two behind a picture that had already gone dark, and the camera's return as far behind. At
 * 150ms with the two instant cases, a black frame is caught on the next sample and a returning
 * camera on the first frame that moves.
 *
 * Pure, so the rule is testable without a video element.
 */

/** Edge of the square the frame is downscaled to before it is read. */
export const PICTURE_SAMPLE_SIZE = 24

/** One sample every this many ms — a 24×24 read is cheap enough to do this often. */
export const PICTURE_SAMPLE_MS = 150

/** How many consecutive still samples make a held frame dead — 600ms at the rate above. */
const WINDOW = 4

/** Mean luma (0–255) under which a frame may be black… */
const BLACK_LUMA = 8

/** …and the luma spread under which it is flat enough to be. A dim room has edges; black has none. */
const BLACK_SPREAD = 4

/** Mean per-pixel change (0–255) under which two samples count as the same frame. */
const STILL_DIFF = 0.6

export interface PictureSample {
    luma: number
    /** Standard deviation of luma across the sample — how much the frame varies. */
    spread: number
    diff: number
}

/** Mean luma, its spread, and the mean absolute change against the previous sample's RGBA. */
export function measureSample(
    rgba: Uint8ClampedArray,
    previous: Uint8ClampedArray | null,
): PictureSample {
    let sum = 0
    let squares = 0
    let diff = 0
    const pixels = rgba.length / 4
    for (let i = 0; i < rgba.length; i += 4) {
        const y = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]
        sum += y
        squares += y * y
        if (previous) {
            diff +=
                (Math.abs(rgba[i] - previous[i]) +
                    Math.abs(rgba[i + 1] - previous[i + 1]) +
                    Math.abs(rgba[i + 2] - previous[i + 2])) /
                3
        }
    }
    const luma = sum / pixels
    return {
        luma,
        spread: Math.sqrt(Math.max(0, squares / pixels - luma * luma)),
        diff: previous ? diff / pixels : Number.POSITIVE_INFINITY,
    }
}

/** Feeds samples in, says whether the picture is alive. One per player. */
export function createPictureTracker() {
    const recent: PictureSample[] = []
    return (sample: PictureSample): boolean | null => {
        recent.push(sample)
        if (recent.length > WINDOW) recent.shift()
        if (sample.luma < BLACK_LUMA && sample.spread < BLACK_SPREAD) return false
        if (sample.diff >= STILL_DIFF) return true
        if (recent.length < WINDOW) return null
        return recent.some(s => s.diff >= STILL_DIFF)
    }
}
