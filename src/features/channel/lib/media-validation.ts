import {
    IMAGE_MAX_BYTES,
    IMAGE_TYPES,
    VIDEO_MAX_BYTES,
    VIDEO_MAX_SECONDS,
    VIDEO_TYPES,
} from './profile-form'

/**
 * What the browser can tell about a picked file before anything is uploaded.
 *
 * Every function here returns a **translation key** rather than a sentence, for the reason
 * `lib/auth-error.ts` gives: the message is the screen's to phrase and the locale's to translate,
 * and a helper that returns English has already decided both.
 *
 * ## Why the checks are here and not at the input's `accept`
 *
 * `accept` is a filter on the file dialog, not a rule — it is trivially bypassed by dragging a
 * file in, by a mobile picker that ignores it, and by "All files" in the dialog itself. Legacy
 * validates in JS for the same reason and this keeps that. The backend checks again; this exists
 * so a 6 MB photo is refused in a millisecond instead of after 6 MB of upload.
 */

/** Why this image cannot be used, or `null`. Type first — a wrong type is not "too large". */
export function imageFileError(file: File): string | null {
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'profile_image_wrong_type'
    if (file.size > IMAGE_MAX_BYTES) return 'profile_image_too_large'
    return null
}

/**
 * Why this video cannot be used, or `null` — **type and size only**.
 *
 * Duration is not here because it is not knowable synchronously: it needs the file decoded far
 * enough to have metadata, which is `readVideoMeta`'s job. Splitting them means the cheap
 * rejections happen before a decode is even attempted.
 */
export function videoFileError(file: File): string | null {
    if (!file.type.startsWith('video/')) return 'profile_video_wrong_type'
    if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) return 'profile_video_wrong_type'
    if (file.size > VIDEO_MAX_BYTES) return 'profile_video_too_large'
    return null
}

export interface VideoMeta {
    width: number
    height: number
    /** Seconds, to two decimals. */
    duration: number
}

/**
 * Read a video's dimensions and length.
 *
 * `preload="metadata"` and nothing else: this needs the header, not the file, and on a 50 MB clip
 * the difference is the whole decode. `muted` + `playsInline` because some engines refuse to load
 * anything for a video element that could autoplay with sound.
 *
 * The object URL is revoked on **every** exit path — resolve, reject and error alike. A leaked
 * blob URL holds the entire file in memory until the tab closes, and this runs once per attempt
 * on a screen where people retry.
 */
export function readVideoMeta(file: File): Promise<VideoMeta> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.muted = true
        video.playsInline = true

        const done = (action: () => void) => {
            URL.revokeObjectURL(url)
            video.removeAttribute('src')
            video.load()
            action()
        }

        video.onloadedmetadata = () => {
            const meta: VideoMeta = {
                width: Number(video.videoWidth) || 0,
                height: Number(video.videoHeight) || 0,
                duration: Number(Number(video.duration || 0).toFixed(2)),
            }
            done(() => resolve(meta))
        }
        video.onerror = () => done(() => reject(new Error('Video metadata unavailable')))
        video.src = url
    })
}

/** Whether a clip is short enough to be an avatar. Its own function because the copy differs. */
export function isVideoTooLong(meta: VideoMeta): boolean {
    return meta.duration > VIDEO_MAX_SECONDS
}

/**
 * Grab a still from a video, to serve as the avatar wherever the clip is not playing.
 *
 * ## The poster is not optional
 *
 * `Channel.images.thumb` is what every surface in this app renders — the nav avatar, comment
 * rows, the account switcher — and `AnimatedAvatar` only plays the clip where a `<video>` is
 * appropriate and allowed. So a channel that had a video uploaded without a poster shows a
 * placeholder everywhere except its own header. Legacy uploads both for the same reason, and
 * `save` refuses to write `avatar_video` unless both URLs came back.
 *
 * The frame is taken at **0.1s** rather than 0: the first frame of an encoded clip is routinely
 * black or a keyframe artefact, and a tenth of a second in is past that on every real recording
 * while still being before anything has happened.
 *
 * Resolves `null` rather than throwing when the frame cannot be drawn — most often a
 * cross-origin taint, which cannot happen for a local `File` but can if this is ever pointed at
 * a remote URL. The caller treats it as "no poster", which is a refused upload rather than a
 * crash.
 */
export function captureVideoPoster(file: File, atSeconds = 0.1): Promise<Blob | null> {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file)
        const video = document.createElement('video')
        video.preload = 'auto'
        video.muted = true
        video.playsInline = true
        video.crossOrigin = 'anonymous'

        const finish = (blob: Blob | null) => {
            URL.revokeObjectURL(url)
            video.removeAttribute('src')
            video.load()
            resolve(blob)
        }

        video.onloadeddata = () => {
            // Seeking past the end of a very short clip never fires `seeked`, so it is clamped
            // into the clip rather than trusted.
            const target = Math.min(atSeconds, Math.max(0, (video.duration || 0) - 0.05))
            video.currentTime = target
        }

        video.onseeked = () => {
            try {
                const canvas = document.createElement('canvas')
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
                const context = canvas.getContext('2d')
                if (!context || !canvas.width || !canvas.height) return finish(null)
                context.drawImage(video, 0, 0)
                canvas.toBlob(blob => finish(blob), 'image/jpeg', 0.9)
            } catch {
                finish(null)
            }
        }

        video.onerror = () => finish(null)
        video.src = url
    })
}
