/**
 * Renders the favicon and PWA icons from `design-system/tevi-logo.svg`.
 *
 * Run it by hand after the mark changes; the outputs are committed so neither
 * `pnpm dev` nor CI needs a browser:
 *
 *   node scripts/generate-brand-assets.mjs
 *
 * Outputs
 *   src/app/icon.svg              App Router favicon — vector, any size
 *   src/app/favicon.ico           16/32/48 fallback for clients that ignore SVG
 *   src/app/apple-icon.png        180×180, iOS home screen
 *   public/icons/icon-192.png     PWA, referenced by src/app/manifest.ts
 *   public/icons/icon-512.png     PWA install / splash
 *   public/icons/icon-maskable-512.png
 *   public/icons/startup/*.png    iOS launch images, light + dark per size class
 *
 * The maskable variant is drawn separately, not resized from the others:
 * Android crops it to a circle or squircle, so the mark has to sit inside the
 * 80% safe zone on a full-bleed background rather than in a rounded square that
 * would get its corners shaved off.
 */
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

const SOURCE = 'design-system/tevi-logo.svg'
const PRIMARY_500 = '#501BC0'
/** Android crops maskable icons to the outer 20%; keep the mark inside 80%. */
const MASKABLE_SAFE_ZONE = 0.8

/**
 * iOS launch images — see `src/shared/config/startup-images.ts`, which holds the same table and
 * turns it into the `<link>` tags. **The two are kept in step by `startup-images.test.ts`**,
 * because nothing else connects a `.mjs` generator to a `.ts` config.
 *
 * The mark alone, centred, on `--background` in each mode. No wordmark: the "Tevi" lettering is
 * live text in the Chella font and there is no asset for it (`docs/DESIGN_SYSTEM.md`), so
 * rasterising one here would be inventing brand — and a launch image is the one place where a
 * wrong one could not be corrected by a later paint.
 */
const STARTUP_DEVICES = [
    { width: 375, height: 667, ratio: 2 },
    { width: 390, height: 844, ratio: 3 },
    { width: 393, height: 852, ratio: 3 },
    { width: 402, height: 874, ratio: 3 },
    { width: 428, height: 926, ratio: 3 },
    { width: 430, height: 932, ratio: 3 },
    { width: 440, height: 956, ratio: 3 },
]
/** `--background` in each mode: `--zinc-100` light, `--black` dark. */
const STARTUP_BACKGROUNDS = { light: '#f4f4f5', dark: '#000000' }
/** CSS px. The web splash draws the mark at 64; a launch image is a whole screen. */
const STARTUP_MARK = 128

const svg = readFileSync(SOURCE, 'utf8')
const marks = [...svg.matchAll(/<path[^>]*\/>/g)].map(m => m[0]).join('\n')
if (!marks) throw new Error(`no <path> found in ${SOURCE}`)

function page(size, { maskable = false } = {}) {
    const inset = maskable ? (size * (1 - MASKABLE_SAFE_ZONE)) / 2 : 0
    const markSize = size - inset * 2
    const background = maskable
        ? `<rect width="${size}" height="${size}" fill="${PRIMARY_500}"/>`
        : `<rect width="${size}" height="${size}" rx="${size / 4}" fill="${PRIMARY_500}"/>`
    return `<!doctype html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block">
  ${background}
  <g transform="translate(${inset} ${inset}) scale(${markSize / 48})">${marks}</g>
</svg></body>`
}

/**
 * Packs PNGs into an .ico. The format predates PNG, but every target since
 * Vista reads PNG-payload entries, and that avoids hand-rolling a BMP encoder.
 * Layout: 6-byte ICONDIR, one 16-byte ICONDIRENTRY each, then the payloads.
 */
function ico(images) {
    const HEADER = 6
    const ENTRY = 16
    const PNG_COLOR_TYPE_RGBA = 6

    for (const { size, data } of images) {
        // Turbopack decodes .ico with the Rust `image` crate, which accepts a
        // PNG payload only in RGBA — anything else fails the dev build with
        // "The PNG is not in RGBA format!". Webpack is lenient, so `pnpm build`
        // alone will not catch this. Colour type is IHDR byte 25.
        if (data[25] !== PNG_COLOR_TYPE_RGBA) {
            throw new Error(
                `favicon payload at ${size}px is PNG colour type ${data[25]}, need ${PNG_COLOR_TYPE_RGBA} (RGBA)`,
            )
        }
    }

    const dir = Buffer.alloc(HEADER + ENTRY * images.length)
    dir.writeUInt16LE(0, 0) // reserved
    dir.writeUInt16LE(1, 2) // 1 = icon
    dir.writeUInt16LE(images.length, 4)

    let offset = dir.length
    images.forEach(({ size, data }, i) => {
        const at = HEADER + ENTRY * i
        dir.writeUInt8(size >= 256 ? 0 : size, at) // 0 means 256
        dir.writeUInt8(size >= 256 ? 0 : size, at + 1)
        dir.writeUInt8(0, at + 2) // palette size — 0 for truecolour
        dir.writeUInt8(0, at + 3) // reserved
        dir.writeUInt16LE(1, at + 4) // colour planes
        dir.writeUInt16LE(32, at + 6) // bits per pixel
        dir.writeUInt32LE(data.length, at + 8)
        dir.writeUInt32LE(offset, at + 12)
        offset += data.length
    })

    return Buffer.concat([dir, ...images.map(i => i.data)])
}

const browser = await chromium.launch()

/**
 * `omitBackground` keeps an alpha channel so Chromium writes colour type 6
 * (RGBA) rather than 2 (RGB) — which the .ico payloads require, see ico().
 * The rounded mark has transparent corners either way, so the pixels are
 * unchanged; a full-bleed render with no transparent pixel at all still comes
 * back as RGB, and that is fine for a standalone PNG.
 */
async function render(size, opts) {
    const ctx = await browser.newContext({ viewport: { width: size, height: size } })
    const p = await ctx.newPage()
    await p.setContent(page(size, opts))
    const buffer = await p.locator('svg').screenshot({ omitBackground: true })
    await ctx.close()
    return buffer
}

async function png(path, size, opts) {
    writeFileSync(path, await render(size, opts))
    console.log(`  ${path} — ${size}×${size}`)
}

/**
 * A full-screen launch image. Rendered at CSS size with `deviceScaleFactor`, so the output is
 * the device's real pixel dimensions — which is what iOS matches on, and it rejects anything
 * off by a pixel.
 *
 * Screenshotting the page rather than the `<svg>`, because the background *is* most of the
 * image here; and without `omitBackground`, so the fill is opaque rather than alpha.
 */
async function startupPng(path, { width, height, ratio }, background) {
    const ctx = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: ratio,
    })
    const p = await ctx.newPage()
    await p.setContent(`<!doctype html><body style="margin:0;background:${background}">
<div style="width:100vw;height:100vh;display:flex;align-items:center;justify-content:center">
<svg xmlns="http://www.w3.org/2000/svg" width="${STARTUP_MARK}" height="${STARTUP_MARK}" viewBox="0 0 48 48" style="display:block">
  <rect width="48" height="48" rx="12" fill="${PRIMARY_500}"/>
  ${marks}
</svg></div></body>`)
    writeFileSync(path, await p.screenshot())
    await ctx.close()
    console.log(`  ${path} — ${width * ratio}×${height * ratio}`)
}

mkdirSync('public/icons', { recursive: true })

// The favicon stays vector: one file, sharp at every size, ~1 KB.
writeFileSync('src/app/icon.svg', svg)
console.log('  src/app/icon.svg — vector')

// …with an .ico beside it for clients that ignore SVG favicons. Next emits a
// link for each; browsers that understand both prefer the vector.
rmSync('src/app/favicon.ico', { force: true })
const sizes = [16, 32, 48]
writeFileSync(
    'src/app/favicon.ico',
    ico(await Promise.all(sizes.map(async size => ({ size, data: await render(size) })))),
)
console.log(`  src/app/favicon.ico — ${sizes.join('/')}`)

await png('src/app/apple-icon.png', 180)
await png('public/icons/icon-192.png', 192)
await png('public/icons/icon-512.png', 512)
await png('public/icons/icon-maskable-512.png', 512, { maskable: true })

// Re-created rather than overwritten: dropping a device from the table above should remove its
// images, not leave two orphans that `startup-images.test.ts` has no reason to look at.
rmSync('public/icons/startup', { recursive: true, force: true })
mkdirSync('public/icons/startup', { recursive: true })
for (const device of STARTUP_DEVICES) {
    for (const [scheme, background] of Object.entries(STARTUP_BACKGROUNDS)) {
        const name = `${scheme}-${device.width}x${device.height}@${device.ratio}x.png`
        await startupPng(`public/icons/startup/${name}`, device, background)
    }
}

await browser.close()
