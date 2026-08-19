import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STARTUP_DEVICES, STARTUP_IMAGES, STARTUP_SCHEMES } from './startup-images'

/**
 * The device table lives twice — here, and in `scripts/generate-brand-assets.mjs`, because a
 * `.mjs` generator cannot import a `.ts` config. Nothing at runtime notices when the two drift:
 * an iPhone whose size class lost its image just launches to a white screen, exactly as it did
 * before any of this shipped. These tests are the only thing standing between that and a silent
 * regression — the same job `manifest.test.ts` does for the icons.
 */
const root = process.cwd()

describe('iOS startup images', () => {
    it('declares one image per size class per scheme', () => {
        expect(STARTUP_IMAGES).toHaveLength(STARTUP_DEVICES.length * STARTUP_SCHEMES.length)
    })

    it.each(STARTUP_IMAGES.map(i => i.url))('%s exists in public/', url => {
        expect(existsSync(join(root, 'public', url))).toBe(true)
    })

    it('qualifies every entry by scheme — an unqualified one would win everywhere', () => {
        // iOS takes the *last* matching link, so a bare light entry after the dark one would be
        // served to a dark device too. Every entry naming its scheme is what prevents that.
        for (const image of STARTUP_IMAGES) {
            expect(image.media).toMatch(/\(prefers-color-scheme: (light|dark)\)/)
        }
    })

    it('matches the generator’s device table', () => {
        // Parsed rather than imported: the generator is `.mjs` and this file is `.ts`. Comparing
        // the dimensions is enough — the filenames are derived from them on both sides, so a
        // mismatch here is exactly the case where the links point at files that were never
        // rendered.
        const script = readFileSync(join(root, 'scripts/generate-brand-assets.mjs'), 'utf8')
        const table = script.slice(
            script.indexOf('const STARTUP_DEVICES'),
            script.indexOf('const STARTUP_BACKGROUNDS'),
        )
        const generated = [...table.matchAll(/width: (\d+), height: (\d+), ratio: (\d+)/g)].map(
            m => `${m[1]}x${m[2]}@${m[3]}x`,
        )

        expect(generated).toEqual(STARTUP_DEVICES.map(d => `${d.width}x${d.height}@${d.ratio}x`))
    })
})
