import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import en from '@shared/i18n/locales/en/translation.json'
import { committedArt } from '@shared/lib/committed-art'
import { describe, expect, it } from 'vitest'
import {
    BRAND_COLORS,
    BRAND_PAIRINGS,
    BUTTON_ASSETS,
    BUTTON_PACK,
    buttonAssetUrl,
    LOGO_PACK,
    LOGO_PACK_CONTENTS,
    LOGO_PREVIEWS,
} from './brand-assets'

/**
 * The page is data plus a translation key per string, and both halves fail quietly: a hex
 * with a typo copies a colour that is not ours, a `*Key` with a typo renders the key itself
 * on a public page, and an intrinsic size that does not match the file reflows the grid the
 * moment the image lands. None of it needs a browser to check.
 *
 * The files in `public/` are checked as files, not as strings: they are the deliverable —
 * a brand page whose download 404s is worse than no brand page.
 */

const PUBLIC = join(process.cwd(), 'public')
const ALL_COLORS = [...BRAND_COLORS, ...BRAND_PAIRINGS]
const keys = en as Record<string, string>

/** PNG intrinsic size, straight out of the IHDR chunk (bytes 16–24, big-endian). */
function pngSize(path: string) {
    const header = readFileSync(path).subarray(0, 24)
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
}

describe('brand assets content', () => {
    it('names every string through a key that exists in English', () => {
        const used = [
            'brand_assets_meta_title',
            'brand_assets_meta_description',
            'brand_assets_intro',
            'brand_assets_tabs_label',
            'brand_assets_tab_logo',
            'brand_assets_tab_button',
            'brand_assets_tab_color',
            'brand_assets_preview',
            'brand_assets_logo_pack_includes',
            'brand_assets_download_logo_pack',
            'brand_assets_download_size',
            'brand_assets_logo_preview_note',
            'brand_assets_logo_alt',
            'brand_assets_button_pack',
            'brand_assets_button_pack_desc',
            'brand_assets_download_button_pack',
            'brand_assets_button_download_hint',
            'brand_assets_buttons_group_button',
            'brand_assets_buttons_group_badge',
            'brand_assets_button_alt',
            'brand_assets_color_heading',
            'brand_assets_color_desc',
            'brand_assets_pairings_heading',
            'brand_assets_pairings_desc',
            'brand_assets_copy_hex',
            'brand_assets_copied',
            'brand_assets_copy_failed',
            ...LOGO_PREVIEWS.map(preview => preview.labelKey),
            ...LOGO_PACK_CONTENTS.flatMap(item => [item.leadKey, item.textKey]),
            ...BUTTON_ASSETS.map(asset => asset.labelKey),
            ...ALL_COLORS.flatMap(color => [color.nameKey, color.moodKey]),
        ]
        for (const key of used) {
            expect(keys[key], key).toBeTruthy()
        }
    })

    it('interpolates with the placeholders the components pass', () => {
        expect(keys.brand_assets_logo_alt).toContain('{{variant}}')
        expect(keys.brand_assets_button_alt).toContain('{{name}}')
        expect(keys.brand_assets_download_size).toContain('{{size}}')
        for (const key of [
            'brand_assets_copy_hex',
            'brand_assets_copied',
            'brand_assets_copy_failed',
        ])
            expect(keys[key]).toContain('{{hex}}')
    })

    it('publishes seven distinct colours as uppercase six-digit hexes', () => {
        expect(ALL_COLORS).toHaveLength(7)
        const ids = ALL_COLORS.map(color => color.id)
        expect(new Set(ids).size).toBe(ids.length)
        const hexes = ALL_COLORS.map(color => color.hex)
        expect(new Set(hexes).size).toBe(hexes.length)
        for (const hex of hexes) {
            // The string is what a creator pastes into a design tool — no shorthand, no
            // lowercase drift between the swatch and the clipboard.
            expect(hex).toMatch(/^#[0-9A-F]{6}$/)
        }
    })

    it('keeps Royal Indigo equal to Primary 500 — the one brand colour with a token twin', () => {
        const royalIndigo = BRAND_COLORS.find(color => color.id === 'royal-indigo')
        const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
        expect(royalIndigo?.hex.toLowerCase()).toBe('#501bc0')
        expect(globals).toContain('--primary-500: #501bc0')
    })

    it('serves both archives from public/download under legacy’s URLs', () => {
        for (const pack of [LOGO_PACK, BUTTON_PACK]) {
            expect(pack.href).toBe(`/download/${pack.file}`)
            const bytes = readFileSync(join(PUBLIC, 'download', pack.file))
            // `PK\x03\x04` — a real archive, not an LFS pointer or an HTML error page.
            expect(bytes.subarray(0, 4).toString('latin1')).toBe('PK')
            expect(Math.round(bytes.length / 1024)).toBeCloseTo(pack.sizeKb, -1)
        }
    })

    it('ships nine button images whose declared size is the file’s own', () => {
        expect(BUTTON_ASSETS).toHaveLength(9)
        const ids = BUTTON_ASSETS.map(asset => asset.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const asset of BUTTON_ASSETS) {
            expect(buttonAssetUrl(asset)).toBe(`/brand-assets/buttons/${asset.file}`)
            // The names are the ones inside buttons_support.zip: an individual download and
            // the same file out of the pack must not differ.
            expect(asset.file).toMatch(/^support_me_on_tevi_[a-z_]+\.png$/)
            const { width, height } = pngSize(join(PUBLIC, 'brand-assets', 'buttons', asset.file))
            expect({ id: asset.id, width, height }).toEqual({
                id: asset.id,
                width: asset.width,
                height: asset.height,
            })
        }
    })

    it('draws six wide buttons and three badges, at those two aspects', () => {
        const buttons = BUTTON_ASSETS.filter(asset => asset.shape === 'button')
        const badges = BUTTON_ASSETS.filter(asset => asset.shape === 'badge')
        expect(buttons).toHaveLength(6)
        expect(badges).toHaveLength(3)
        for (const asset of buttons) expect(asset.width / asset.height).toBeGreaterThan(3)
        for (const asset of badges) expect(asset.width / asset.height).toBeLessThan(2)
    })

    it('serves the lockup previews from our own origin, as committed vectors', () => {
        expect(LOGO_PREVIEWS).toHaveLength(3)
        for (const preview of LOGO_PREVIEWS) {
            // Brand's own files, copied byte for byte by `pnpm art:cdn` — no static art is fetched
            // from the CDN any more (`docs/STATIC_ASSETS.md`). Vectors, so nothing was re-encoded.
            expect(preview.src).toMatch(/^\/illustrations\/brand-assets\/logo-[123]\.svg$/)
            const file = committedArt(preview.src)
            expect(file.isLocal).toBe(true)
            expect(file.isDeclaredFormat).toBe(true)
            expect(preview.width).toBe(634)
            expect(preview.height).toBe(440)
        }
    })

    it('describes the pack in three bullets, each with a lead', () => {
        expect(LOGO_PACK_CONTENTS).toHaveLength(3)
        for (const { leadKey, textKey } of LOGO_PACK_CONTENTS) {
            expect(keys[leadKey].endsWith(':')).toBe(true)
            expect(keys[textKey].endsWith(':')).toBe(false)
        }
    })
})
