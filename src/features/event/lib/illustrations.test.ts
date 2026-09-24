import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { EVENT_ART } from './illustrations'

/**
 * See `features/payout/lib/illustrations.test.ts` — same reasoning, different art.
 *
 * Both halves matter and fail differently: a `src` that went back to the CDN is the regression
 * `pnpm art:audit` exists for, and a truncated write is what a bare existence check would pass.
 */
describe('event illustrations', () => {
    it('ships the No data panel as a committed WebP', () => {
        const art = committedArt(EVENT_ART.noData.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it.each(['getMembership', 'getPremium'] as const)(
        'ships the channel plate’s %s mark as a committed WebP',
        key => {
            // Over 2 MB each upstream, for a 16px mark.
            const art = committedArt(EVENT_ART[key].src)
            expect(art.isLocal).toBe(true)
            expect(art.isDeclaredFormat).toBe(true)
            expect(art.bytes).toBeGreaterThan(256)
        },
    )

    it('ships the Membership tile crown as a committed WebP', () => {
        // 1.6 MB upstream for a 40px icon — the reason it is here rather than on the CDN.
        const art = committedArt(EVENT_ART.membershipKing.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it('ships the 404 wall as a committed WebP', () => {
        // A 190 KB SVG whose contents are one base64 PNG, upstream. `next/image` passes a remote SVG
        // through unprocessed, which is the whole reason this is rasterised and committed.
        const art = committedArt(EVENT_ART.notFound.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    /** Legacy's draw, and the source's ratio — the file is 306×400, a 2× asset. */
    it('declares the 404 wall at its drawn size', () => {
        expect(EVENT_ART.notFound.width).toBe(153)
        expect(EVENT_ART.notFound.height / EVENT_ART.notFound.width).toBeCloseTo(400 / 306, 2)
    })

    /**
     * The declared box is legacy's **drawn** size (120 wide), not the file's 228. Declaring the
     * file's own width renders the art at nearly twice the size Brand drew it — the trap
     * `PAYOUT_ART.empty` records. The ratio is the source's, so nothing is squashed.
     */
    it('declares the drawn box rather than the file, and keeps the source ratio', () => {
        expect(EVENT_ART.noData.width).toBe(120)
        expect(EVENT_ART.noData.height / EVENT_ART.noData.width).toBeCloseTo(241 / 228, 2)
    })
})
