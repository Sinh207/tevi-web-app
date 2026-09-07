import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import {
    BLOCKED_ACCOUNTS_ART,
    CHANNEL_WALL_ART,
    FOLLOW_REQUESTS_ART,
    FOLLOWING_ART,
    LIVE_EVENTS_ART,
    REPORT_ART,
} from './illustrations'

/**
 * Every picture this feature draws is committed. The fence that matters is the last test: two of the
 * walls were 1.5 MB and 3 MB on the CDN *because* they were `.svg` — a format `next/image` passes
 * through unprocessed — and pointing them back at it looks identical on screen. That is exactly why
 * it needs an assertion rather than a review.
 */
const ART = [
    ['blocked accounts empty', BLOCKED_ACCOUNTS_ART.empty.src],
    ['follow requests empty', FOLLOW_REQUESTS_ART.empty.src],
    ['following empty', FOLLOWING_ART.empty.src],
    ['live events empty', LIVE_EVENTS_ART.empty.src],
    ['wall: suspended', CHANNEL_WALL_ART.suspended.src],
    ['wall: unpublished', CHANNEL_WALL_ART.unpublished.src],
    ['wall: protected', CHANNEL_WALL_ART.protected.src],
    ['wall: blocked', CHANNEL_WALL_ART.blocked.src],
    ['report submitted', REPORT_ART.submitted.src],
] as const

describe('channel illustrations', () => {
    it.each(ART)('%s is committed, in the format it claims', (_name, src) => {
        const art = committedArt(src)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it.each(ART)('%s is served from our own origin', (_name, src) => {
        expect(committedArt(src).isLocal).toBe(true)
    })

    /**
     * The two re-encoded walls must not go back to being SVG. Both were Figma image layers exported
     * as SVG — a base64 PNG in a wrapper — and the whole point of the row in `build-cdn-art.mjs` is
     * that they arrive as raster.
     *
     * The other two are the opposite case and stay `.svg` on purpose: real vector paths, ~11–13 KB,
     * nothing for an optimiser to do.
     */
    it('keeps the re-encoded walls out of SVG, and leaves the vector ones alone', () => {
        expect(CHANNEL_WALL_ART.suspended.src).not.toMatch(/\.svg$/)
        expect(CHANNEL_WALL_ART.unpublished.src).not.toMatch(/\.svg$/)
        expect(CHANNEL_WALL_ART.protected.src).toMatch(/\.svg$/)
        expect(CHANNEL_WALL_ART.blocked.src).toMatch(/\.svg$/)
    })

    /** One picture, two walls — legacy's `blockedChannel` and `blockedUser` inline the same paths. */
    it('serves both block walls from one file', () => {
        expect(committedArt(CHANNEL_WALL_ART.blocked.src).bytes).toBeGreaterThan(4096)
    })
})
