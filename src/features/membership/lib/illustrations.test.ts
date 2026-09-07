import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import {
    MEMBERSHIP_IDENTITY_ART,
    MEMBERSHIP_JOIN_ART,
    MEMBERSHIP_TIER_BG,
    MY_MEMBERSHIP_ART,
} from './illustrations'

/**
 * Every piece of this feature's art is committed (`pnpm art:cdn`), and two of them are here because
 * a byte budget would have passed them:
 *
 * - `MEMBERSHIP_TIER_BG` is a CSS `background-image`, so `next/image` never sees it — no AVIF, no
 *   responsive widths, the browser fetches exactly this file.
 * - the two identity strips were 3.0 and 3.2 KB. Small, and still a third host between a rendering
 *   screen and its picture.
 */
const ART = [
    ['empty state', MY_MEMBERSHIP_ART.empty.src],
    ['join tile', MEMBERSHIP_JOIN_ART],
    ['tier backdrop', MEMBERSHIP_TIER_BG],
    ['live-chat strip', MEMBERSHIP_IDENTITY_ART.liveChat.src],
    ['post-comments strip', MEMBERSHIP_IDENTITY_ART.postComments.src],
] as const

describe('membership illustrations', () => {
    it.each(ART)('%s is committed, in the format it claims', (_name, src) => {
        const art = committedArt(src)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it.each(ART)('%s is served from our own origin', (_name, src) => {
        expect(committedArt(src).isLocal).toBe(true)
    })

    /**
     * The empty state points at `features/earnings`' copy rather than a second one — same asset, same
     * bytes, one entry in `public/`. The join tile is a *different* Theo and gets its own file.
     */
    it('shares the theo-search vector and keeps the join tile separate', () => {
        expect(MY_MEMBERSHIP_ART.empty.src).toBe('/illustrations/theo-search.svg')
        expect(MEMBERSHIP_JOIN_ART).not.toBe(MY_MEMBERSHIP_ART.empty.src)
    })
})
