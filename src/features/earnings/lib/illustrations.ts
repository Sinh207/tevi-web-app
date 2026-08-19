/**
 * This feature's empty-state artwork.
 *
 * ## A local copy, and for a different reason than `BLOCKED_ACCOUNTS_ART`'s
 *
 * That one is local because the CDN file is 2.18 MB — an image layer exported as SVG. This one is
 * the opposite: `${STATIC_DOMAIN}/web/web-app/images/theo-search.svg` is **9 KB of genuine
 * vector**, 94×118, no embedded raster and no script. Nothing about it is worth re-encoding.
 *
 * It is local because **`next/image` refuses a remote SVG.** The optimizer will not process one
 * unless `dangerouslyAllowSVG` is set, which it is not and should not be for third-party-fetchable
 * art — an SVG can carry script, and `next.config.ts` allows an entire CDN wildcard. The
 * identification illustrations get away with living on the CDN because they are `.png`: Next
 * fetches them once, server-side, and serves WebP. Format, not hosting, is what decides.
 *
 * So the choice was a local copy or an `unoptimized` remote `<img>`, and for 9 KB served from
 * `public/` with the app's own cache headers the copy wins. It is Brand's file byte for byte —
 * nothing redrawn, nothing substituted. If Brand ships `theo-search.png`, this becomes a
 * `${STATIC_DOMAIN}/…` string and the file is deleted.
 *
 * Legacy renders it at 96×120; the file's intrinsic box is 94×118 and that is what is declared
 * here, so the reserved box matches the art's real aspect ratio and nothing is stretched by two
 * pixels to hit a round number.
 */

export const EARNINGS_ART = {
    empty: { src: '/illustrations/theo-search.svg', width: 94, height: 118 },
} as const
