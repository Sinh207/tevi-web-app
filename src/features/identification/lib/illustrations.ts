/**
 * The screen's three illustrations — Brand's art, re-encoded and committed.
 *
 * They are raster art rather than sprite glyphs, so they are not themeable: the same picture shows
 * in both modes, as it does in the mobile app and in legacy. Sizes are legacy's intrinsic ones
 * (`width`/`height` on its `ImageWithFallback`), kept so `next/image` reserves the right box and
 * nothing jumps when the art lands.
 *
 * ## Why local, when a remote `.png` is normally fine
 *
 * It is normally fine, and this module used to say so — `next/image` fetches a remote raster once,
 * server-side, and hands the browser an AVIF, which is why `my-star` and `my-wallet` still point at
 * the CDN. The reason these three are different is what "once" costs here:
 *
 * | | at origin | drawn at |
 * |---|---|---|
 * | `identification-center.png` | 1.22 MB (1093×728) | 300×190 |
 * | `identity-processed.png` | 1.42 MB (1024×1024) | 300×300 |
 * | `identity-verified.png` | 1.43 MB (1024×1024) | 300×300 |
 *
 * 4.1 MB the optimiser has to pull and decode for every size/format pair it has not cached, while
 * somebody sits on a KYC screen waiting to be told whether they are verified. Re-encoded at 2× the
 * declared box the set is 155 KB and the cold render is a local file read.
 *
 * Nothing is redrawn: `pnpm art:cdn` rasterises Brand's own pixels through Chromium, and the 300×190
 * box is legacy's own five-percent squash of a 1093×728 source, kept as it ships. See
 * [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 */

export const IDENTITY_ART = {
    intro: { src: '/illustrations/identification/intro.webp', width: 300, height: 190 },
    pending: { src: '/illustrations/identification/pending.webp', width: 300, height: 300 },
    verified: { src: '/illustrations/identification/verified.webp', width: 300, height: 300 },
} as const
