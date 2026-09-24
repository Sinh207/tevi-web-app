/**
 * Reading a video file in the browser: how long, how big, what codec, and a poster frame.
 *
 * Everything here touches the DOM or the file's bytes, which is why it is separate from
 * `post-video.ts` — the rules about what is *allowed* are pure and tested; measuring is not.
 */

/** What a `<video>` element can tell us about a file before it is uploaded. */
export interface VideoProbe {
    durationSeconds: number
    width: number
    height: number
}

/**
 * How long to wait for a browser to decode enough of a file to answer.
 *
 * Legacy waits 15s for the poster, having raised it from 5s "for mobile". The same number is used
 * for both steps here: a file the browser cannot open in fifteen seconds is one the reader should
 * be told about rather than left watching.
 */
const PROBE_TIMEOUT_MS = 15_000

/**
 * Measure a clip, or answer `null` when the browser will not decode it.
 *
 * `null` rather than a throw for the reason the uploader's own helpers give: the caller's next line
 * is "so this file cannot be attached", and there is one thing to say about that either way. A
 * codec the browser lacks is the ordinary case — an HEVC recording from an iPhone on a desktop
 * Chrome — and it is not an error, it is an answer.
 */
export function probeVideo(file: Blob): Promise<VideoProbe | null> {
    return new Promise(resolve => {
        if (typeof document === 'undefined') {
            resolve(null)
            return
        }

        const url = URL.createObjectURL(file)
        const video = document.createElement('video')
        let settled = false

        const finish = (result: VideoProbe | null) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            video.removeAttribute('src')
            URL.revokeObjectURL(url)
            resolve(result)
        }

        const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS)

        video.preload = 'metadata'
        // Both are required before a mobile browser will load a clip it is not allowed to play.
        video.muted = true
        video.playsInline = true

        video.onloadedmetadata = () => {
            const { duration, videoWidth, videoHeight } = video
            /*
             * A stream of unknown length reports `Infinity`, and a file the decoder opened but
             * could not lay out reports `0`. Neither is a measurement, and sending either to
             * `video/upload-url/` puts a nonsense `duration_seconds` on the object.
             */
            if (!Number.isFinite(duration) || duration <= 0 || !videoWidth || !videoHeight) {
                finish(null)
                return
            }
            finish({ durationSeconds: duration, width: videoWidth, height: videoHeight })
        }
        video.onerror = () => finish(null)

        video.src = url
    })
}

/**
 * The frame the post shows before the clip plays.
 *
 * ## Why it is drawn here rather than left to the backend
 *
 * The transcode produces one eventually, but "eventually" is after the post is published — so a
 * video post's first minutes on a feed would be a black rectangle. Legacy draws the same frame at
 * **0.1s**, which is far enough in to be past a fade-from-black and near enough to be the shot the
 * author expects.
 *
 * Capped at **640px on the long edge** and encoded JPEG at **0.8**, both legacy's numbers: this is a
 * poster for a card, not an image the reader opens, and the upload endpoint is told
 * `thumbnail_extension: 'jpeg'` regardless.
 *
 * Answers `null` on anything unexpected — a codec the browser cannot decode, a canvas the platform
 * refuses to export, the timeout. `uploadPostVideo` treats a missing poster as non-fatal.
 */
export function captureVideoPoster(file: Blob): Promise<Blob | null> {
    return new Promise(resolve => {
        if (typeof document === 'undefined') {
            resolve(null)
            return
        }

        const url = URL.createObjectURL(file)
        const video = document.createElement('video')
        let settled = false

        const finish = (result: Blob | null) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            video.removeAttribute('src')
            URL.revokeObjectURL(url)
            resolve(result)
        }

        const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS)

        const draw = () => {
            const { videoWidth, videoHeight } = video
            if (!videoWidth || !videoHeight) {
                finish(null)
                return
            }

            const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(videoWidth, videoHeight))
            const canvas = document.createElement('canvas')
            canvas.width = Math.round(videoWidth * scale)
            canvas.height = Math.round(videoHeight * scale)

            const context = canvas.getContext('2d')
            if (!context) {
                finish(null)
                return
            }

            try {
                context.drawImage(video, 0, 0, canvas.width, canvas.height)
            } catch {
                // A cross-origin frame taints the canvas. Not reachable for a local file, but the
                // export below would throw rather than answer, and a poster is never worth that.
                finish(null)
                return
            }

            canvas.toBlob(blob => finish(blob), 'image/jpeg', POSTER_QUALITY)
        }

        video.preload = 'metadata'
        video.muted = true
        video.playsInline = true

        /*
         * `seeked`, not `loadeddata`. Legacy listens on three events and then waits 100ms in each,
         * which is a guess that the seek it requested has landed; the seek has its own event and it
         * fires when the frame is actually there.
         */
        video.onseeked = draw
        video.onloadedmetadata = () => {
            // Seeking past the end of a very short clip lands nowhere, so clamp into the file.
            video.currentTime = Math.min(POSTER_TIME_SECONDS, Math.max(0, video.duration - 0.05))
        }
        video.onerror = () => finish(null)

        video.src = url
    })
}

/** Legacy's own frame offset, thumbnail ceiling and JPEG quality. */
const POSTER_TIME_SECONDS = 0.1
const POSTER_MAX_EDGE = 640
const POSTER_QUALITY = 0.8

/**
 * The video codec, as the upload endpoint names it — or `null`.
 *
 * ## The browser exposes no codec API, so this reads the container
 *
 * Ported from legacy's `utils/videoCodec.js`, whose own header states the contract: the backend
 * requires the field and accepts `'H.264' | 'H.265' | null`, matching what iOS reads from
 * `AVAsset.codecs`. What is available in a browser is the sample-entry 4CC in the file's bytes.
 *
 * **H.265 is checked first and that ordering is load-bearing**: an HEVC mp4 can carry `avc1` as a
 * *compatible brand* in its header, so a scan that matched `avc1` first would label every iPhone
 * recording H.264.
 *
 * Both ends of the file are scanned because `moov` — the box the sample entry lives in — sits at
 * the front of a streaming-optimised mp4 and at the **end** of a QuickTime recording.
 */
export async function readVideoCodec(file: Blob): Promise<string | null> {
    try {
        const parts = [file.slice(0, CODEC_SCAN_BYTES)]
        if (file.size > CODEC_SCAN_BYTES) parts.push(file.slice(file.size - CODEC_SCAN_BYTES))

        for (const part of parts) {
            const text = toLatin1(new Uint8Array(await part.arrayBuffer()))
            const match = CODEC_SIGNATURES.find(({ fourcc }) => text.includes(fourcc))
            if (match) return match.codec
        }
        return null
    } catch {
        // `null` is a value this field accepts, so a failure to read is not a failure to upload.
        return null
    }
}

/** H.265 first — see the note above. */
const CODEC_SIGNATURES = [
    { fourcc: 'hvc1', codec: 'H.265' },
    { fourcc: 'hev1', codec: 'H.265' },
    { fourcc: 'avc1', codec: 'H.264' },
] as const

const CODEC_SCAN_BYTES = 2 * 1024 * 1024
const DECODE_CHUNK = 32 * 1024

/**
 * Bytes to a searchable string, in chunks.
 *
 * `String.fromCharCode(...bytes)` on two megabytes overflows the argument limit and throws, which is
 * why legacy chunks it and why this does too.
 */
function toLatin1(bytes: Uint8Array): string {
    let text = ''
    for (let i = 0; i < bytes.length; i += DECODE_CHUNK) {
        text += String.fromCharCode(...bytes.subarray(i, i + DECODE_CHUNK))
    }
    return text
}
