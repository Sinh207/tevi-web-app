/**
 * What a Premium sparkle is made of — one shape and three paints.
 *
 * ## Why this is in `shared/` and the gold is not
 *
 * `/premium`'s burst was the only consumer while these lived in `features/premium/lib`. The second
 * is `PremiumBadge`, which is a `shared/` component and therefore cannot import a feature — so the
 * constants come down a layer instead of being copied. Same rule `premium-surface.ts` states about
 * the gold gradient, which still has exactly two consumers and so stays duplicated between them.
 *
 * Kept apart from `shared/lib/motion.ts`: that file is the list of what *moves* and the classes that
 * move it. This is what the moving thing is made of.
 */

/**
 * The three paints the sparkle field is drawn in ({@link PREMIUM_SPARK} drives the particles).
 *
 * **Sampled from the mobile app's own Premium screen**, which is the reference for this treatment:
 * its field is magenta, violet and a cold blue over the dark top of the ramp — not gold. The first
 * version *was* gold, taken from the frame's gradient, and it read as one more piece of the badge
 * instead of as the space around it.
 *
 * `bg-` and not `text-`: a particle is a clipped `<span>`, not a glyph — see `PremiumSparkField` for
 * why the design system's sprite cannot supply this shape. Literals for the same reason the gradient
 * above is one: the DS draws no particle field, so there is no token to reach for, and this file is
 * where every hex Premium paints with lives. They are eyeballed off a screenshot rather than
 * exported from Figma — decoration, and stated as such instead of implied to be exact.
 *
 * Ordered light → saturated on purpose, and the generator draws the first one three times as often:
 * the band ramps from near-black to bright violet in its first 120px, so the lavender is what still
 * reads on the lower half while the two saturated tints carry the dark top. A field in one ink
 * disappears across half its own area.
 */
export const PREMIUM_SPARK_PAINTS = [
    'bg-[#e4d3ff]', // lavender — reads on both halves of the ramp
    'bg-[#e879c9]', // magenta
    'bg-[#7aa2ff]', // cold blue
] as const

/**
 * The four-point sparkle itself, as a `clip-path`.
 *
 * **Not an icon, and that is the whole argument.** `CLAUDE.md` says glyphs come from the DS sprite
 * and are never hand-drawn, which is right for anything that means something — a control, a status,
 * a row's leading mark. This is a decorative particle: it carries no meaning, it is `aria-hidden`, no
 * DS component contains it, and it is drawn at sizes down to 4px where a glyph is a smudge.
 *
 * The library was checked first and has no single four-point sparkle: `sparkles` is a **cluster** of
 * one large and two small ones, `ai-sparkle` and `sparkles-ai` are lettered "AI" badges, and
 * `star`/`star-star` are five-pointed. Stamping the cluster eighty times is what the first attempt
 * did, and it reads as repeated clip-art rather than as a field — which is the note the reference
 * screenshot came back with.
 *
 * The arms are cut at 45/55% rather than the usual 42/58, which is what makes them thin and tapered
 * like the reference's instead of a fat plus sign.
 */
export const PREMIUM_SPARK_SHAPE =
    'polygon(50% 0%, 55% 45%, 100% 50%, 55% 55%, 50% 100%, 45% 55%, 0% 50%, 45% 45%)'

/**
 * The paints for a sparkle coming off the **crown badge** — four, and chosen by measurement.
 *
 * `PREMIUM_SPARK_PAINTS` above is picked against `/premium`'s hero, a near-black-to-violet band, and
 * it does not transfer: the badge sits beside a display name on the page's own ground, which is
 * near-white in Light. The first attempt here swapped the field's palette for the crown's own gold —
 * and that was the wrong correction, made by eye. Contrast against the three grounds this badge
 * actually stands on says so:
 *
 * | tint | light `#f4f4f5` | dark `#09090b` | drawer card `#4200c7` |
 * |---|---|---|---|
 * | the hero's lavender `#e4d3ff` | **1.27** | 14.3 | 7.3 |
 * | gold `#ffc774` | **1.40** | 13.0 | 6.7 |
 * | deep gold `#e8b558` | **1.71** | 10.6 | 5.4 |
 *
 * The golds are the *weakest* things on a white row — barely better than the lavender they replaced.
 * They looked fine in review only because the sparks had been made bigger in the same pass, which is
 * a lesson about changing two variables at once, not about colour.
 *
 * So: **multi-coloured, like the hero**, but sorted by worst case rather than by the ground it was
 * drawn for. Each tint below is the strongest member of its family across all three grounds, and the
 * weakest link is 2.31 rather than 1.27 — decoration does not need 4.5:1, but it does have to be
 * *there* on every surface the mark appears on.
 *
 * Deliberately not theme-swapped: the badge's own art does not change between modes either, and a
 * mark that recolours itself stops being one recognisable thing.
 */
export const PREMIUM_BADGE_SPARK_PAINTS = [
    'bg-[#ec4899]', // pink — worst case 2.90
    'bg-[#a855f7]', // violet — 2.58
    'bg-[#60a5fa]', // cold blue — 2.31, the hero's blue one step deeper
    'bg-[#d97706]', // amber — 2.90, the tie back to the crown's gold, dark enough to survive white
] as const
