/**
 * `/premium`'s two pieces of art — **Brand's own, re-encoded** (`pnpm art:cdn premium-logo
 * premium-backdrop`).
 *
 * | file | Brand's SVG | here | drawn at |
 * |---|---|---|---|
 * | `logo` | **2.53 MB** — one 2126² PNG in a 113×123 box | **16 KB** WebP | 100 CSS px |
 * | `backdrop` | 152 KB — a 1200×1238 PNG behind a `<pattern>` | **19 KB** WebP | the hero's width |
 *
 * 2.68 MB → 35 KB, and the mark alone was 151× its own weight: a 2126×2126 raster to fill a 100px
 * badge, i.e. twenty-one times the resolution it can ever be seen at. `next/image` could not have
 * helped — it passes a **remote** SVG straight through, and `dangerouslyAllowSVG` is permission to
 * serve rather than to optimise. The backdrop is worse in kind: it is a CSS `background-image`, so
 * the optimiser never sees it at all and the browser downloads exactly those bytes.
 *
 * Committed rather than fetched, per [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md):
 * a rendering screen depends on no other host, and an asset's version is the commit it landed in.
 * `illustrations.test.ts` fails if either file is missing or is not the format it claims, which is
 * the failure that is otherwise invisible until somebody opens the page.
 *
 * ## The mark's box is legacy's, distortion included
 *
 * Legacy draws the 113×123 source in a 100×100 slot, squashing it by ten percent. Kept — the
 * pipeline changes bytes, not what people see, exactly as `identification/intro` keeps its five
 * percent. `width`/`height` here are that **drawn** box, not the encoded pixel size (the WebP is
 * 3× it, for a DPR-3 phone).
 *
 * ## The backdrop is only drawn for a member
 *
 * Legacy layers it over the hero's gradient when `isMyPremium` — a sparkle texture that marks the
 * "you are all set" state — and nothing draws it for a visitor. It is a `background-image` on the
 * hero section, so its declared box is its own resolution rather than a slot: a `contain` layer on
 * a section whose width is the viewport's has no fixed box to encode against, the same call
 * `membership/tier-bg` documents.
 */

export const PREMIUM_ART = {
    /** The Premium mark — a violet-and-gold badge. The hero's one image. */
    logo: { src: '/illustrations/premium/logo.webp', width: 100, height: 100 },
    /** The sparkle texture over the hero, for an account that already has Premium. */
    backdrop: { src: '/illustrations/premium/backdrop.webp', width: 628, height: 576 },
} as const

/**
 * `/gift-premium`'s two pieces, and only one of them is new.
 *
 * | state | file | Brand's | here |
 * |---|---|---|---|
 * | nothing typed yet | `premium/gift-invite.webp` | **1.05 MB** PNG, 1200×750 | **20 KB** WebP |
 * | nothing matched | `theo-search.svg` | 9 KB of real paths | the same file, uncopied |
 *
 * The invitation is Brand's own picture, re-encoded by `pnpm art:cdn gift-premium-invite` at the
 * 400×250 box the picker draws it in — 52× smaller. Not an SVG-with-a-raster-inside like the hero's
 * mark, so `next/image` *would* have processed it; it is committed for the other half of the cost
 * [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md) names, which is the optimiser
 * fetching and decoding a megabyte cross-origin on the first request for each size, on the opening
 * screen of a purchase flow.
 *
 * ## The "no results" art is deliberately **the same file** three other features point at
 *
 * `theo-search.svg` is genuine vector (9 KB of paths, no embedded raster), already in `public/`, and
 * already declared by `features/search`, `features/earnings` and `features/star-transfer` — each
 * with its **own** intrinsic size, because that is what differs between the screens. This is the
 * fourth such declaration and not an import: a feature may not reach into another's internals, and
 * a shared asset is shared by being one file in `public/`, not by one feature owning the constant.
 *
 * 120×120 is legacy's rendered size for this state and is not the file's own box (94×118) — its
 * stretch, kept, for the reason the whole pipeline exists: it changes bytes, not the picture.
 */
export const GIFT_PREMIUM_ART = {
    /** "Gift Premium, Share the Love" — the picker's opening block. */
    invite: { src: '/illustrations/premium/gift-invite.webp', width: 400, height: 250 },
    /** "Oops! No results found" — the same drawing `/search` shows for the same moment. */
    empty: { src: '/illustrations/theo-search.svg', width: 120, height: 120 },
} as const
