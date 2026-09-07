/**
 * Compress the brand font to WOFF2 and write it into `public/fonts/`.
 *
 * ```
 * pnpm fonts        # design-system/fonts/*.ttf → public/fonts/chella/*.woff2
 * ```
 *
 * Same shape as `pnpm icons` and `pnpm brand`: the input lives in `design-system/` and is **not
 * served**, the output is generated-but-committed, and a test fails if the two drift apart.
 *
 * ## Why WOFF2 and not the TTF Brand ships
 *
 * `next/font/local` self-hosts whatever file it is given — it does not convert. So the TTF was the
 * file every visitor downloaded, and `font-brand` is on the splash screen, so that is *every*
 * visitor. Measured on `Chella-Bold`:
 *
 * | | bytes |
 * |---|---|
 * | TTF, raw | 374 KB |
 * | TTF, gzipped by the server | 123 KB |
 * | **WOFF2** | **~110 KB, already compressed** |
 *
 * The wire win over a gzipping server is real but modest; the reasons to do it anyway are that it
 * does not *depend* on a gzipping server (a proxy that skips `font/ttf` serves the full 374 KB, and
 * that is not something this repo controls), and that the repo and every deploy artefact carry the
 * smaller file. WOFF2 has been supported by every browser this app targets since 2016.
 *
 * ## Why only one weight
 *
 * Brand ships Bold, ExtraBold and Black. The DS type scale is **400/500/600/700** — there is no
 * `.type-*` utility at 800 or 900, and `CLAUDE.md` forbids setting `font-weight` by hand — so no
 * conforming markup could ever request the other two. They were 711 KB in the repo and in every
 * deploy that nothing could download. Removed rather than converted; adding one back is a
 * deliberate act that starts with the DS growing a weight, not with a file reappearing here.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compress } from 'wawoff2'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IN_DIR = join(ROOT, 'design-system/fonts')
const OUT_DIR = join(ROOT, 'public/fonts/chella')

const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`

async function main() {
    await mkdir(OUT_DIR, { recursive: true })
    const sources = (await readdir(IN_DIR)).filter(name => name.endsWith('.ttf')).sort()
    if (!sources.length) throw new Error(`no .ttf in ${IN_DIR} — nothing to compress`)

    for (const name of sources) {
        const input = await readFile(join(IN_DIR, name))
        const output = Buffer.from(await compress(input))
        // `wOF2` — the container's magic. A compressor that silently returned its input would
        // otherwise ship a TTF under a `.woff2` name, which browsers reject outright.
        if (output.subarray(0, 4).toString('ascii') !== 'wOF2') {
            throw new Error(`${name}: output is not a WOFF2 (got ${output.subarray(0, 4).toString('hex')})`)
        }
        const file = join(OUT_DIR, `${basename(name, '.ttf')}.woff2`)
        await writeFile(file, output)
        console.log(
            `wrote public/fonts/chella/${basename(file)} — ${kb(output.length)} ` +
                `(source ${kb(input.length)}, ${((1 - output.length / input.length) * 100).toFixed(0)}% smaller)`,
        )
    }
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
