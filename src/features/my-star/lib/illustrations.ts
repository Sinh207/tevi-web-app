/**
 * `/my-star`'s empty-state artwork — Brand's own `my-wallet/no-tvs-transactions.png`, committed
 * rather than fetched.
 *
 * ## Why committed, when 26 KB was never the problem
 *
 * It was not: `next/image` handles a remote raster perfectly well. It is here because **no static art
 * comes from the CDN any more** ([`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md)) — a
 * screen that renders should not need a third host to be up, and an asset that can change under us
 * between a review and a deploy is not reviewable. Re-encoding is what that costs, and it happens to
 * pay: 26 KB → 10 KB.
 *
 * The source is **226×256 — a 1× asset**, so `build-cdn-art.mjs` declares `scale: 1` for it rather
 * than asking for a 2× that was never in the file. Nothing upscales; this is the same picture at the
 * same resolution in a better container.
 *
 * Size is legacy's intrinsic one (225×256 on its `<ImageWithFallback>`), declared so the box is
 * reserved and nothing reflows when the art decodes.
 *
 * The **filtered**-empty state reuses the same art: the design's behaviour note says that state
 * differs from the empty one by *copy only*, and a second asset to say the same thing in a different
 * picture is not a difference worth a request.
 */

export const MY_STAR_ART = {
    empty: { src: '/illustrations/my-star/empty.webp', width: 225, height: 256 },
} as const
