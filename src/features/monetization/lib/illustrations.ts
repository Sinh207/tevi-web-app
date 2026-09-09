/**
 * `/monetization`'s two pieces of artwork, committed rather than fetched.
 *
 * The no-CDN rule and its three surprises are in
 * [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md); the short version is that a rendering
 * screen may not depend on another host, and that "small" is not the same as "local". Both files are
 * produced by `pnpm art:cdn` from the rows named `monetization-banner` and `paid-interactions` in
 * `scripts/build-cdn-art.mjs`, and `illustrations.test.ts` is what stops a revert to a CDN string
 * from passing quietly.
 *
 * The declared boxes are the ones legacy draws in — 100 wide for the banner mark (its height is the
 * source's own ratio, since legacy passes `height: 'auto'`), 229×131 for the dialog. Declaring the
 * drawn box rather than the file's own resolution is what lets `next/image` pick a sensible source
 * set instead of reserving space for pixels nobody sees.
 */

export const MONETIZATION_ART = {
    /** The banner's trailing mark — "Start earning with Tevi". */
    banner: { src: '/illustrations/monetization/banner.webp', width: 100, height: 67 },
    /** The revenue-explainer dialog's illustration. */
    paidInteractions: {
        src: '/illustrations/monetization/paid-interactions.webp',
        width: 229,
        height: 131,
    },
} as const

/**
 * `/monetization/membership`'s four pieces.
 *
 * ⚠ **Three of these declare a height legacy does not**, and the art script's rows say why at
 * length: legacy passes `width`/`height` pairs that do not match the source's aspect (229×153 over a
 * 408×323 file), which MUI squashes and Tailwind's `height: auto` does not — so the box would be
 * reserved at one shape and painted at another, and everything under it would jump as the bytes
 * land. Each height here is the source's own ratio at legacy's width.
 *
 * `crown` is the exception in kind rather than degree: legacy gives it a 140×140 slot with
 * `object-fit: contain`, so 140 square is the *slot*, and 140×99 is what a 358×254 source actually
 * paints inside it.
 */
export const MEMBERSHIP_ART = {
    /** The wall for a creator with no tier yet. */
    overview: {
        src: '/illustrations/monetization/membership-overview.webp',
        width: 229,
        height: 181,
    },
    /** The mascot on the hero card's trailing edge. */
    banner: {
        src: '/illustrations/monetization/membership-banner.webp',
        width: 170,
        height: 92,
    },
    /** The mark bleeding off the hero card's leading edge. */
    crown: { src: '/illustrations/monetization/crown.webp', width: 140, height: 99 },
    /** "No members yet", inside the list. */
    noMembers: { src: '/illustrations/monetization/no-members.webp', width: 190, height: 127 },
} as const

/**
 * `/monetization/donation`'s two pieces.
 *
 * ⚠ **Neither carries the height correction the membership four do**, and that is worth stating
 * rather than leaving as an absence: legacy's boxes here happen to *be* the sources' own ratio
 * (748×420 drawn at 374×210, 193×194 drawn at 95×95), so there is nothing to rescue. The trap those
 * four document — a box reserved at one shape and painted at another, everything below it jumping as
 * the bytes land — simply does not apply to these.
 *
 * `noSupporters` is **not** `MEMBERSHIP_ART.noMembers`. The two marks look alike and are different
 * files: legacy's members list draws `img-no-paid-post.png` and its supporters list draws
 * `img-no-active-members.png`. Pointing one at the other would be substituting one design's mark for
 * another's, silently and at half the resolution.
 */
export const DONATION_ART = {
    /** The wall for a creator who publishes no donation offer yet. */
    intro: { src: '/illustrations/monetization/donation.webp', width: 374, height: 210 },
    /** "No one supported yet", inside the list. */
    noSupporters: {
        src: '/illustrations/monetization/no-supporters.webp',
        width: 95,
        height: 95,
    },
} as const
