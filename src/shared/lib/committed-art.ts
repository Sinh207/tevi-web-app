import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'

/**
 * The two checks every piece of **generated-but-committed** artwork needs, written once.
 *
 * Art that `scripts/build-cdn-art.mjs` (or its per-feature siblings) re-encodes out of the CDN goes
 * stale in a way nothing else catches: the file a module names is missing, or was committed as
 * something other than the format it claims. Neither breaks a build, a typecheck or a lint —
 * `next/image` 404s at request time and the screen renders a gap where the art was.
 *
 * Each feature asserts this over its own `illustrations.ts`, so the boundary rules hold and the
 * feature-specific reasoning stays next to the art it is about. What lives here is only the part
 * that would otherwise be copy-pasted per feature, and therefore eventually be pasted wrong.
 *
 * Test-only, and deliberately node-flavoured: it reads `public/` off disk rather than reaching the
 * network, because measuring the CDN is `pnpm art:audit`'s job and a test that needs a network fails
 * on a train.
 *
 * @see [`docs/STATIC_ASSETS.md`](../../../docs/STATIC_ASSETS.md)
 */

/**
 * The leading bytes each extension is supposed to have. Checked as *magic*, not as a file name,
 * because the failure this catches is a file committed as something other than what it claims — a
 * PNG saved with a `.webp` extension renders in a browser and is silently three times the size.
 *
 * `mp4` is matched on the `ftyp` box at offset 4, which is where an ISO-BMFF file declares itself;
 * SVG on the tag, since an XML prolog or a comment may come first.
 */
function hasMagic(data: Buffer, extension: string): boolean {
    switch (extension) {
        case '.webp':
            return (
                data.subarray(0, 4).toString('ascii') === 'RIFF' &&
                data.subarray(8, 12).toString('ascii') === 'WEBP'
            )
        case '.png':
            return data.subarray(0, 8).toString('binary') === '\x89PNG\r\n\x1a\n'
        case '.jpg':
        case '.jpeg':
            return data[0] === 0xff && data[1] === 0xd8
        case '.gif':
            return data.subarray(0, 3).toString('ascii') === 'GIF'
        case '.mp4':
            return data.subarray(4, 8).toString('ascii') === 'ftyp'
        case '.svg':
            return data.subarray(0, 400).toString('utf8').includes('<svg')
        default:
            // Deliberately not `true`: an extension nobody taught this function is a fact about the
            // test, and it should say so rather than quietly pass.
            return false
    }
}

/**
 * Reads the file a `src` points at and returns what a test can assert on. Throws if it is not there
 * at all, which is the failure worth the loudest message.
 */
export function committedArt(src: string): {
    /** `false` for an `http(s)` URL — the regression that silently restores the CDN download. */
    isLocal: boolean
    /** `true` when the bytes are what the extension claims. `false` for anything remote. */
    isDeclaredFormat: boolean
    /** Guards a truncated or placeholder write, which a mere existence check would pass. */
    bytes: number
} {
    // Answered before touching the disk: a `src` that went back to the CDN should fail on *that*,
    // not on `ENOENT public/https:/…`, which reads like a broken test rather than a reverted asset.
    if (/^https?:/.test(src)) return { isLocal: false, isDeclaredFormat: false, bytes: 0 }

    const path = src.split('?')[0]
    const data = readFileSync(join(process.cwd(), 'public', path))
    return {
        isLocal: true,
        isDeclaredFormat: hasMagic(data, extname(path).toLowerCase()),
        bytes: data.length,
    }
}
