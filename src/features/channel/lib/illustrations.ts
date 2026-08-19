/**
 * This feature's empty-state artwork.
 *
 * ## Why this one is a local file and `IDENTITY_ART` is a CDN URL
 *
 * Legacy points at `${STATIC_DOMAIN}/web/web-app/blocked-accounts/no-blocked-accounts.svg`,
 * and that file is still there — but it is **not vector art**. It is a 190×127 `<svg>` whose
 * whole body is one `<pattern>` filled with a base64 PNG: the shape Figma produces when an
 * *image* layer is exported as SVG. Measured, not assumed:
 *
 * | | on the wire | pixels | shown at |
 * |---|---|---|---|
 * | CDN `.svg` | **2.18 MB** gzipped | 1536×1024 embedded PNG | 190×127 |
 * | this file | 39 KB | 380×253 | 190×127 |
 *
 * The size is only half of it. `next/image` **cannot optimise a remote SVG** — the optimiser
 * refuses one unless `dangerouslyAllowSVG` is set, which it is not and should not be for
 * third-party-fetchable art (an SVG can carry script). So the CDN copy has to be rendered
 * `unoptimized`, and every visitor who has blocked nobody downloads 2.18 MB to be told so.
 * The identification illustrations get away with living on the CDN precisely because they are
 * `.png`: Next fetches the 1.2 MB original **once, server-side**, and serves the browser a
 * ~20 KB WebP. Format, not hosting, is what makes that pattern work.
 *
 * So this is the same picture, extracted from the SVG's own payload, downscaled to 2× its
 * display box and committed. Nothing is redrawn or substituted — it is Brand's asset, byte for
 * byte, at a sane resolution. It is also flipped horizontally, because the CDN SVG applies
 * `transform="matrix(-1 0 0 1 190 0)"` to the pattern: the file as stored faces the other way,
 * and legacy's rendered orientation is the one people know.
 *
 * **This should go back to being a CDN URL.** The moment Brand publishes
 * `blocked-accounts/no-blocked-accounts.png` — the same treatment `follow-requests` and
 * `identification` already get in that very tree — this becomes a one-line change to a
 * `${STATIC_DOMAIN}/…` string and the local file is deleted. Tracked as a design dependency,
 * not left as a silent fork.
 */

export const BLOCKED_ACCOUNTS_ART = {
    /**
     * Legacy's intrinsic size (`width`/`height` on its `next/image`), kept so the box is
     * reserved at the right shape and nothing reflows when the art decodes.
     */
    empty: { src: '/illustrations/no-blocked-accounts.png', width: 190, height: 127 },
} as const

/**
 * The Live tab's empty state.
 *
 * Legacy's `IMAGES_STATIC.event.noData` is a 154×183 SVG that turns out to be a 1536×1024 PNG
 * embedded as a cropping pattern — **3 MB** fetched to say "no events yet". Rendered at the size it
 * is actually drawn and saved as a 2× raster instead (102 KB), which is the same trade
 * `no-blocked-accounts.png` already makes.
 */
export const LIVE_EVENTS_ART = {
    empty: { src: '/illustrations/no-live-events.png', width: 154, height: 183 },
} as const
