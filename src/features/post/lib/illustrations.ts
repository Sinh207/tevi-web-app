/**
 * Collections' empty-state art, committed under `public/illustrations/collection/` by
 * `scripts/build-cdn-art.mjs` (`collection-empty`). Legacy's own
 * (`IMAGES_STATIC.collection.imgCollection`), encoded from a 2.5 MB SVG-wrapped raster at 2× the box
 * legacy draws it in — see [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 */
export const COLLECTION_ART = {
    empty: { src: '/illustrations/collection/empty.webp', width: 225, height: 255 },
} as const
