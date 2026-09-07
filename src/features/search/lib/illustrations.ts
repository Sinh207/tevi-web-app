/**
 * This feature's empty-state artwork — one piece, and it is already in the repo.
 *
 * Legacy draws `IMAGES_STATIC.images.theoSearch` for this screen's "no results" state, which is
 * `${STATIC_DOMAIN}/web/web-app/images/theo-search.svg` — **genuine vector art** (9 KB of paths,
 * no embedded raster), so it is committed as `.svg` and served as-is rather than rasterised. That
 * is the case `docs/STATIC_ASSETS.md` calls out as the *opposite* of `no-blocked-accounts.svg`,
 * whose 2.18 MB is an SVG wrapper around a 1536×1024 PNG.
 *
 * The file is **shared** with `features/earnings` and `features/star-transfer`, which draw the
 * same picture for their own empty states — the same asset, one copy in `public/`. Each feature
 * points at it with its own intrinsic size, which is what differs: legacy renders it at 94×118 on
 * the earnings report, 120×120 on the transfer history, and **120×120 here**
 * (`containers/search/components/noData`).
 *
 * 120×120 is not the file's own box (94×118), and that is legacy's stretch rather than a
 * correction to make: `ChannelEmptyState` caps the art at its declared width, so the number here
 * is the size the piece is drawn at on *this* screen. Declared as legacy renders it so the search
 * screen's art matches the app's, which is what people recognise.
 */
export const SEARCH_ART = {
    /** Legacy's rendered size on this screen (`width`/`height` on its `next/image`). */
    empty: { src: '/illustrations/theo-search.svg', width: 120, height: 120 },
} as const
