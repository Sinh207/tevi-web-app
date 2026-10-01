/**
 * Premium's gold — the four-stop ramp legacy paints every Premium frame with.
 *
 * Not the design system's: the DS has no gold ramp at all (its premium card is a lavender ramp
 * under a flat `Accents/Yellow` hairline), so the hexes are Tevi brand values written out rather
 * than approximated with `--accents-yellow`. Fixed in both themes — it is a brand paint, not ink.
 *
 * It lives in `shared/` because it has three owners and none of them is the natural home for the
 * other two: `features/premium`'s screens (`lib/premium-surface.ts` re-exports it), the drawer's
 * profile card, and the shell avatar frame (`shared/components/premium-avatar-frame.tsx`). It was
 * duplicated between the first two until the third arrived, which is the point the old note said
 * it would move.
 */
export const PREMIUM_GOLD =
    'bg-[linear-gradient(133.22deg,#ffc774_18.04%,#fff8ec_49.55%,#e8b558_74.66%,#ffe1a9_95.98%)]'
