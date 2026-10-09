// Renders the reaction star's two resting frames out of its own Lottie file, as WebP.
//
// ## Why the star has stills at all
//
// The reaction control is legacy's Lottie (`public/lotties/icon-star-reactions.json`): one file
// carrying the unpressed star (frame 0), the pressed star (frame 60) and the burst between them. It
// sits on every post and every reply, and a player is not cheap to build — thirteen layers and a
// decoded PNG; `lottie-animation.tsx` measured ~90ms for a page of twenty at 4× CPU — so a feed
// scrolling through its render window was building and destroying players for buttons nobody
// touched.
//
// So at rest the control draws **these** — two `<img>`s — and the player is mounted only when the
// reader reaches for the button (`ReactionStar` in `features/post/components/post-actions.tsx`).
//
// ## Rendered from the animation, never redrawn
//
// `post-actions.tsx` argues the resting states must be stills from the file that animates between
// them, so the two can never drift apart. This keeps that: the frames are rendered by lottie-web
// itself, from the committed JSON, at the frame numbers the component plays to. **Re-run this
// whenever that JSON changes** — nothing can detect a stale still, and the visible result would be
// a star that changes shape the moment the player takes over from it.
//
// ## Runbook
//
//   pnpm art:reaction
//
// Chromium through Playwright, like `build-gift-code-art.mjs`: no native image tool needed.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'public/lotties/icon-star-reactions.json')
const OUT_DIR = join(ROOT, 'public/illustrations/post')

/**
 * Frame numbers are `post-actions.tsx`'s `REACTED_FRAME` and 0. `size` is 3× the largest box the
 * control is drawn at (40px on a post; a reply's is 32) — the star is a small, hard-edged shape, and
 * at 2× its outline visibly softens on a 3× phone.
 */
const STILLS = [
    { name: 'reaction-star-off', frame: 0 },
    { name: 'reaction-star-on', frame: 60 },
]
const SIZE = 120

/** Lossless: flat colours and a hard outline, and both files are under 4 KB anyway. */
const QUALITY = 1

const require = createRequire(import.meta.url)
const LOTTIE = require.resolve('lottie-web/build/player/lottie_light.min.js')

async function main() {
    await mkdir(OUT_DIR, { recursive: true })
    const data = JSON.parse(await readFile(SOURCE, 'utf8'))
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.setContent(`<div id="host" style="width:${SIZE}px;height:${SIZE}px"></div>`)
    await page.addScriptTag({ path: LOTTIE })

    for (const { name, frame } of STILLS) {
        const dataUrl = await page.evaluate(
            async ({ data, frame, size, quality }) => {
                const host = document.getElementById('host')
                host.innerHTML = ''
                const player = window.lottie.loadAnimation({
                    container: host,
                    renderer: 'svg',
                    loop: false,
                    autoplay: false,
                    animationData: data,
                })
                await new Promise(resolve =>
                    player.isLoaded ? resolve() : player.addEventListener('DOMLoaded', resolve),
                )
                player.goToAndStop(frame, true)

                const svg = host.querySelector('svg')
                svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
                svg.setAttribute('width', String(size))
                svg.setAttribute('height', String(size))
                const markup = new XMLSerializer().serializeToString(svg)
                player.destroy()

                const img = new Image()
                await new Promise((resolve, reject) => {
                    img.onload = resolve
                    img.onerror = () => reject(new Error('frame SVG failed to decode'))
                    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`
                })
                const canvas = document.createElement('canvas')
                canvas.width = size
                canvas.height = size
                // Transparent ground: the button sits on the card in both themes.
                canvas.getContext('2d').drawImage(img, 0, 0, size, size)
                return canvas.toDataURL('image/webp', quality)
            },
            { data, frame, size: SIZE, quality: QUALITY },
        )

        if (!dataUrl.startsWith('data:image/webp')) {
            throw new Error(`${name}: Chromium did not encode WebP (got ${dataUrl.slice(0, 24)}…)`)
        }
        const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
        if (bytes.length < 256) throw new Error(`${name} is ${bytes.length} bytes — that is not art`)
        await writeFile(join(OUT_DIR, `${name}.webp`), bytes)
        console.log(
            `wrote public/illustrations/post/${name}.webp — frame ${frame}, ${SIZE}×${SIZE}, ${bytes.length} B`,
        )
    }

    await browser.close()
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
