import type { TeviIconNameFilled } from '@shared/ui/icon-names'
import { MONETIZATION_DONATION_PATH, MONETIZATION_MEMBERSHIP_PATH } from '../routes'

/**
 * The four ways a creator earns on Tevi, in legacy's order — the hub's whole list.
 *
 * ## Data, not markup, and not a request either
 *
 * The same call `features/navigation/lib/menu-rows.ts` makes: order, glyphs and tile colours are a
 * table so the composition is written once. It is JSX-free and hook-free, which is what lets
 * `methods.test.ts` assert the set without a renderer.
 *
 * **The list is hard-coded because legacy's is.** `useHub.js` carries
 * `// TODO: Replace with real API data` over an `INITIAL_METHODS` array with an `isSetup` flag per
 * method — and nothing reads that flag: `MethodItem` renders every row identically whether it is set
 * up or not. So there is no endpoint to port and no state to show, and inventing one here would be
 * inventing a product behaviour rather than porting it. Whether such an endpoint exists is **B102**
 * in [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md); when it is answered this
 * table grows a `state` field and the rows grow a trailing mark.
 *
 * ## The glyphs are the sprite's, chosen against legacy's own drawings
 *
 * Legacy inlines four hand-authored SVGs — a crown, a star, a post rectangle and two overlapping
 * chat discs. None of them is a DS icon, and `CLAUDE.md` forbids hand-drawing a path, so each maps to
 * the nearest sprite glyph at the tile colour legacy paints behind it:
 *
 * | method | legacy glyph | legacy tile | here |
 * |---|---|---|---|
 * | Membership | crown | `#F97316` | `crown`, Warning |
 * | Direct donation | star | `#00C443` | `star`, Success |
 * | Pay-per-post | post rectangle | `#0061FF` | `document`, Indigo |
 * | Interaction | two chat discs | `#F97316` | `comments-dots`, Warning |
 *
 * The tokens are the account drawer's own `TILE` values — imported as literals rather than from
 * `@features/navigation`, since a feature may not reach into another's `lib/` and these are the DS's
 * accent tokens either way.
 *
 * ⚠ **`ad-rectangle` was the first choice for Pay-per-post and is wrong twice over**, in a way that
 * only a rendered tile shows: its `--filled` weight draws the letters *"Ad"* — a different product
 * — and its **bare** id is a solid rectangle with no interior at all, so on a coloured tile it is an
 * empty square and nothing about the page reports a missing glyph. `document--filled` is the nearest
 * drawing to legacy's own (a sheet with lines). The general trap is in `CLAUDE.md`: check the glyph
 * actually *has* the weight, and check what it draws.
 */
export type MonetizationMethodKey = 'membership' | 'donation' | 'pay-per-post' | 'interaction'

export type MonetizationMethod = {
    key: MonetizationMethodKey
    /** Translation key, resolved by the view — this module stays string-free. */
    labelKey: string
    icon: TeviIconNameFilled
    /** A CSS colour for the 32px tile. */
    tile: string
    /**
     * Where the row goes. **Omitted until the screen exists** — `ActionRows` renders a row with no
     * `href` as visibly not ready, which is the treatment that file argues for against the two
     * alternatives (a link to a 404, or a row that silently does nothing).
     */
    href?: string
}

export const MONETIZATION_METHODS: readonly MonetizationMethod[] = [
    {
        key: 'membership',
        labelKey: 'monetization_method_membership',
        icon: 'crown',
        tile: 'var(--accents-warning-active)',
        href: MONETIZATION_MEMBERSHIP_PATH,
    },
    {
        key: 'donation',
        labelKey: 'monetization_method_donation',
        icon: 'star',
        tile: 'var(--accents-success-active)',
        href: MONETIZATION_DONATION_PATH,
    },
    {
        key: 'pay-per-post',
        labelKey: 'monetization_method_pay_per_post',
        icon: 'document',
        tile: 'var(--accents-indigo-active)',
    },
    {
        key: 'interaction',
        labelKey: 'monetization_method_interaction',
        icon: 'comments-dots',
        tile: 'var(--accents-warning-active)',
    },
]

/**
 * How many days the hub's headline figure covers, as the label says out loud.
 *
 * Legacy hard-codes `30` into the sentence (`.replace('[%s]', 30)`) while the figure itself is
 * `income_usd` off the channel-stats endpoint, which states no window at all. The two are only
 * consistent if that field *is* a rolling 30-day total — which is **B102**. The number is here rather
 * than inline so the copy and the claim move together when it is answered.
 */
export const REVENUE_WINDOW_DAYS = 30
