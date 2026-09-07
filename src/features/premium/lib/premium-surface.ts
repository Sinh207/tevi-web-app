import { cn } from '@shared/lib/utils'

/**
 * Premium's two brand paints — the gold and the violet ramp.
 *
 * ## Not the design system's, and deliberately so
 *
 * The DS draws its `Card type="premium"` as a lavender `Primary 400 → 300 → 500` ramp under a flat
 * `Accents/Yellow` hairline. The product ships a near-black-to-violet ramp under a four-stop gold
 * gradient. Those are two different surfaces rather than two readings of one, and the shipped one
 * is what people recognise as Premium — so it is what this screen wears. The DS has no gold ramp
 * at all, which is why the hexes are written out rather than approximated with `--accents-yellow`.
 *
 * ## Written here as arbitrary values, not added to `globals.css`
 *
 * `--gradient-brand-sweep` sets the precedent for a brand gradient becoming a named token, and this
 * one is deliberately **not** following it, for two reasons. It is used by one feature (plus the
 * drawer's card, below), so a token would be a global name for a local paint; and a new `@theme`
 * entry is the one change in this repo that fails *silently* in development — Turbopack serves the
 * stale stylesheet until `.next` is cleared, so the screen renders with no gradient and nothing
 * says why. `menu-profile-card.tsx` makes the same call for the same values.
 *
 * ## ⚠ The gold is duplicated
 *
 * `features/navigation/components/menu/menu-profile-card.tsx` holds a byte-identical copy as its
 * own `GOLD_GRADIENT`. That is the boundary rules working as intended — a feature may not import
 * another feature's internals, and neither of these two is the natural owner of the other's paint.
 * If a third surface needs it, it moves to `shared/` (the call `MY_STAR_CONTAINER` and
 * `GIFT_CODE_CONTAINER` already make about each other). Until then: **change both**, and the
 * pairing is stated in both files so the second one is findable.
 */
export const PREMIUM_GOLD =
    'bg-[linear-gradient(133.22deg,#ffc774_18.04%,#fff8ec_49.55%,#e8b558_74.66%,#ffe1a9_95.98%)]'

/**
 * The same gold, clipped to text.
 *
 * Its own constant because the two are not interchangeable: as a *fill* the gradient needs a dark
 * ink over it, and as *ink* it needs `bg-clip-text` plus a transparent colour. Written once so a
 * heading and a card cannot drift onto different stops.
 */
export const PREMIUM_GOLD_INK = cn(PREMIUM_GOLD, 'bg-clip-text text-transparent')

/**
 * The **flat** gold — the first stop of {@link PREMIUM_GOLD}, on its own.
 *
 * One consumer today: the discount chip on `/gift-premium`'s plan cards, where legacy paints a solid
 * `#FFC774` rather than the four-stop ramp. It is written out here rather than inline in the
 * component for the reason the whole file exists — a brand hex that lives in JSX is one nobody finds
 * when Brand changes it, and this one has to stay in step with the ramp's own first stop.
 *
 * Fixed in both themes, like the rest of this file: the chip sits on a violet card in Light and Dark
 * alike, so a token that inverted would put pale gold on pale violet in one of them.
 */
export const PREMIUM_GOLD_FLAT = 'bg-[#ffc774]'

/**
 * The hero band — near-black through violet, resolving into **the page's own ground**.
 *
 * Legacy's third stop is the literal `#F4F4F4` it paints its whole page with, which is Light mode's
 * `--background` and nothing at all in Dark: on a dark theme the band would end in a grey plate and
 * the page would carry on beneath it in near-black. So the last stop is `var(--background)`, which
 * is the one substitution in this file — the brand half is legacy's to the decimal, and the half
 * that has to agree with the app is a token.
 *
 * `180deg`, so there is nothing to mirror under `rtl:` — unlike the drawer card's 97deg ramp, whose
 * dark end sits behind an avatar and therefore has to flip.
 *
 * ## It ends **solid violet**, and the fade is a separate layer below the band
 *
 * Legacy's stops are percentages of the whole page (`#040013 0.48%, #4200C7 21.75%, #F4F4F4
 * 55.29%`), which means its violet runs on well past the plan cards — behind "What's included" and
 * the top of the benefits panel, showing as the two strips either side of that card. Percentages
 * cannot reproduce that here, because the band is only as tall as its own content: fading to
 * `100%` inside the band put the heading on the page's grey, and in the **member** state (no plan
 * cards, so a short band) it put the receipt line at 92% of the ramp — white text on near-white.
 *
 * So this ramp holds the violet to the band's last pixel, and the fade below it is the *next*
 * section's background — {@link PREMIUM_TAIL_RAMP}, applied by `PremiumView`. A background cannot
 * leave its own box, and the overlay that could was worse: see that constant.
 *
 * The `120px` stop is the dark end's, in px rather than a percentage for the same reason: it is the
 * bar's own height plus a little, so the near-black always sits behind the bar and never creeps
 * down into the copy on a short band.
 */
export const PREMIUM_HERO_RAMP = 'bg-[linear-gradient(180deg,#040013_0,#4200c7_120px,#4200c7_100%)]'

/**
 * The other half of that gradient: **the brand colour running on below the band**, as the background
 * of the section that follows it (`PremiumView` applies it).
 *
 * The two are one gradient split across two boxes, which is why they are declared together. 320px is
 * measured against legacy rather than picked: its fade begins at the section rule and is gone about
 * 550px later, with the benefits panel drawn over the whole of it. 320 puts the rule and the panel's
 * first rows on brand colour, which is what the comparison screenshots show.
 *
 * ## Why a background and not an overlay
 *
 * The first version was an absolutely-positioned span hanging off the band's bottom edge at
 * `-z-10`, and it **painted over the benefits panel**: a positioned layer inside the band's
 * stacking context cannot be put behind a *later* sibling, and negative z-index does not reach out
 * of an `isolate`d parent to help. A CSS background always paints behind its own element's
 * descendants, so the panel is over it by construction and no z-index is involved at all.
 *
 * It goes on the **wrapper** rather than on the benefits section itself because that section is
 * allowed to render nothing (a failed or empty benefits list), and the band must not end on a hard
 * violet edge in that case.
 */
/**
 * `/gift-premium`'s dissolve — **a 64px band of gradient with nothing readable on it.**
 *
 * `/premium` gets its fade from {@link PREMIUM_TAIL_RAMP}, a 320px background on the section that
 * follows the band: that works there because what is drawn over it is a *card* and a heading in
 * white-on-violet's own section, and 320px is what puts the benefits panel's first rows on brand
 * colour, as legacy's page-wide gradient does.
 *
 * It does **not** work on the gift screen, and the failure is the kind that only shows up in a
 * screenshot: the block under this band is `PremiumAbout`, whose "About Tevi Premium" heading takes
 * `--text-subtitle` — near-black, because on `/premium` it lands well below the fade, after a whole
 * benefits section. Here it is the *first* thing under the band, so it was drawn near-black on solid
 * violet, in both themes, unreadable and passing every check this repo makes.
 *
 * So the fade is its own element instead of a background behind content: a fixed 64px strip that
 * finishes the band, and everything after it sits on the page's own ground with its own ink. The
 * height is fixed rather than proportional because the two steps' bands differ by 400px (the offer
 * carries three plan cards, the success screen carries none) — a percentage would put the dissolve
 * in a different place on each.
 *
 * `#4200c7` is the ramp's own violet, so the seam is invisible; the far end is `var(--background)`
 * for the reason {@link PREMIUM_HERO_RAMP} gives — legacy's literal `#F4F4F4` is Light's page colour
 * and nothing at all in Dark.
 */
export const GIFT_PREMIUM_TAIL_FADE =
    'bg-[linear-gradient(180deg,#4200c7_0,var(--background)_100%)]'

export const PREMIUM_TAIL_RAMP =
    'bg-[linear-gradient(180deg,#4200c7_0,var(--background)_320px)] bg-no-repeat'

/**
 * The white-ink pair for text sitting on the violet.
 *
 * `#fff` and not `--text-on-primary`, because the band's colour is fixed in both themes: the token
 * flips with the mode and would put near-black text on near-black paint in Dark. Same reasoning as
 * the drawer card's ink, and the same trap `tinted-ground-needs-own-ink` describes.
 */
export const PREMIUM_ON_HERO = 'text-white'
export const PREMIUM_ON_HERO_MUTED = 'text-white/80'

/**
 * How thick the Premium mark is, in px — the width of the edge `PremiumMark` turns onto.
 *
 * 9 against a 100px face, which is a little under a tenth: enough to read as a solid object at the
 * halfway point of the turn and not so much that the badge looks like a hockey puck. The number is
 * here rather than in the component because it is a property of the *object* — the same register as
 * the gold it is painted in — and because the arithmetic in that file's note refers to it.
 */
export const PREMIUM_MARK_THICKNESS = 9

/**
 * The spin's own period, in ms — **the number `PREMIUM_SPIN`'s keyframe runs at**, kept here because
 * the phase arithmetic needs it and two components now do that arithmetic.
 *
 * It lives beside {@link PREMIUM_MARK_THICKNESS} rather than in `shared/lib/motion.ts` for the same
 * reason those do: it is a property of the *object* this feature draws, and `motion.ts` publishes
 * class strings rather than the numbers inside them. ⚠ It has to stay equal to the duration in
 * `PREMIUM_SPIN`; they are one animation described twice, and a mismatch shows as faces drifting
 * apart over a minute rather than as anything failing.
 */
export const PREMIUM_TURN_MS = 6000

/**
 * A surface's phase offset, as the negative `animation-delay` that produces it.
 *
 * Every surface of a turning object runs the *same* 0-360° keyframe; starting one of them `-d` into
 * the cycle is what puts it `d/period × 360°` ahead. That is how a back face sits half a turn from
 * the front and how each slice of the thickness sits a degree or so from its neighbour — one
 * animation, no extra keyframes.
 *
 * Shared because `PremiumMark` and `GiftPremiumMark` are the same construction around different art,
 * and a second copy of this line is a second place for the sign to be wrong.
 */
export function premiumSpinPhase(degrees: number): string {
    return `${-(degrees / 360) * PREMIUM_TURN_MS}ms`
}

/**
 * How many gold slices stand between the two faces.
 *
 * Eight, spread evenly through {@link PREMIUM_MARK_THICKNESS}, which puts them about a pixel apart —
 * close enough that edge-on they read as one solid bar rather than as a comb. More would be
 * invisible; fewer show as stripes at the halfway point of the turn.
 */
export const PREMIUM_MARK_SLICES = 8

/**
 * The sparkle's shape and its three paints have **moved to `shared/lib/premium-sparkle.ts`**.
 *
 * They were here while `/premium`'s field was their only consumer. `PremiumBadge` is the second, and
 * it lives in `shared/` — which may not import a feature — so the constants had to go down a layer
 * rather than be copied. That is the call this file already states about the gold gradient: two
 * features may each hold their own copy, a third consumer moves it to `shared/`.
 *
 * The gold itself stays here (and duplicated in `menu-profile-card.tsx`), because it still has only
 * those two consumers.
 */
export { PREMIUM_SPARK_PAINTS, PREMIUM_SPARK_SHAPE } from '@shared/lib/premium-sparkle'
