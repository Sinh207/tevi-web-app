import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import { IDENTITY_ART } from './illustrations'

/**
 * The three are generated-but-committed (`pnpm art:cdn`). Unlike the donation and campaign art these
 * were never a *browser* download — they are rasters, so `next/image` served AVIF — they were 4.1 MB
 * the **optimiser** had to fetch and decode on a cold render, on a KYC screen where somebody is
 * waiting to hear whether they are verified. Pointing one back at the CDN restores that invisibly.
 */
const ART = [
    ['intro', IDENTITY_ART.intro],
    ['pending', IDENTITY_ART.pending],
    ['verified', IDENTITY_ART.verified],
] as const

describe('identification illustrations', () => {
    it.each(ART)('%s is committed, and is a WebP', (_name, art) => {
        const file = committedArt(art.src)
        expect(file.isDeclaredFormat).toBe(true)
        expect(file.bytes).toBeGreaterThan(512)
    })

    it.each(ART)('%s is served from our own origin', (_name, art) => {
        expect(committedArt(art.src).isLocal).toBe(true)
    })

    /**
     * The declared box reserves the layout *and* fixes the encode width — `build-cdn-art.mjs` renders
     * 2× these numbers — so a wrong one here either stretches the art or ships pixels no screen can
     * ask for, and the two failures look nothing alike.
     */
    it.each(ART)('%s declares legacy’s box', (_name, art) => {
        expect(art.width).toBe(300)
        expect(art.height).toBeGreaterThan(0)
    })
})
