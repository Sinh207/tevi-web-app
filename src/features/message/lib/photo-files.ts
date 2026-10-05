/**
 * The photos a reader may attach, and what is done to them before they leave the browser.
 *
 * ## The limits, and whose they are
 *
 * - **Ten per message** — all three clients (legacy `MAX_UPLOAD_IMG`, iOS's picker, Android's
 *   `n/10`). It is also where `photoLayout` stops having a layout.
 * - **JPEG, PNG, WebP.** Legacy's `accept` lists HEIC too, but only Safari can decode one: in any
 *   other browser the thumbnail is a broken image and the compressor below cannot read it. Leaving it
 *   out of `accept` means the picker simply does not offer what could not be shown.
 * - **No size ceiling, a size target.** Neither app refuses a big photo; both re-encode it (iOS to
 *   ~2 MB, Android to 800 KB). This follows legacy's web numbers — over 2 MB, the long edge is
 *   brought to 1920 and the JPEG quality stepped down until it fits.
 */

export const PHOTO_MAX = 10
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',')

const COMPRESS_OVER_BYTES = 2 * 1024 * 1024
const MAX_EDGE = 1920

export type PhotoPickError = 'type' | 'count'

/**
 * Which of `files` may join the `current` ones: the first that fit under the cap, of an accepted
 * type. `error` names why anything was left out — one reason, the type first, because a reader who
 * dropped a PDF among nine photos needs to hear about the PDF.
 */
export function pickPhotos(
    current: number,
    files: readonly File[],
): { accepted: File[]; error: PhotoPickError | null } {
    const typed = files.filter(file => (PHOTO_TYPES as readonly string[]).includes(file.type))
    const room = Math.max(0, PHOTO_MAX - current)
    const accepted = typed.slice(0, room)
    const error: PhotoPickError | null =
        typed.length < files.length ? 'type' : accepted.length < typed.length ? 'count' : null
    return { accepted, error }
}

/** Scale `width × height` down so its long edge is at most `max`; never up. */
export function fitWithin(width: number, height: number, max = MAX_EDGE) {
    const long = Math.max(width, height)
    if (long <= max || long <= 0) return { width, height }
    const scale = max / long
    return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/**
 * The photo to upload: the file itself when it is already small enough, else a re-encoded JPEG.
 * Never rejects — a photo the browser cannot re-encode is sent as picked, which is what legacy does
 * and what the service accepts.
 */
export async function preparePhoto(file: File): Promise<Blob> {
    if (file.size <= COMPRESS_OVER_BYTES || typeof createImageBitmap !== 'function') return file
    try {
        const bitmap = await createImageBitmap(file)
        const size = fitWithin(bitmap.width, bitmap.height)
        const canvas = document.createElement('canvas')
        canvas.width = size.width
        canvas.height = size.height
        const context = canvas.getContext('2d')
        if (!context) return file
        context.drawImage(bitmap, 0, 0, size.width, size.height)
        bitmap.close()
        let best: Blob | null = null
        for (let quality = 0.8; quality >= 0.1; quality -= 0.1) {
            best = await encode(canvas, quality)
            if (!best || best.size <= COMPRESS_OVER_BYTES) break
        }
        return best && best.size < file.size ? best : file
    } catch {
        return file
    }
}
