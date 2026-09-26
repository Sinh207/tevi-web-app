/**
 * Sample a clip into the strip of stills a trimmer scrubs along.
 *
 * ## It is a `<video>` and a `<canvas>`, not ffmpeg
 *
 * The core is 24 MB and takes seconds to load; a strip that waited for it would leave the dialog
 * blank for the whole of that, to draw twelve thumbnails the browser's own decoder can produce in
 * well under a second. So the strip never touches wasm — ffmpeg is loaded only when *Save* is
 * pressed, which is also the first moment the reader has committed to anything.
 *
 * ## Seek, wait for `seeked`, draw
 *
 * The loop is sequential and it has to be: one `<video>` element has one playhead, so two seeks in
 * flight resolve against whichever frame happened to be decoded last. Each step therefore waits for
 * the element's own `seeked` event before drawing, and a frame that never arrives times out rather
 * than hanging the dialog on a file the decoder has quietly given up on.
 *
 * Frames come back as `blob:` URLs rather than data URLs — twelve JPEG data URLs is a megabyte of
 * base64 held in React state and re-diffed on every drag, which is exactly the wrong shape for
 * something re-rendered while a handle is moving. **The caller revokes them**; `revokeFrames` is
 * here so it does not have to remember how.
 */

export interface VideoFrameStrip {
    /** `blob:` URLs, in time order. The caller revokes them — see `revokeFrames`. */
    urls: string[]
}

/** How long one frame is given before the strip gives up on it and moves to the next. */
const SEEK_TIMEOUT_MS = 3000

/** Legacy samples twelve, which is enough to recognise a scene at strip width and cheap to make. */
export const FRAME_COUNT = 12

/**
 * Twelve stills spread across the clip, each already cropped to the strip's cell.
 *
 * Never rejects. A clip the browser will not decode yields fewer frames, or none — and a strip with
 * no stills is a plain bar the handles still work on, which is a worse trimmer but a working one.
 * Throwing would take the dialog with it.
 */
export async function captureVideoFrames(
    src: string,
    {
        durationSeconds,
        count = FRAME_COUNT,
        cellWidth = 80,
        cellHeight = 64,
        signal,
    }: {
        durationSeconds: number
        count?: number
        cellWidth?: number
        cellHeight?: number
        /** Aborted when the dialog closes mid-sample; whatever was made is discarded. */
        signal?: AbortSignal
    },
): Promise<VideoFrameStrip> {
    if (typeof document === 'undefined' || !(durationSeconds > 0)) return { urls: [] }

    const video = document.createElement('video')
    video.src = src
    video.muted = true
    video.preload = 'metadata'
    // Nothing here is drawn to the page; an autoplay policy has no say, and iOS needs this to decode.
    video.playsInline = true

    const canvas = document.createElement('canvas')
    /*
     * Device pixels, so the strip is not soft on a 2× screen — the stills are small enough that the
     * memory this costs is a rounding error against the clip already in the page.
     */
    const dpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1)
    canvas.width = Math.max(1, Math.floor(cellWidth * dpr))
    canvas.height = Math.max(1, Math.floor(cellHeight * dpr))
    const context = canvas.getContext('2d')

    const urls: string[] = []

    try {
        if (!context) return { urls: [] }
        await once(video, 'loadedmetadata', SEEK_TIMEOUT_MS)

        const interval = durationSeconds / count
        for (let index = 0; index < count; index += 1) {
            if (signal?.aborted) break
            /*
             * The **middle** of each slice, not its edge. A frame taken at exactly 0 is often the
             * black lead-in a camera writes, and the last taken at exactly `duration` is past the
             * final frame on some decoders and comes back blank.
             */
            const at = Math.min((index + 0.5) * interval, Math.max(0, durationSeconds - 0.01))

            try {
                video.currentTime = at
                await once(video, 'seeked', SEEK_TIMEOUT_MS)
            } catch {
                // This one frame is lost; the rest of the strip is still worth having.
                continue
            }

            const url = await drawFrame(video, canvas, context)
            if (url) urls.push(url)
        }
    } catch {
        // Metadata never arrived. Whatever was captured before that stands.
    } finally {
        /*
         * `src = ''` plus `load()` is what actually releases the decoder — dropping the reference
         * alone leaves it holding the file until the next collection, and twelve of those across a
         * session is a tab that stops decoding anything.
         */
        video.src = ''
        video.load()
    }

    if (signal?.aborted) {
        revokeFrames(urls)
        return { urls: [] }
    }
    return { urls }
}

/** Release a strip's object URLs. Safe to call twice; a revoked URL revokes again harmlessly. */
export function revokeFrames(urls: string[]): void {
    for (const url of urls) {
        try {
            URL.revokeObjectURL(url)
        } catch {
            // Storage disabled, or already gone.
        }
    }
}

/**
 * Draw the current frame **cover**-cropped into the cell, as a `blob:` URL.
 *
 * Cover rather than contain: the cells sit edge to edge in a strip, and letterboxing each one turns
 * a filmstrip into a row of framed pictures with black gutters.
 */
function drawFrame(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
): Promise<string | null> {
    try {
        const vw = video.videoWidth || 1
        const vh = video.videoHeight || 1
        const scale = Math.max(canvas.width / vw, canvas.height / vh)
        const dw = Math.floor(vw * scale)
        const dh = Math.floor(vh * scale)
        context.drawImage(
            video,
            Math.floor((canvas.width - dw) / 2),
            Math.floor((canvas.height - dh) / 2),
            dw,
            dh,
        )
    } catch {
        // A tainted or undecodable frame. One cell short beats no strip.
        return Promise.resolve(null)
    }

    return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : null), 'image/jpeg', 0.7)
    })
}

/** One event, or a rejection once `timeoutMs` has passed — so no step can hang the strip. */
function once(target: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const done = (settle: () => void) => () => {
            clearTimeout(timer)
            target.removeEventListener(event, onEvent)
            target.removeEventListener('error', onError)
            settle()
        }
        const onEvent = done(resolve)
        const onError = done(() => reject(new Error(`video ${event} failed`)))
        const timer = setTimeout(
            () => done(() => reject(new Error(`video ${event} timed out`)))(),
            timeoutMs,
        )
        target.addEventListener(event, onEvent, { once: true })
        target.addEventListener('error', onError, { once: true })
    })
}
