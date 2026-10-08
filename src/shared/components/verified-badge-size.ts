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
 * A `PremiumBadge` beside the tick takes **¾ of the box** (`VERIFIED_BADGE_CROWN`): the crown's
 * hexagon fills ~92% of its art against the tick's 75%, so that ratio draws the two at one height.
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

/** The `PremiumBadge` size that draws at the same height as a tick of each tier — see above. */
export const VERIFIED_BADGE_CROWN = {
    caption: 14,
    dense: 15,
    body: 18,
    title: 21,
} as const satisfies Record<VerifiedBadgeSize, number>
