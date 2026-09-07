/**
 * This feature's empty-state artwork.
 *
 * ## A local copy, and for a different reason than `BLOCKED_ACCOUNTS_ART`'s
 *
 * That one is local because the CDN file is 2.18 MB — an image layer exported as SVG. This one is
 * the opposite: `${STATIC_DOMAIN}/web/web-app/images/theo-search.svg` is **9 KB of genuine
 * vector**, 94×118, no embedded raster and no script. Nothing about it is worth re-encoding.
 *
 * It is local because **`next/image` cannot process a remote SVG** — it passes one through
 * unchanged. `next.config.ts` sets `dangerouslyAllowSVG`, but that is permission to *serve* one
 * (hence the `script-src 'none'; sandbox` CSP under it), not permission to optimise it. A remote
 * `.png` is the case that works: Next fetches it once, server-side, and serves AVIF. Format, not
 * hosting, is what decides — the rule and its budgets are in
 * [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 *
 * So the choice was a local copy or 9 KB of cross-origin passthrough on every empty state, and for
 * 9 KB served from `public/` with the app's own compression the copy wins. It is Brand's file byte for byte —
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
