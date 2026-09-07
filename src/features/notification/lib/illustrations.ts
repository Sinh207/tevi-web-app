/**
 * The inbox's empty-state artwork.
 *
 * Legacy points `next/image` at `${STATIC_DOMAIN}/web/web-app/images/theo-empty-inbox.svg`, and
 * this is the case in [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md) that the rule is
 * written for from the *other* side: it is a **real vector**, 17.8 KB, no embedded raster — so
 * there is nothing to rescue and nothing to re-encode. Rasterising it would make it worse.
 *
 * It is committed anyway, byte for byte (`mode: 'copy'` in `scripts/build-cdn-art.mjs`), for the
 * reason that outlives the byte budget: `next/image` passes a remote SVG through **unprocessed**,
 * so a cross-origin request on a screen somebody is waiting on buys nothing, and CLAUDE.md's rule
 * is that a rendering screen depends on no other host. Nothing is redrawn, recoloured or resized —
 * the file is Brand's own, at its own dimensions.
 *
 * Guarded by `illustrations.test.ts`, which asserts the file exists and is really an SVG.
 *
 * ⚠ **It is light-mode art**, and visibly so: the mailbox post and Theo's headphone cable are
 * near-black strokes, which read as intended on `--background-surface` in Light and go muddy
 * against `#18181b` in Dark. Rendered in both and left as it is — nothing here may be recoloured
 * (CLAUDE.md: never substitute a shape, never hand-draw), and every other committed illustration
 * in this app has the same property, so a one-off fix would be the inconsistency. A standing
 * request to Brand for a dark variant; the day one lands, this becomes two entries and a
 * `prefers-color-scheme` swap at the call site.
 */
export const NOTIFICATION_ART = {
    /**
     * Legacy's declared box is 210×223 while the file's own viewBox is 211×226 — a one-pixel
     * squash nobody would see. The file's dimensions win here, because `mode: 'copy'` means the
     * bytes are not re-encoded to any box and a `width`/`height` pair that disagrees with the
     * intrinsic ratio is what makes `next/image` letterbox it.
     */
    empty: { src: '/illustrations/notification/theo-empty-inbox.svg', width: 211, height: 226 },
} as const
