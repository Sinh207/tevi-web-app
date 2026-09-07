/**
 * Turn the three payment GIFs into what `CheckoutStatusDialog` can actually ship.
 *
 * ```
 * node scripts/build-payment-art.mjs            # rebuild public/illustrations/payment/
 * ```
 *
 * Needs `ffmpeg` on PATH. Generated-but-committed, like the icon sprite and the brand icons: the
 * output is small, the input is a URL that can change under us, and a reviewer should be able to see
 * exactly what is being served.
 *
 * ## What is wrong with the sources
 *
 * | source | bytes | |
 * |---|---|---|
 * | `payment-success.gif` | 126 KB | 640×640 for a 60px mark |
 * | `payment-faileds.gif` | 90 KB | same |
 * | `payment-inprogress.gif` | **1.26 MB** | 177 frames of 500×500 — on the one screen where the
 *   network is already busy taking money |
 *
 * And all three are drawn **on opaque white** (checked frame by frame: not one pixel of alpha), which
 * is the part that no amount of re-encoding fixes. Rendered as they are, dark mode gets a white
 * sticker under every mark.
 *
 * ## 1. Key the white out
 *
 * Not a threshold — a threshold cannot tell the difference between the white *behind* the art and the
 * white *in* it, and both marks are built from it: the tick inside the green badge, the cross inside
 * the red disc. So the background is defined by **reachability**, the way a paint bucket does it:
 * flood from the frame border through pixels light enough to be background (`FLOOD_MIN`), and
 * whatever the flood cannot reach is art, however white it is.
 *
 * Reached pixels are then *un-blended* rather than simply cleared: a pixel of art drawn at partial
 * opacity over white satisfies `P = αF + (1−α)·255`, so `α = 1 − min(P)/255` recovers the coverage and
 * `F = (P − 255(1−α))/α` the colour underneath. That is what keeps the edges from fringing and — the
 * reason it is worth the arithmetic — what makes the success animation's pale glow *dim* on a dark
 * background instead of a bright plate, exactly as it is nearly invisible on white. One pixel beyond
 * the flood (`BAND_MIN`) gets the same treatment: it is the far end of the same anti-aliasing ramp,
 * and the flood stops halfway up it.
 *
 * ## 2. Normalise on the mark, not on the frame
 *
 * The two marks are drawn at completely different scales — the failure disc is 562px across, the
 * success badge 190px in the same 640px frame. Fitting each frame to one box therefore made the tick
 * a third of the size of the cross. So the crop is measured from the **settled mark** and every asset
 * is scaled to put that mark at the same `MARK` px, with `ratio` of canvas around it for whatever the
 * animation throws outside the mark (the success confetti reaches 2.4× the badge; the other two barely
 * leave their own silhouette). Transparent margin is nearly free — success costs 8 KB to go from
 * clipping its outermost sparkles to clipping nothing at all.
 *
 * ## 3. One cycle of the loop, and no lead-in that only works on white
 *
 * The progress loop is 7.08s of frames that are all unique, so nothing dedupes it — but it is a rigid
 * rotation of a two-fold symmetric shape, which repeats every ~23 frames. `findCycle` measures that
 * period and keeps one turn of it, which is where 1.26 MB → 73 KB comes from. It is measured rather
 * than hard-coded so that a re-published GIF is re-measured, not mis-cut.
 *
 * The success art needs the opposite treatment, and this one *is* hard-coded (`from`): its first 30
 * frames draw a ring and then fill it **white before green**. On white that reads as a badge filling
 * up; keyed, it is a white disc flashing for 0.2s. It is cut, so the mark now enters with its confetti
 * burst — which is also the better dialog: the spinner it replaces has been turning for seconds
 * already, and nobody needs a second spin-up to be told it worked.
 *
 * `expect` fingerprints each source (size and frame count), because `from`/`count` were measured
 * against these exact files. A re-published GIF fails the build instead of being silently mis-cut.
 *
 * ## 4. Animated WebP, and a still beside it
 *
 * One format for all three, chosen because it is the only widely-supported animated format that keeps
 * an alpha channel — h264 has none, and the WebM/HEVC alpha pair needs a different file per browser.
 * With one cycle instead of seven, its lack of temporal prediction stops mattering. Flat vector art
 * also compresses about as well lossless as lossy, so the failure mark ships lossless.
 *
 * Each asset gets a **still** for `prefers-reduced-motion`: the last frame for the two marks, the
 * first for the loop. An animation that may not animate should hold its conclusion, not its first
 * frame. And the marks are re-encoded to play **once** rather than the source's ~63 777 loops — a tick
 * that redraws itself every five seconds under a "Payment successful" heading is a fidget, not a
 * state.
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = 'https://static.tevi.dev/home'
const OUT = 'public/illustrations/payment'

/** 2× the 60px the mark reads at — the DS illustration size. */
const MARK = 120
/** Source frame rate of all three GIFs. */
const FPS = 25

/** Light enough to be background, if the flood can reach it. */
const FLOOD_MIN = 150
/** The one pixel past the flood that is still mostly white: the far end of the same AA ramp. */
const BAND_MIN = 100

/**
 * `ratio` = canvas ÷ mark. `from`/`count` are frame windows; `null` count means "to the end", and a
 * `cycle` asset has its window measured instead. `expect` is the source fingerprint the windows were
 * measured against.
 */
const ART = [
    {
        src: 'payment-success.gif',
        name: 'success',
        expect: { bytes: 126552, frames: 67, size: 640 },
        from: 30,
        count: null,
        ratio: 2.4,
        loop: 1,
        still: 'last',
        encode: ['-lossless', '0', '-q:v', '75'],
    },
    {
        src: 'payment-faileds.gif',
        name: 'failed',
        expect: { bytes: 89632, frames: 36, size: 640 },
        from: 0,
        count: null,
        ratio: 1.3,
        loop: 1,
        still: 'last',
        encode: ['-lossless', '1'],
    },
    {
        src: 'payment-inprogress.gif',
        name: 'progress',
        expect: { bytes: 1263328, frames: 177, size: 500 },
        cycle: true,
        ratio: 1.3,
        loop: 0,
        still: 'first',
        encode: ['-lossless', '0', '-q:v', '75'],
    },
]

function ffmpeg(args, input) {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', args)
        const out = []
        const err = []
        child.stdout.on('data', chunk => out.push(chunk))
        child.stderr.on('data', chunk => err.push(chunk))
        child.on('error', reject)
        child.on('close', code =>
            code === 0
                ? resolve(Buffer.concat(out))
                : reject(new Error(`ffmpeg ${code}: ${Buffer.concat(err)}`)),
        )
        if (input) child.stdin.end(input)
        else child.stdin.end()
    })
}

/** Every frame as straight RGBA. GIF decodes to one full frame per packet, so no compositing here. */
async function decode(file) {
    return ffmpeg(['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'])
}

/**
 * White background → transparency, in place. See the header: reachability decides what is background,
 * un-blending decides what the edges and the pale washes become.
 */
function key(px, w, h) {
    const n = w * h
    const min = new Uint8Array(n)
    for (let i = 0; i < n; i += 1) {
        const r = px[i * 4]
        const g = px[i * 4 + 1]
        const b = px[i * 4 + 2]
        min[i] = Math.min(r, g, b)
    }

    // 1 = reached by the flood, 2 = the AA pixel just past it.
    const soft = new Uint8Array(n)
    const stack = new Int32Array(n)
    let top = 0
    const push = i => {
        if (soft[i] === 0 && min[i] >= FLOOD_MIN) {
            soft[i] = 1
            stack[top] = i
            top += 1
        }
    }
    for (let x = 0; x < w; x += 1) {
        push(x)
        push((h - 1) * w + x)
    }
    for (let y = 0; y < h; y += 1) {
        push(y * w)
        push(y * w + w - 1)
    }
    while (top > 0) {
        top -= 1
        const i = stack[top]
        const x = i % w
        if (x > 0) push(i - 1)
        if (x < w - 1) push(i + 1)
        if (i >= w) push(i - w)
        if (i < n - w) push(i + w)
    }
    for (let i = 0; i < n; i += 1) {
        if (soft[i] !== 1) continue
        const x = i % w
        const band = j => {
            if (soft[j] === 0 && min[j] >= BAND_MIN) soft[j] = 2
        }
        if (x > 0) band(i - 1)
        if (x < w - 1) band(i + 1)
        if (i >= w) band(i - w)
        if (i < n - w) band(i + w)
    }

    for (let i = 0; i < n; i += 1) {
        if (soft[i] === 0) {
            px[i * 4 + 3] = 255
            continue
        }
        const a = 1 - min[i] / 255
        if (a < 2 / 255) {
            px[i * 4] = 0
            px[i * 4 + 1] = 0
            px[i * 4 + 2] = 0
            px[i * 4 + 3] = 0
            continue
        }
        const ground = 255 * (1 - a)
        for (let c = 0; c < 3; c += 1) {
            const v = Math.round((px[i * 4 + c] - ground) / a)
            px[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : v
        }
        px[i * 4 + 3] = Math.round(a * 255)
    }
}

const frameAt = (frames, i, stride) => frames.subarray(i * stride, (i + 1) * stride)

/** Ink, so "blank" and "settled" can be answered without looking. */
function ink(frame, n) {
    let sum = 0
    for (let i = 0; i < n; i += 1) sum += frame[i * 4 + 3]
    return sum
}

/** The settled mark's bounding box: the last frame that has anything in it, at half coverage or more. */
function markBox(frames, count, w, h) {
    const stride = w * h * 4
    let last = count - 1
    while (last > 0 && ink(frameAt(frames, last, stride), w * h) === 0) last -= 1
    const frame = frameAt(frames, last, stride)
    let x0 = w
    let y0 = h
    let x1 = -1
    let y1 = -1
    for (let i = 0; i < w * h; i += 1) {
        if (frame[i * 4 + 3] < 128) continue
        const x = i % w
        const y = (i - x) / w
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
    }
    if (x1 < 0) throw new Error('no mark found')
    return { cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, size: Math.max(x1 - x0, y1 - y0) + 1 }
}

/**
 * One turn of a looping animation: the shortest `(start, period)` whose wrap — the frame after the last
 * against the first — cannot be seen. Searched on 64×64 alpha thumbnails, which is plenty to line up a
 * rotation and keeps it to a few million comparisons.
 *
 * "Cannot be seen" is measured against the animation's own step: a seam smaller than half the
 * difference between two consecutive frames is smaller than the motion around it, so there is nothing
 * to notice. Shortest wins because a period is bytes — this rotation reads as perfect at both 23 and 44
 * frames, and 44 costs exactly twice as much for a second identical turn.
 */
function findCycle(frames, count, w, h) {
    const T = 64
    const stride = w * h * 4
    const thumbs = []
    for (let f = 0; f < count; f += 1) {
        const frame = frameAt(frames, f, stride)
        const t = new Float32Array(T * T)
        for (let y = 0; y < T; y += 1) {
            for (let x = 0; x < T; x += 1) {
                const sx = Math.floor(((x + 0.5) * w) / T)
                const sy = Math.floor(((y + 0.5) * h) / T)
                t[y * T + x] = frame[(sy * w + sx) * 4 + 3]
            }
        }
        thumbs.push(t)
    }
    const diff = (a, b) => {
        let sum = 0
        for (let i = 0; i < T * T; i += 1) sum += Math.abs(a[i] - b[i])
        return sum / (T * T)
    }
    const steps = []
    for (let f = 0; f + 1 < count; f += 1) steps.push(diff(thumbs[f], thumbs[f + 1]))
    steps.sort((a, b) => a - b)
    // A fifth of the motion between two consecutive frames. The period of a rotation is rarely a whole
    // number of frames, so no cut is perfectly seamless — but the seam is also measured at source
    // resolution, and the export scales that down more than 3×, which turns a mismatch this small into
    // a fraction of an output pixel. Verified on the encoded file, not assumed: see the doc comment.
    const invisible = ((steps[Math.floor(steps.length / 2)] ?? 0) * 1) / 5

    let best = null
    for (let period = 8; period <= Math.floor(count / 2); period += 1) {
        for (let start = 0; start + period < count - 1; start += 1) {
            // Compare the frame that would follow the cut with the one it loops back to.
            const wrap = diff(thumbs[start], thumbs[start + period])
            if (!best || wrap < best.wrap) best = { from: start, count: period, wrap }
        }
        if (best && best.count === period && best.wrap <= invisible) return best
    }
    return best
}

/**
 * How many trailing frames are the same picture as the last one. A `-loop 1` animation holds its final
 * frame forever, so encoding sixteen more copies of a settled badge buys nothing.
 */
function settledTail(frames, from, count, w, h) {
    const stride = w * h * 4
    const last = frameAt(frames, from + count - 1, stride)
    let same = 0
    while (same + 2 < count) {
        const frame = frameAt(frames, from + count - 2 - same, stride)
        let sum = 0
        // All four channels, not just alpha: the failure cross is white paint drawn *inside* an already
        // opaque disc, so the whole draw-in is invisible to an alpha-only comparison.
        for (let i = 0; i < stride; i += 1) sum += Math.abs(frame[i] - last[i])
        // Tight, because this frame is the one held on screen afterwards: at a looser threshold the
        // success animation ends holding the last three sparks of its confetti mid-flight.
        if (sum / (w * h) > 0.05) break
        same += 1
    }
    return same
}

/** Crop `side` px around the mark's centre, padding with transparency where the source runs out. */
function cropFrames(frames, from, count, w, h, box, side) {
    const stride = w * h * 4
    const out = Buffer.alloc(count * side * side * 4)
    const x0 = Math.round(box.cx - side / 2)
    const y0 = Math.round(box.cy - side / 2)
    for (let f = 0; f < count; f += 1) {
        const src = frameAt(frames, from + f, stride)
        for (let y = 0; y < side; y += 1) {
            const sy = y0 + y
            if (sy < 0 || sy >= h) continue
            const sx0 = Math.max(0, x0)
            const sx1 = Math.min(w, x0 + side)
            if (sx1 <= sx0) continue
            src.copy(
                out,
                (f * side * side + y * side + (sx0 - x0)) * 4,
                (sy * w + sx0) * 4,
                (sy * w + sx1) * 4,
            )
        }
    }
    return out
}

/**
 * Scaling has to happen on premultiplied pixels: interpolating colour and alpha apart mixes the
 * colour of transparent pixels into visible ones, which is how a keyed asset grows a fringe.
 */
const scale = canvas =>
    `premultiply=inplace=1,scale=${canvas}:${canvas}:flags=area,unpremultiply=inplace=1`

await mkdir(OUT, { recursive: true })

for (const art of ART) {
    const tmp = join(process.env.TMPDIR ?? '/tmp', art.src)
    const response = await fetch(`${BASE}/${art.src}`)
    if (!response.ok) throw new Error(`${art.src}: ${response.status}`)
    const source = Buffer.from(await response.arrayBuffer())
    await writeFile(tmp, source)

    const { size: w } = art.expect
    const h = w
    const raw = await decode(tmp)
    const stride = w * h * 4
    const frames = Math.floor(raw.length / stride)
    if (source.length !== art.expect.bytes || frames !== art.expect.frames) {
        throw new Error(
            `${art.src} changed: ${source.length} bytes / ${frames} frames, expected ` +
                `${art.expect.bytes} / ${art.expect.frames}. The frame windows in ART were measured ` +
                'against the old file — re-measure them before trusting this build.',
        )
    }
    const px = Buffer.from(raw)
    for (let f = 0; f < frames; f += 1) key(frameAt(px, f, stride), w, h)

    const window = art.cycle
        ? findCycle(px, frames, w, h)
        : { from: art.from, count: (art.count ?? frames - art.from) }
    // A trailing blank frame is the GIF's own padding, and it would blink.
    while (window.count > 1 && ink(frameAt(px, window.from + window.count - 1, stride), w * h) === 0) {
        window.count -= 1
    }

    if (art.loop === 1) window.count -= settledTail(px, window.from, window.count, w, h)

    const box = markBox(px, frames, w, h)
    const side = Math.round((box.size * art.ratio) / 2) * 2
    const canvas = Math.round((MARK * art.ratio) / 2) * 2
    const cropped = cropFrames(px, window.from, window.count, w, h, box, side)

    const dst = join(OUT, `${art.name}.webp`)
    await ffmpeg(
        [
            '-y', '-v', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${side}x${side}`,
            '-framerate', String(FPS), '-i', '-',
            '-vf', scale(canvas),
            '-c:v', 'libwebp_anim', '-compression_level', '6', '-loop', String(art.loop),
            ...art.encode, dst,
        ],
        cropped,
    )

    const pick = art.still === 'last' ? window.count - 1 : 0
    await ffmpeg(
        [
            '-y', '-v', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${side}x${side}`, '-i', '-',
            '-vf', scale(canvas),
            '-frames:v', '1', '-c:v', 'libwebp', '-lossless', '1',
            join(OUT, `${art.name}-still.webp`),
        ],
        cropped.subarray(pick * side * side * 4, (pick + 1) * side * side * 4),
    )

    console.log(
        `${art.name.padEnd(9)} ${(source.length / 1024).toFixed(0).padStart(5)} KB → ` +
            `frames ${window.from}..${window.from + window.count - 1} of ${frames}, ` +
            `mark ${box.size}px → canvas ${canvas} (×${art.ratio})` +
            (window.wrap === undefined ? '' : `, loop seam ${window.wrap.toFixed(2)}/255`),
    )
}
