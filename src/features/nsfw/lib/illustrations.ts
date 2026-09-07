/**
 * The one piece of art this feature draws: the appeal queue's **cleared** state.
 *
 * ## Provenance, because this one did not come off the CDN
 *
 * Like `features/auth`'s two-step mark, it has never been published to `static.tevi.dev`. It exists
 * only inside the design file — Figma `5A.2025`, page `[1409] Optimze NSFW theo Level`, node
 * **`1468:71539`** (a group named `thumb-up`), drawn at 75×104 — so it was exported straight from
 * there and committed rather than added to `scripts/build-cdn-art.mjs`'s `SOURCES`, which fetches
 * URLs and would be a build that breaks when a Figma render link expires.
 *
 * **Real vector, so it ships as `.svg`** — 5.5 KB of paths with no embedded raster, which is the
 * case `docs/STATIC_ASSETS.md` contrasts with `no-blocked-accounts.svg`'s 2.18 MB PNG-in-a-wrapper.
 * Nothing is rasterised and nothing is re-encoded.
 *
 * ## It is not themed, and that is safe here
 *
 * The line art is `#141414` — which would vanish on a dark page — but every one of those strokes is
 * drawn **on the character's own `#70B7FF` body**, not on the page. What meets the background is the
 * white outline around the silhouette, which reads as a sticker edge in both modes. So the file is
 * committed exactly as Figma exports it; do not "fix" the two hard-coded colours into tokens without
 * looking at it on black first.
 */
export const NSFW_APPEAL_ART = {
    /** Figma's own box for the group. */
    cleared: { src: '/illustrations/nsfw/appeal-cleared.svg', width: 75, height: 104 },
} as const
