/**
 * `/card-management`'s artwork. Same art and same intrinsic sizes as legacy — the point is for the
 * screen to *be* legacy's screen, not to resemble it, and re-drawing a 227×204 illustration that
 * already exists would be a second asset saying the same thing.
 *
 * Both pieces are committed, because **no static art comes from the CDN any more**
 * ([`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md)) — and this is the screen where the
 * argument is least about bytes: it holds card details, and every cross-origin request on it is one
 * more party in the transaction. `?v5`, legacy's cache-buster on the empty-state PNG, is now moot:
 * the file is in the repo, so its version is the commit it landed in.
 *
 * `empty` was a 341×306 source in a 227×204 box, so the encode clamps to the source's own resolution
 * rather than the 454 the box would ask for — 70 KB → 25 KB, nothing upscaled.
 *
 * ## Why `schemes` is a byte-for-byte copy rather than a re-encode
 *
 * `icon-cards.svg` is a **genuine** vector (40 paths, no embedded raster), so unlike the rest of the
 * re-encoded art there is nothing to compress — rasterising a strip of card-scheme logos would make
 * it soft at exactly the DPR it is read at. It was also the worst case for the *other* half of the
 * rule: a remote SVG is **passed through** `next/image` unchanged, so all 45 KB reached the browser.
 * Served from our own origin it gets brotli on the way out instead.
 */

export const CARD_MANAGEMENT_ART = {
    /** The empty state's illustration. Legacy's intrinsic 227×204. */
    empty: { src: '/illustrations/payment/no-cards.webp', width: 227, height: 204 },
    /**
     * The strip of accepted-scheme marks above the PCI line. 324×58, and it is the *reassurance* on a
     * screen that holds card details — which is why it renders in both the empty and the populated
     * state, as legacy does.
     */
    schemes: { src: '/illustrations/payment/card-schemes.svg', width: 324, height: 58 },
} as const
