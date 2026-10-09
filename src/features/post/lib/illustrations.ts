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

/**
 * The reaction star's two resting frames — 0 and `REACTED_FRAME` — rendered out of
 * `public/lotties/icon-star-reactions.json` by `scripts/build-reaction-stills.mjs`
 * (`pnpm art:reaction`), at 3× the 40px box. Not from the CDN: they are frames of an animation this
 * repo already commits, and **must be re-rendered when that JSON changes**. `ReactionStar` says why
 * the control draws stills at all.
 */
export const REACTION_STILLS = {
    off: { src: '/illustrations/post/reaction-star-off.webp', width: 40, height: 40 },
    on: { src: '/illustrations/post/reaction-star-on.webp', width: 40, height: 40 },
} as const
