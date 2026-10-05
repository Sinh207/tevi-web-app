/**
 * Collections' empty-state art, committed under `public/illustrations/collection/` by
 * `scripts/build-cdn-art.mjs` — see [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 *
 * - `empty` (`collection-empty`) — no collections at all. Legacy's
 *   `IMAGES_STATIC.collection.imgCollection`, encoded from a 2.5 MB SVG-wrapped raster at 2× the
 *   225×255 box legacy draws it in.
 * - `noPosts` (`collection-no-posts`) — a collection with nothing in it. Legacy's
 *   `IMAGES_STATIC.post.isolation`, copied verbatim. Legacy draws it `100×100`, which squashes a
 *   94×118 drawing; the box here keeps the source's ratio at legacy's 100px height.
 */
export const COLLECTION_ART = {
    empty: { src: '/illustrations/collection/empty.webp', width: 225, height: 255 },
    noPosts: { src: '/illustrations/collection/no-posts.svg', width: 80, height: 100 },
} as const
