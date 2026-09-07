import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { MY_WALLET_ART } from './illustrations'

/** See `features/my-star/lib/illustrations.test.ts` — same reasoning, different art. */
describe('my-wallet illustrations', () => {
    it('ships the empty state as a committed WebP', () => {
        const art = committedArt(MY_WALLET_ART.empty.src)
        expect(art.isLocal).toBe(true)
        expect(art.isDeclaredFormat).toBe(true)
        expect(art.bytes).toBeGreaterThan(512)
    })

    it('declares legacy’s box', () => {
        expect(MY_WALLET_ART.empty.width).toBe(225)
        expect(MY_WALLET_ART.empty.height).toBe(256)
    })
})
