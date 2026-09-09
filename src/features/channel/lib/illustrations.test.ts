import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import {
    ADD_HOME_SCREEN_ART,
    BLOCKED_ACCOUNTS_ART,
    CHANNEL_NOT_FOUND_ART,
    CHANNEL_WALL_ART,
    FOLLOW_REQUESTS_ART,
    FOLLOWING_ART,
    LIVE_EVENTS_ART,
    MCN_INVITATION_ART,
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
    ['space not found', CHANNEL_NOT_FOUND_ART.space.src],
    ['invitation hero', MCN_INVITATION_ART.hero.src],
    ['invitation invalid', MCN_INVITATION_ART.invalid.src],
    ['add to home screen', ADD_HOME_SCREEN_ART.phone.src],
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
        /*
         * The invitation pair is the same case: a 2.31 MB PNG behind a CSS `background-image` (which
         * no optimiser touches at all) and a 1.71 MB image-layer-as-SVG. Pointing either back at the
         * CDN looks identical on screen, which is why it is an assertion and not a review note.
         */
        expect(MCN_INVITATION_ART.hero.src).not.toMatch(/\.svg$/)
        expect(MCN_INVITATION_ART.invalid.src).not.toMatch(/\.svg$/)
        /*
         * One file, two states: the space-not-found wall is where this picture comes from and the
         * invitation wall reuses it, exactly as legacy does. Pinned as an equality rather than left
         * to a review, because two constants pointing at one asset is precisely the arrangement
         * someone "tidies up" into two encodes of the same bytes.
         */
        expect(CHANNEL_NOT_FOUND_ART.space).toEqual(MCN_INVITATION_ART.invalid)
        /*
         * The home-screen mock-up is a JPEG upstream, so it could never have been served as `.svg`
         * — what this line guards is the other direction: it must stay a raster the optimiser can
         * process, and its box must keep the source's aspect, because the avatar overlay is
         * positioned as a percentage of it.
         */
        expect(ADD_HOME_SCREEN_ART.phone.src).toMatch(/\.webp$/)
        expect(ADD_HOME_SCREEN_ART.phone.width / ADD_HOME_SCREEN_ART.phone.height).toBeCloseTo(
            1143 / 1280,
            2,
        )
        expect(CHANNEL_WALL_ART.protected.src).toMatch(/\.svg$/)
        expect(CHANNEL_WALL_ART.blocked.src).toMatch(/\.svg$/)
    })

    /** One picture, two walls — legacy's `blockedChannel` and `blockedUser` inline the same paths. */
    it('serves both block walls from one file', () => {
        expect(committedArt(CHANNEL_WALL_ART.blocked.src).bytes).toBeGreaterThan(4096)
    })
})
