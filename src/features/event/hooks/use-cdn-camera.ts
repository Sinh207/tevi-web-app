'use client'

import { useEffect, useState } from 'react'

/**
 * The longest the payload and the picture may disagree before the payload is believed anyway. A
 * backstop for a wrong reading — a live camera pointed at a perfectly still wall reads as a still
 * — not the normal path, which is the picture catching up.
 */
export const CDN_CAMERA_MAX_HOLD_MS = 15_000

/**
 * Used only when the picture cannot be read at all (`pictureAlive` stays `null`): a rendition
 * served without CORS cannot be sampled, so the flag falls back to a fixed lag — HTTP-FLV's usual
 * delay, erring long. Wrong on HLS, but better than flipping at once.
 */
export const CDN_CAMERA_FALLBACK_LAG_MS = 3000

/**
 * **Is the camera on, as the viewer's picture shows it** — the CDN path's answer to `videoUids`.
 *
 * Two sources, and they run seconds apart: `payloadVideo` is the room payload, which the socket
 * updates the moment the host toggles their camera; `pictureAlive` is what the frames on screen
 * are doing (`lib/picture-activity.ts`), which is the rendition, seconds behind. The displayed
 * state moves **only when the two agree**:
 *
 * - payload off, picture still moving → the stream has not caught up; keep showing the video;
 * - payload on, picture still dead → the camera is coming back but not here yet; keep the avatar;
 * - they agree → follow.
 *
 * A disagreement that outlives `CDN_CAMERA_MAX_HOLD_MS` resolves to the payload. `pictureAlive`
 * of `null` (not sampled yet, paused, or unreadable) follows the payload after the fallback lag.
 */
export function useCdnCamera(payloadVideo: boolean, pictureAlive: boolean | null): boolean {
    const [shown, setShown] = useState(payloadVideo)

    useEffect(() => {
        if (shown === payloadVideo && (pictureAlive === null || pictureAlive === payloadVideo)) {
            return
        }
        if (pictureAlive === payloadVideo) {
            setShown(payloadVideo)
            return
        }
        const wait = pictureAlive === null ? CDN_CAMERA_FALLBACK_LAG_MS : CDN_CAMERA_MAX_HOLD_MS
        const timer = setTimeout(() => setShown(payloadVideo), wait)
        return () => clearTimeout(timer)
    }, [payloadVideo, pictureAlive, shown])

    return shown
}
