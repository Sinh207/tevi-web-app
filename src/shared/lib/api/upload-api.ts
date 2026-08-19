import { env } from '@shared/config/env'
import axios from 'axios'
import { createApiModel } from './model'

/**
 * Direct-to-storage uploads: ask Tevi for a pre-signed URL, `PUT` the bytes at Google, keep the
 * public URL the backend hands back.
 *
 * Ported from legacy's `providers/upload` + `models/upload.js`. Two endpoints, both on `/core`:
 *
 * | | endpoint | what the URL is for |
 * |---|---|---|
 * | still image | `v3/upload/generate-gcs-upload-url/` | avatars, covers, video posters |
 * | animated avatar | `v4/animated-avatar/` | the premium looping avatar clip |
 *
 * They answer the same `{ upload_url, serve_url }` pair and differ only in what the backend does
 * with the object afterwards — the animated one is transcoded, which is why it is not just
 * another key on the first endpoint.
 *
 * ## The `PUT` deliberately does **not** go through `apiClient`
 *
 * `apiClient` is safe with a foreign host — `origins.ts` withholds the bearer, the device id, the
 * Turnstile token and the HMAC signature from anything that is not W_API, and `unwrapApiEnvelope`
 * is scoped the same way. So this could use it. It uses a bare instance anyway, for two reasons
 * that are about the *upload* rather than about credentials:
 *
 * - **A pre-signed URL is signed including its query string.** Anything that appends a parameter
 *   invalidates it, and `?verify=` is exactly that. Today the signer checks the origin first; a
 *   bare client means a future change to that rule cannot silently start returning 403s from
 *   Google that read like a backend fault.
 * - **The response body is not JSON and there is nothing to cache.** Running an ETag store, a
 *   304-replay path and an envelope unwrap over a 4 MB `PUT` is work with no possible result.
 *
 * Legacy uses its own bare `axios` here for the same reasons, and this is one of the few places
 * where copying it is right rather than merely familiar.
 */

/** Upload service: `${W_API}/core` — the same base the channel model uses. */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/** No interceptors, no baseURL, no credentials. See the note above. */
const storage = axios.create({
    // A cover photo on a slow connection is a minute of upload, not a request. The API
    // client's 30s would abort a perfectly healthy one.
    timeout: 120_000,
})

/** What both pre-sign endpoints answer, after the response interceptor unwraps `{ data }`. */
interface SignedUpload {
    upload_url?: unknown
    serve_url?: unknown
}

/**
 * A pre-signed pair, or `null` when the body did not carry both halves.
 *
 * `null` rather than a throw with a made-up message: the caller's next line is "so the picture
 * did not upload", and there is exactly one thing to say about that either way.
 */
function readSignedUpload(body: unknown): { uploadUrl: string; serveUrl: string } | null {
    if (!body || typeof body !== 'object') return null
    const { upload_url: uploadUrl, serve_url: serveUrl } = body as SignedUpload
    if (typeof uploadUrl !== 'string' || typeof serveUrl !== 'string') return null
    if (!uploadUrl || !serveUrl) return null
    return { uploadUrl, serveUrl }
}

export interface UploadOptions {
    /** 0–1. Called on every progress event the browser reports. */
    onProgress?: (fraction: number) => void
    signal?: AbortSignal
}

async function put(uploadUrl: string, file: Blob, { onProgress, signal }: UploadOptions = {}) {
    await storage.put(uploadUrl, file, {
        // Google signs the `Content-Type` into the URL, so this must be the type the
        // pre-sign request implied — i.e. the blob's own, not a guess.
        headers: { 'Content-Type': file.type },
        signal,
        onUploadProgress: event => {
            if (!onProgress) return
            // `total` is absent for a chunked body. Reporting nothing beats reporting NaN%.
            if (!event.total) return
            onProgress(Math.min(1, event.loaded / event.total))
        },
    })
}

export const uploadApi = {
    /**
     * Upload a still image and return the URL it will be served from, or `null`.
     *
     * `key` is the object name, and it is the **caller's** to choose because it encodes what the
     * file is: legacy uses `${channelId}-ct-${timestamp}.${ext}` for a thumb and `-cc-` for a
     * cover. The timestamp is not decoration — an avatar written to a stable key would be served
     * from every CDN edge that still had the previous one.
     */
    async uploadImage(key: string, file: Blob, options?: UploadOptions): Promise<string | null> {
        const signed = readSignedUpload(
            await api.post<unknown>('v3/upload/generate-gcs-upload-url/', { key }),
        )
        if (!signed) return null
        await put(signed.uploadUrl, file, options)
        return signed.serveUrl
    },

    /**
     * Upload the premium looping avatar clip and return its playback URL, or `null`.
     *
     * Separate endpoint, separate API version, and the object is transcoded on the way through —
     * so `serve_url` here is a playback URL rather than the bytes that were sent.
     */
    async uploadAnimatedAvatar(
        key: string,
        file: Blob,
        options?: UploadOptions,
    ): Promise<string | null> {
        const signed = readSignedUpload(await api.post<unknown>('v4/animated-avatar/', { key }))
        if (!signed) return null
        await put(signed.uploadUrl, file, options)
        return signed.serveUrl
    },
}
