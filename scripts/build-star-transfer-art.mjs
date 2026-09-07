// Downloads /star-transfer's two illustrations from the CDN and re-encodes them as WebP.
//
// ## Why
//
// Brand ships them as **SVG wrappers around one embedded PNG each** — Figma's raster export, so
// none of the weight is vector:
//
// | file | on the wire | what is inside | drawn at |
// |---|---|---|---|
// | `access-denied.svg` | **2.89 MB** | a 1536×1024 PNG | 276×174 |
// | `success.svg` | **1.26 MB** | a 1024×1024 PNG | 74×74 |
//
// 4.1 MB of decoration, the tick alone being 1.26 MB to draw 74 pixels — roughly fourteen times the
// weight of the entire screen around it. And `next/image` cannot help: it passes a remote SVG
// **through** unchanged (that is what `dangerouslyAllowSVG` buys — permission, not processing), so
// every byte reaches the browser. `bg.png` (19 KB) and `images/theo-search.svg` (9 KB, real vector)
// are left on the CDN; they are already the right size in the right format.
//
// Same technique, same reasoning and the same runbook as `build-gift-code-art.mjs` — read that file
// for the detail on why it rasterises through Chromium and why the output is committed. Worth
// merging into one `pnpm art` once both have landed.
//
//   pnpm art:star-transfer
//   rm -rf .next/dev/cache/images   # ⚠ or a running dev server keeps serving the old encode

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public/illustrations/star-transfer')

/** Legacy's `IMAGES_STATIC.starTransfer` — the same two files, from the same CDN. */
const CDN = 'https://static.cdn.flowstreamx.com/web/web-app/star-transfer'

/**
 * `box` is legacy's intrinsic size, which is what `lib/illustrations.ts` declares and what reserves
 * the layout; `render` is **2× that**, because both components cap the art at its intrinsic width
 * (`max-w-full` on a 276 box, no scaling at all on the 74 tick). So 2× intrinsic is the real ceiling
 * on any screen — a wider encode would be pixels nothing can ask for.
 */
const SOURCES = [
    { name: 'access-denied', box: { width: 276, height: 174 }, render: 552 },
    { name: 'success', box: { width: 74, height: 74 }, render: 148 },
]

/** The gift-code script's 0.85 — the same kind of art, and it holds here: checked by eye at 2×. */
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
                // A data URI keeps the canvas untainted, so `toDataURL` is allowed to read it back.
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
                // No ground painted under it: both pieces are art on nothing, and a white rectangle
                // is exactly what would show up on the dark theme.
                canvas.getContext('2d').drawImage(img, 0, 0, width, height)
                return canvas.toDataURL('image/webp', quality)
            },
            { svg, width: render, height, quality: QUALITY },
        )

        if (!dataUrl.startsWith('data:image/webp')) {
            throw new Error(`${name}: Chromium did not encode WebP (got ${dataUrl.slice(0, 24)}…)`)
        }
        const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
        await writeFile(join(OUT_DIR, `${name}.webp`), bytes)
        console.log(
            `wrote public/illustrations/star-transfer/${name}.webp — ${render}×${height}, ` +
                `${kb(bytes.length)} (source SVG ${kb(svg.length)})`,
        )
    }

    await browser.close()
    // Read back, so a truncated write cannot pass silently.
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
