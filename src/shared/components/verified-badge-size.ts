/*
 * No `'use client'`, on purpose: these are values, and a server component importing a value from a
 * client module receives a client *reference* instead — `VERIFIED_BADGE_SIZE.body` reads as
 * `undefined` and nothing fails. Kept apart from `verified-badge.tsx` so an RSC can size a crown.
 */

/**
 * **One tick size per text style, not a free number.** The box is the line box of the name it
 * follows — the type scale's `font-size × 1.5`, rounded to an even pixel — so a tick is as tall as
 * its name's line and never grows the row. The art's tick fills only the middle 75% of the PNG, so
 * that box draws a mark about 1.1× the name's font size, which is where it reads as part of the
 * name rather than as a footnote to it.
 *
 * This used to be a `number`, and fifty call sites had picked 12, 14, 16, 18 or 24 by hand — a
 * `type-body-strong` name carried a 16 in one list and a 24 in the next. Naming the tier by the
 * text style is what keeps them in step: pass the tier of the `type-*` class the name is set in.
 *
 * A `PremiumBadge` beside the tick is sized by `VERIFIED_BADGE_CROWN` — see there.
 */
export const VERIFIED_BADGE_SIZE = {
    /** `type-caption-*` — 12px text, 18px line. */
    caption: 18,
    /** `type-dense-*` — 14px text, 21px line. */
    dense: 20,
    /** `type-body-*` — 16px text, 24px line. */
    body: 24,
    /** `type-title-t2-*` — 20px text, 30px line. */
    title: 28,
} as const

export type VerifiedBadgeSize = keyof typeof VERIFIED_BADGE_SIZE

/**
 * The `PremiumBadge` size that *reads* the same height as a tick of each tier.
 *
 * ## ¾ of the tick box measures level, and reads small
 *
 * The crown's hexagon fills its whole box (measured 18px of ink in an 18px badge, 16.5 wide), and
 * the tick fills the middle 75% of its PNG — so `0.75 × VERIFIED_BADGE_SIZE` puts the two at the
 * same measured height, which is what this table used to be. Beside the tick it still read a size
 * smaller: it is a **pointy-topped hexagon**, touching the line box at one point where the tick's
 * disc fills it, and narrower than it is tall.
 *
 * So it is sized **~1.05× the tick's visible height**, judged side by side on `/dev/following`
 * (18 → 19 at `body`: 19 matched, 20 overtook the tick). Less than `VERIFIED_BADGE_TIER`'s ~1.11×
 * because the crown is a solid, saturated fill with a dark rim; the tier marks are pale and
 * bevelled, and lose more of their apparent size to it.
 */
export const VERIFIED_BADGE_CROWN = {
    caption: 14,
    dense: 16,
    body: 19,
    title: 22,
} as const satisfies Record<VerifiedBadgeSize, number>

/**
 * The height a **space-tier mark** draws at beside a tick of each tier — the third mark on the name
 * row, after the tick and the crown.
 *
 * ## Geometry says 0.75 × the tick box; the eye says ~11% more
 *
 * Every tier mark the backend serves fills its file edge to edge (measured 98–100% of the height on
 * tiers 1, 2, 5 and 10, at any alpha cut-off), and the tick fills the middle 75% of its PNG — so
 * `0.75 × VERIFIED_BADGE_SIZE` puts the two at the same measured height. It was shipped that way and
 * the tier still **read smaller** beside the tick and the crown, and that was right: the marks are
 * pointy-topped hexagons with a pale bevelled rim, against a solid disc and a solid crown. A point
 * touches the line box at one pixel where a disc fills it, and a light rim reads as edge rather than
 * body — the same reason type overshoots its round letters past the cap height.
 *
 * So the mark is sized **~1.11× the tick's visible height**, judged side by side on `/dev/following`
 * (18 → 20 at `body`: 20 matched, 21 overtook the tick). Height only: the marks are not square
 * (`tier-2` is 547×480, `tier-5` 195×160), so the caller sets this as the height and lets the width
 * follow the art. Anything that should match the *tick* (the 18+ mark) derives from
 * `VERIFIED_BADGE_SIZE`, not from this.
 */
export const VERIFIED_BADGE_TIER = {
    caption: 15,
    dense: 17,
    body: 20,
    title: 23,
} as const satisfies Record<VerifiedBadgeSize, number>
