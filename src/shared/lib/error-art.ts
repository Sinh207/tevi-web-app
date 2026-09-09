/**
 * The artwork on the two frames React shows when a route fails — `app/not-found.tsx` and
 * `app/error.tsx`.
 *
 * ## Why these two are committed rather than left on the CDN
 *
 * The general rule is [`docs/STATIC_ASSETS.md`](../../../docs/STATIC_ASSETS.md)'s: a rendering
 * screen depends on no other host. It applies here twice over, because of *when* these screens
 * render. A 500 is by definition drawn while something upstream is unwell — the moment a
 * cross-origin fetch is least likely to succeed — and a 404 is the one page a crawler is guaranteed
 * to request. Neither can afford a picture that arrives from somewhere else, or not at all.
 *
 * The bytes make the same case on their own. All three are Figma *image* layers or raw PNGs, and
 * `next/image` passes a **remote SVG through unprocessed** while a CSS `background-image` is never
 * optimised at all:
 *
 * | legacy asset | on the wire | committed |
 * |---|---|---|
 * | `errors/404.svg` (a 1198×912 PNG in a wrapper) | 182 KB | 30 KB |
 * | `errors/500.svg` (an 825×784 PNG in a wrapper) | 680 KB | 66 KB |
 * | `errors/bg.png` (2880×2048, a CSS background) | **825 KB** | 11 KB |
 *
 * Rows in `scripts/build-cdn-art.mjs`, so `pnpm art` reproduces them. Nothing is redrawn or
 * recoloured — these are Brand's own pixels at the size the app draws them.
 *
 * This lives in `shared/lib/` and not in a feature because its readers are `app/` boundary files,
 * which belong to no feature and may not be given one just to own three paths.
 */

export type ErrorArt = {
    src: string
    /** Intrinsic size — reserves the box so nothing reflows when the art decodes. */
    width: number
    height: number
}

export const ERROR_ART = {
    /** Legacy's own box (`width`/`height` on its `next/image`) — `components/errors/404`. */
    notFound: { src: '/illustrations/errors/404.webp', width: 536, height: 312 } satisfies ErrorArt,
    /** Ditto, `components/errors/500`. The one-pixel squash against the 328×313 source is legacy's. */
    failed: { src: '/illustrations/errors/500.webp', width: 328, height: 312 } satisfies ErrorArt,
} as const

/**
 * The pastel mesh legacy paints behind both screens — **and it is drawn in Light only.**
 *
 * That is a deliberate divergence from `web-app`, which has one theme and can afford to make a
 * near-white gradient the ground of a page. Here it would be the whole viewport turning white on a
 * dark device, on the one screen a reader did not ask for. So the layer is `dark:hidden` at the
 * call site and Dark falls through to `--background`, which is what every other page uses.
 *
 * No width/height: it is drawn with `fill` + `object-cover`, exactly as legacy's
 * `background-size: cover` does, so there is no box to reserve. The encode is at the source's own
 * 1.406 ratio for the same reason `channel/invitation-banner.webp` is — baking a crop in would
 * make it width-dependent, and a phone would then re-crop an already-cropped strip.
 */
export const ERROR_BACKDROP_SRC = '/illustrations/errors/backdrop.webp'
