import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { PAYOUT_ART } from './illustrations'

/**
 * See `features/my-wallet/lib/illustrations.test.ts` — same reasoning, different art.
 *
 * Both halves matter and fail differently: a `src` that went back to the CDN is the regression
 * `pnpm art:audit` exists for, and a truncated write is what a bare existence check would pass.
 */
describe('payout illustrations', () => {
    it('ships the empty state as a committed WebP', () => {
        const art = committedArt(PAYOUT_ART.empty.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it('ships the three setup illustrations as committed WebP', () => {
        // Two explainer panels and the VAI banner. Each replaces a ~2 MB cross-origin PNG that
        // legacy drew into a 264-wide slot — `pnpm art:audit` is what stops one going back.
        for (const art of [
            PAYOUT_ART.chooseLocation,
            PAYOUT_ART.methodsInfo,
            PAYOUT_ART.vaiWalletBanner,
        ]) {
            const file = committedArt(art.src)
            expect(file.isLocal).toBe(true)
            expect(file.isDeclaredFormat).toBe(true)
            expect(file.bytes).toBeGreaterThan(512)
        }
    })

    it('declares the drawn box, not the file’s pixels', () => {
        /*
         * The file is 380×432 (a 2× asset); these are the CSS pixels it is meant to occupy, and
         * legacy's own width. `ChannelEmptyState` caps at `width`, so getting this wrong renders the
         * art at twice its intended size — which is exactly what happened first time.
         */
        expect(PAYOUT_ART.empty.width).toBe(190)
        expect(PAYOUT_ART.empty.height).toBe(216)

        // Legacy's own desktop boxes, and each is its source's 3:2 — so nothing is squashed.
        expect(PAYOUT_ART.chooseLocation.width).toBe(264)
        expect(PAYOUT_ART.chooseLocation.height).toBe(176)
        expect(PAYOUT_ART.methodsInfo.width).toBe(229)
        expect(PAYOUT_ART.methodsInfo.height).toBe(153)
    })
})
