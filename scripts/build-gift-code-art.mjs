// Downloads /redeem-gift-code's three illustrations from the CDN and re-encodes them as WebP.
//
// ## Why this script exists
//
// Brand ships the art as **SVG wrappers around embedded PNGs** — Figma's raster export. The
// files are 1.8 MB, 1.6 MB and 600 KB, and none of that weight is vector: `banner.svg` is two
// 564×564 PNGs inside a 451×256 box, and both result illustrations are a single **948×948** PNG
// squeezed into a 190×127 box, i.e. five times the resolution they are ever drawn at.
//
// `next/image` cannot help with any of it: it refuses to process a remote SVG unless
// `dangerouslyAllowSVG` is set for that path, and an SVG is a document that can carry script. So
// the choice is a 1.3 MB (gzipped) decorative download on a screen whose whole function is a text
// input, or a re-encode. This is the re-encode: same art, same composition, nothing redrawn and
// nothing substituted — just a raster format at the resolution it is displayed at.
//
// ## How it rasterises, and why not with a native tool
//
// Chromium, through Playwright, which is already a devDependency (`pnpm test:e2e`). It renders the
// SVG at 2× the display box and encodes WebP through `canvas.toDataURL` — so the script needs no
// `librsvg`, no ImageMagick and no `cwebp` on the machine running it. Anyone who can run the E2E
// suite can run this.
//
// ## Runbook
//
//   pnpm art:gift-code          # after Brand replaces any of the three files
//   rm -rf .next/dev/cache/images   # ⚠ or a running dev server keeps serving the old encode
//
// That second line is not optional locally: `next.config.ts` sets `minimumCacheTTL` to 31 days, and
// the optimizer's cache is keyed by URL + width + quality — not by the source file's mtime. So a
// re-encode looks like it did nothing until the cache is dropped (a deploy gets a cold one).
//
// The outputs are **generated but committed** (like `public/tevi-icons.<hash>.svg` and the brand
// icons): builds must not depend on a CDN being reachable, and `features/gift-code/lib/illustrations.ts`
// declares each file's intrinsic box so nothing reflows while the art decodes. `pnpm test` guards
// that the files the module names actually exist.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// `@playwright/test`, not `playwright`: the test runner is the dependency this repo declares, and it
// re-exports the browser launchers.
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public/illustrations/gift-code')

/** Legacy's `IMAGES_STATIC.redeemGiftCode` — the same three files, from the same CDN. */
const CDN = 'https://static.cdn.flowstreamx.com/web/web-app/redeem-gift-code'

/**
 * `box` is the art's own intrinsic size and what the app declares; `render` is the pixel width the
 * file is encoded at — **2× the widest box the layout gives it**, so it stays sharp on a retina
 * screen and not one pixel wider. All three are capped at their intrinsic width by the components
 * (`max-w-[451px]`, `max-w-[190px]`), so 2× intrinsic is the real ceiling: encoding the banner at
 * 1128 (2× the 564 column) bought 25% more bytes for pixels no screen can ask for.
 */
const SOURCES = [
    { name: 'banner', box: { width: 451, height: 256 }, render: 902 },
    { name: 'result-star', box: { width: 190, height: 127 }, render: 380 },
    { name: 'result-premium', box: { width: 190, height: 127 }, render: 380 },
]

/** 0.85 is where these three stop shrinking and start smudging — checked by eye, not assumed. */
const QUALITY = 0.85

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`

async function main() {
    await mkdir(OUT_DIR, { recursive: true })
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto('about:blank')

    for (const { name, box, render } of SOURCES) {
        const url = `${CDN}/${name}.svg`
        const response = await fetch(url)
        if (!response.ok) throw new Error(`${url} → ${response.status}`)
        const svg = await response.text()

        const height = Math.round((render * box.height) / box.width)
        const dataUrl = await page.evaluate(
            async ({ svg, width, height, quality }) => {
                // A data URI, not a blob: an `<img>` loading an SVG cannot reach the network from
                // inside it either way, and this keeps the canvas untainted so `toDataURL` works.
                const src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
                const img = new Image()
                img.width = width
                img.height = height
                await new Promise((resolve, reject) => {
                    img.onload = resolve
                    img.onerror = () => reject(new Error('SVG failed to decode'))
                    img.src = src
                })
                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')
                // Left transparent: the art is cards and shapes on nothing, and painting a white
                // ground under it would put a white rectangle on the dark theme.
                ctx.drawImage(img, 0, 0, width, height)
                return canvas.toDataURL('image/webp', quality)
            },
            { svg, width: render, height, quality: QUALITY },
        )

        if (!dataUrl.startsWith('data:image/webp')) {
            throw new Error(`${name}: Chromium did not encode WebP (got ${dataUrl.slice(0, 24)}…)`)
        }
        const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
        const file = join(OUT_DIR, `${name}.webp`)
        await writeFile(file, bytes)
        console.log(
            `wrote public/illustrations/gift-code/${name}.webp — ${render}×${height}, ` +
                `${kb(bytes.length)} (source SVG ${kb(svg.length)})`,
        )
    }

    await browser.close()
    // Read back so a truncated write cannot pass silently.
    for (const { name } of SOURCES) {
        const file = join(OUT_DIR, `${name}.webp`)
        const data = await readFile(file)
        if (data.length < 1024) throw new Error(`${file} is ${data.length} bytes — that is not art`)
    }
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
