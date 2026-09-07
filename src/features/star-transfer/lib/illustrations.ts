/**
 * `/star-transfer`'s artwork.
 *
 * Two of the three pieces are **served from our own origin** and re-encoded (`pnpm art:star-transfer`,
 * see `scripts/build-star-transfer-art.mjs`); the third stays on the CDN. Which one a piece is comes
 * down to a byte count that had to be measured rather than assumed:
 *
 * | piece | as Brand ships it | as we serve it |
 * |---|---|---|
 * | `access-denied` | **2.89 MB** SVG (a 1536×1024 PNG inside a 276×174 box) | 35 KB WebP, local |
 * | `success` | **1.26 MB** SVG (a 1024×1024 PNG inside a 74×74 box) | 6 KB WebP, local |
 * | `bg.png` | 19 KB PNG | unchanged, CDN |
 *
 * ⚠ **`next/image` does not optimise an SVG — it passes it through.** That is the whole trap here, and
 * it reads the other way round: `dangerouslyAllowSVG` in `next.config.ts` grants *permission* to serve
 * remote SVG, not processing of it. So a Figma raster export wearing an `.svg` extension is the worst
 * container an illustration can arrive in — a raster (no free downscale) inside the one format the
 * optimizer refuses to touch. 4.1 MB of decoration reached the browser byte for byte, the tick alone
 * costing 1.26 MB to draw at 74 pixels. The re-encode is the same art at the resolution it is drawn
 * at: nothing redrawn, nothing substituted.
 *
 * Sizes below are legacy's intrinsic ones, declared so the box is reserved and nothing reflows while
 * the art decodes — which matters most on the receipt, where the figure under it is the thing being
 * read. They are also what fixes the encode width: `build-star-transfer-art.mjs` renders 2× these.
 */
export const STAR_TRANSFER_ART = {
    /**
     * The balance card's artwork — legacy's own `star-transfer/bg.png`, a purple wash it stretches
     * behind the figure with `background-size: cover`.
     *
     * A `background-image` rather than an `<Image>`, which is what legacy does and what it has to be:
     * the card sizes to its content (a label over a 32px figure, min 120 tall) and the art fills
     * whatever that comes to. `next/image` cannot do that without `fill` plus a positioned parent.
     *
     * Which is exactly why it is committed and re-encoded rather than left alone. A CSS background is
     * the one case the optimiser **never** sees — no AVIF, no responsive widths, the browser fetches
     * this file byte for byte — so "19 KB of PNG, already the right size" was the reasoning that kept
     * it remote and unexamined. Re-encoded at its own 612×119 it is 3.1 KB, and it is one fewer host
     * a rendering screen depends on. See
     * [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
     */
    balance: '/illustrations/star-transfer/balance-bg.webp',
    /** The denial panel's illustration. 276×174, legacy's box. */
    denied: {
        src: '/illustrations/star-transfer/access-denied.webp',
        width: 276,
        height: 174,
    },
    /** The receipt's tick. 74×74, legacy's box. */
    success: {
        src: '/illustrations/star-transfer/success.webp',
        width: 74,
        height: 74,
    },
} as const

/**
 * The empty history state — **legacy's own art**, `images/theo-search.svg`, at legacy's own 120×120.
 *
 * It briefly used `/my-star`'s jar illustration on the grounds that two screens in one family should
 * share a picture. That was the wrong call for this screen: `web-app` is the reference for what
 * `/star-transfer` looks like, and it draws Theo here.
 *
 * Stays an **SVG**, unlike the two pieces above: this one is real vector — 9 KB, no embedded raster —
 * so re-encoding it would cost crispness to save nothing. It points at the copy `features/earnings`
 * already committed rather than adding a second one; same file, same bytes, one entry in `public/`.
 */
export const STAR_TRANSFER_EMPTY_ART = {
    src: '/illustrations/theo-search.svg',
    width: 120,
    height: 120,
} as const
