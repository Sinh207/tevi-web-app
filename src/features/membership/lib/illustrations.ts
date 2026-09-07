/**
 * This feature's empty-state artwork.
 *
 * Legacy draws `IMAGES_STATIC.images.theoSearch` for both of this screen's empty states — the
 * never-joined one and the no-results one — and that is the same file `features/earnings` already
 * ships locally at `public/illustrations/theo-search.svg`.
 *
 * **Local rather than remote, and the reason is format, not hosting**: `next/image` cannot optimise
 * a remote SVG, it passes one through. `EARNINGS_ART` has the full argument for keeping Brand's 9 KB
 * vector in `public/`; this is the same asset for the same reason, so it points at the same file
 * rather than adding a second copy.
 *
 * Reused for the **filtered** empty state as well, exactly as legacy does: those states differ from
 * the plain empty one by copy only, and a second picture to say the same thing in a different
 * drawing is not worth a request.
 *
 * 94×118 is the file's intrinsic box, declared so the space is reserved and nothing reflows when the
 * art decodes.
 */
export const MY_MEMBERSHIP_ART = {
    empty: { src: '/illustrations/theo-search.svg', width: 94, height: 118 },
} as const

/**
 * The join dialog's tile art — legacy's `membership/theo-membership.svg`, committed.
 *
 * A **byte-for-byte copy** rather than a re-encode: it is a real vector at 8.2 KB (15 paths, no
 * embedded raster), and rasterising it would cost crispness to save nothing. It is local for the
 * same reason everything else here is — no static art comes from the CDN any more
 * ([`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md)). It is not the same file as the
 * empty state's `theo-search.svg`, so it gets its own copy rather than sharing that one.
 *
 * `NEXT_PUBLIC_STATIC_DOMAIN` is gone from this file, which also removes the hazard the old comment
 * described: the variable is optional, and an `<Image>` with `undefined` in `src` throws at render.
 */

export const MEMBERSHIP_JOIN_ART = '/illustrations/membership/theo.svg'

/**
 * The tier card's backdrop — legacy's `home/bg-membership-checkout.png`, drawn `cover` / `center` /
 * `no-repeat` behind the name and the price.
 *
 * (Note the folder it came from: `/home/`, not `/web/web-app/membership/`. Legacy keeps this one with
 * the donation art rather than with the other three membership files, which is why looking in the
 * obvious place turns up nothing.)
 *
 * ## A `background-image`, which is the case `next/image` never sees
 *
 * No optimiser, no AVIF, no responsive widths: the browser fetches exactly this file, whatever it is.
 * So it is encoded at the source's own 1098×273 rather than at a display box — `cover` on a card
 * whose width is the dialog's has no fixed box to encode against — and 13.6 KB of PNG still became
 * 3.0 KB of WebP, because nothing else was ever going to compress it. CSS background art is the
 * category most likely to be assumed handled and never measured, which is why
 * [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md) calls it out by name.
 *
 * ## Light only, and that is the honest half-measure
 *
 * It is a **pale lavender** raster — a fixed-colour surface, like the overlay bar in
 * `features/channel`. But unlike that one there is no `.light` class to pin a subtree to (Light is
 * bare `:root`), so the card cannot carry the artwork *and* keep readable text in Dark: DS text
 * tokens go pale there, and pale text on pale paper is unreadable.
 *
 * So the image is applied in Light and dropped in Dark, where the card falls back to the flat
 * `--background-segment` it had before. A tinted-for-dark version of this asset is the real fix and
 * it has to come from design; this is one class (`dark:bg-none`) away from taking it.
 */
export const MEMBERSHIP_TIER_BG = '/illustrations/membership/tier-bg.webp'

/**
 * ⚠ **The benefit rows use no CDN art** — and this note is what stops it being tried a third time.
 *
 * Legacy draws those three rows from **inline `<path>` data pasted into the component**, a 32×27
 * viewBox that exists nowhere else. That is not a thing to copy: a bespoke path in a TSX file is
 * exactly what the sprite pipeline exists to prevent. So they take sprite glyphs true about the
 * **noun** — live, post, chat — and the sentence beside them carries "members-only". The DS has no
 * members-only glyph (no `image-lock`, no `chat-lock`), and saying so is `CLAUDE.md`'s instruction
 * rather than picking a shape that means something else.
 */

/**
 * The **identity** section's two illustrations — `membership/important-chat.svg` (201×25) and
 * `membership/post-comments.svg` (214×51).
 *
 * ## These are pictures of the badge, and that is the whole point
 *
 * The section answers "what will people see next to my name", so it shows it: a live-chat line and a
 * post comment, each with the **MEM** badge drawn in. An earlier pass rendered one sprite glyph here
 * instead — `premium` — which was wrong twice over. It said one thing where legacy says two, and
 * **`premium` is a different product**: Tevi Premium is a platform subscription, a member badge is a
 * creator's tier. Putting the Premium mark on the row that explains membership identity is the kind
 * of error that is invisible until somebody buys the wrong thing.
 *
 * The same two files were briefly used as 32px leading icons and rendered as slivers, which is what
 * their aspect ratios are for: they are **full-width strips**, drawn to sit inside a card under a
 * label. `message.svg` sits in the same Brand folder and legacy does not use it on this screen.
 *
 * Both are real vectors (3.0 and 3.2 KB), so `pnpm art:cdn` copies them byte for byte rather than
 * re-encoding. They were the last two CDN references in this feature, and the reason they survived
 * the first pass is worth keeping: they were **under budget**, so the audit measured them and said
 * nothing. Small is not the same as local — see
 * [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 */
export const MEMBERSHIP_IDENTITY_ART = {
    liveChat: { src: '/illustrations/membership/live-chat.svg', width: 201, height: 25 },
    postComments: { src: '/illustrations/membership/post-comments.svg', width: 214, height: 51 },
} as const

/**
 * The live-chat strip's backdrop — legacy's
 * `linear-gradient(90.92deg, rgba(255,0,0,.4) 1.04%, rgba(255,153,0,.4) 100%)`.
 *
 * Kept as literals and **not** flipped for Dark, for the reason `shared/ui/app-bar.tsx` gives about
 * its overlay theme: this is artwork, not a surface. The illustration on top is drawn to read
 * against this exact wash, and the wash is translucent, so it sits correctly on either ground.
 */
export const MEMBERSHIP_LIVE_CHAT_GRADIENT =
    'linear-gradient(90.92deg, rgba(255, 0, 0, 0.4) 1.04%, rgba(255, 153, 0, 0.4) 100%)'
