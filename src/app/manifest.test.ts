import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from './manifest'

/**
 * The manifest shipped for months pointing at `/icon.png`, which never existed —
 * nothing failed, the PWA just installed with a blank icon. These tests make a
 * missing or drifted brand asset a red test instead of a silent one.
 */
const root = process.cwd()

describe('web app manifest', () => {
    const icons = manifest().icons ?? []

    it('declares icons', () => {
        expect(icons.length).toBeGreaterThan(0)
    })

    it.each(icons.map(i => i.src))('%s exists in public/', src => {
        expect(existsSync(join(root, 'public', src))).toBe(true)
    })

    it('ships a maskable icon — Android crops anything else', () => {
        expect(icons.some(i => i.purpose === 'maskable')).toBe(true)
    })

    it('uses the brand purple as theme colour', () => {
        // --primary-500, the one ramp step that does not invert between modes.
        expect(manifest().theme_color?.toLowerCase()).toBe('#501bc0')
    })

    it('splashes on the same fill the in-app splash uses', () => {
        // The OS paints `background_color` before any CSS runs, then `Splash` takes over on
        // `--background`. Drift between the two is a visible step on every cold start of an
        // installed app, and nothing else would catch it — so the light value of the token is
        // read out of globals.css rather than repeated here.
        // `--background: var(--zinc-100)` in both modes; the *first* declaration in the file is
        // the `:root` (light) one, which is the branch the manifest commits to.
        const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
        const lightZinc100 = css.match(/--zinc-100:\s*(#[0-9a-f]{3,8})/i)?.[1]

        expect(lightZinc100).toBeDefined()
        expect(manifest().background_color?.toLowerCase()).toBe(lightZinc100?.toLowerCase())
    })
})

describe('favicon', () => {
    it('is the design-system mark, byte for byte', () => {
        const source = readFileSync(join(root, 'design-system/tevi-logo.svg'), 'utf8')
        const favicon = readFileSync(join(root, 'src/app/icon.svg'), 'utf8')
        expect(favicon).toBe(source)
    })

    it('ships an .ico fallback that is ours, not the Next.js scaffold', () => {
        const ico = readFileSync(join(root, 'src/app/favicon.ico'))
        expect(ico.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0])) // ICONDIR, type 1
        expect(ico.readUInt16LE(4)).toBe(3) // 16 / 32 / 48

        // The scaffold icon is a 25931-byte BMP-payload file. Ours embeds PNGs,
        // so the signature is the discriminator that survives a re-render.
        expect(ico.includes(Buffer.from('\x89PNG\r\n\x1a\n', 'binary'))).toBe(true)
        expect(ico.byteLength).toBeLessThan(10_000)
    })

    it('embeds RGBA payloads — Turbopack refuses anything else', () => {
        // `next dev` decodes .ico with the Rust `image` crate and hard-fails on
        // a non-RGBA PNG ("Processing image failed / The PNG is not in RGBA
        // format!"). Webpack accepts it, so `pnpm build` passes and only the
        // dev server breaks. Colour type is IHDR byte 25 of each payload.
        const PNG_COLOR_TYPE_RGBA = 6
        const ico = readFileSync(join(root, 'src/app/favicon.ico'))
        const HEADER = 6
        const ENTRY = 16

        const colorTypes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
            const offset = ico.readUInt32LE(HEADER + ENTRY * i + 12)
            return ico[offset + 25]
        })

        expect(colorTypes).toEqual(colorTypes.map(() => PNG_COLOR_TYPE_RGBA))
    })
})
