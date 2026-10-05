#!/usr/bin/env node
/**
 * Put the ffmpeg.wasm core where the browser can fetch it — `public/ffmpeg/`.
 *
 * ## Copied at build time, not committed
 *
 * The core is **24 MB of WebAssembly**. Everything else generated in this repo is
 * generated-but-committed (the icon sprite, the brand icons, the testid catalog) because those are
 * kilobytes and a reviewer benefits from seeing them change. This one is not: 24 MB in git is 24 MB
 * in every clone, every branch and every bisect, for a file whose bytes are already pinned by
 * `pnpm-lock.yaml`. So `public/ffmpeg/` is ignored and rebuilt from `node_modules`, which is the
 * same guarantee by a cheaper route — the lockfile decides the version, not whoever last ran a
 * script.
 *
 * `@ffmpeg/core-st` is the **single-thread** build; the multi-thread one is a separate package and
 * is deliberately not installed — see below.
 *
 * It cannot be imported instead. `@ffmpeg/ffmpeg` fetches its core by **URL** at runtime and
 * instantiates it in a worker; a bundler that inlined 24 MB of wasm into a chunk would put it on
 * every visitor's first paint. A URL under `public/` is the one shape that stays lazy.
 *
 * ## Single-thread only, and that is not a downgrade here
 *
 * Legacy ships **both** cores and picks the multi-thread one when `SharedArrayBuffer` is available.
 * It never is in this app: `SharedArrayBuffer` requires cross-origin isolation, which requires
 * `COOP: same-origin` + `COEP: require-corp`, and `COEP` would block every cross-origin image the
 * product renders — avatars, post media, the CDN art. So the MT core is another 24 MB that could
 * only ever be skipped, and `@ffmpeg/core-st` is the only dependency here.
 *
 * Run by `predev` and `prebuild`; idempotent, and skips a file whose size already matches.
 */

import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', '@ffmpeg', 'core-st', 'dist')
const to = join(root, 'public', 'ffmpeg')

let source
try {
    source = readdirSync(from)
} catch {
    /*
     * A warning and a zero exit, not a throw. This runs in front of `next dev` and `next build`,
     * and a missing optional core must not stop either — the trimmer is one control on one dialog,
     * and `loadFfmpeg` already fails to a message rather than to a blank screen.
     */
    console.warn(`[ffmpeg] @ffmpeg/core-st is not installed — skipping (${from})`)
    process.exit(0)
}

mkdirSync(to, { recursive: true })

let copied = 0
for (const name of source) {
    const src = join(from, name)
    const dest = join(to, name)
    const size = statSync(src).size
    try {
        if (statSync(dest).size === size) continue
    } catch {
        // Not there yet.
    }
    copyFileSync(src, dest)
    copied += 1
}

console.log(
    copied === 0
        ? `[ffmpeg] core already in public/ffmpeg (${source.length} files)`
        : `[ffmpeg] copied ${copied} file(s) to public/ffmpeg`,
)
