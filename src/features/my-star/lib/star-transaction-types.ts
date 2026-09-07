import type { TranslationKey } from '@shared/i18n/settings'
import type { TeviIconName } from '@shared/ui/icon-names'

/**
 * The transaction types the **Star** ledger can contain, and what they are called.
 *
 * Ported from legacy's `FILTER_TYPE.getAll('tvs')`
 * (`containers/myWallet/components/transactionHistory/constant.js`). `features/my-wallet` has its own,
 * different list — and that separation is the reason these tables are per-feature rather than shared:
 *
 * | | Star ledger | currency ledger |
 * |---|---|---|
 * | shared | adjustment · bonus · conversion · refund · reward · system_deduction | ← same six |
 * | only there | **consumption · top_up · transfer_inbound · transfer_outbound** | charge · commission · payout · payout_failure · platform_earning |
 *
 * A `payout` cannot happen in Star and a `top_up` cannot happen in USD, so offering either filter on
 * the wrong screen is offering a filter that can only ever return nothing — and an empty list reads as
 * "no activity", not as a bad filter. B36 asks whether the split is real.
 *
 * ## Two labels do not match their slug, and both are product words
 *
 * `consumption` → **Donate** and `top_up` → **Recharge**. Legacy's own `getLabel` does this and the
 * mobile apps show the same words; deriving a label from the slug would produce "Consumption" and "Top
 * up", neither of which appears anywhere in the product.
 *
 * ## An unknown type is shown, not dropped
 *
 * `starTransactionLabelKey` returns `null` for a type this file does not know, and the row falls back
 * to the backend's own `description`. Legacy drops unknown types, and the consequence on a *ledger* is
 * money the reader cannot account for.
 */

export interface StarTransactionType {
    /** The backend's slug, lower-cased. `''` is the "no filter" pseudo-type. */
    key: string
    /** `{module}_{slug}` translation key. */
    label: TranslationKey
}

/** `''` — the pseudo-type the filter list opens with. Never sent to the API. */
export const ALL_STAR_TRANSACTIONS = ''

/**
 * The filter list, in legacy's order — alphabetical by slug after the "All" row, which is also the
 * order the mobile apps show. Fixed here rather than taken from a payload, for the reason
 * `REVENUE_CATEGORIES` gives: a menu whose rows move between openings is a menu the reader has to
 * re-read every time.
 */
const STAR_TYPES: readonly StarTransactionType[] = [
    { key: ALL_STAR_TRANSACTIONS, label: 'balance_type_all' },
    { key: 'adjustment', label: 'balance_type_adjustment' },
    { key: 'bonus', label: 'balance_type_bonus' },
    // `consumption` is what the wire calls it; a donation is what it is.
    { key: 'consumption', label: 'balance_type_donate' },
    // `conversion` on the wire, "Exchange" on screen.
    { key: 'conversion', label: 'balance_type_exchange' },
    { key: 'refund', label: 'balance_type_refund' },
    { key: 'reward', label: 'balance_type_reward' },
    // `top_up` on the wire, "Recharge" on screen.
    { key: 'top_up', label: 'balance_type_recharge' },
    { key: 'transfer_inbound', label: 'balance_type_transfer_in' },
    { key: 'transfer_outbound', label: 'balance_type_transfer_out' },
    { key: 'system_deduction', label: 'balance_type_system_deduction' },
] as const

/**
 * The glyph in a row's 40px leading disc.
 *
 * ## Read off `web-app`'s own per-type icons, which it does have
 *
 * An earlier note here said legacy "has three icons and picks by **currency**, not by type". That was
 * wrong, and it is worth stating plainly because the mapping below was built on it: `web-app` has
 * `containers/myWallet/components/common/transactionItem/icons/typeIcons.js` plus an `ICON_BY_TYPE`
 * dispatch in `TransactionIcon.js`, covering **ten** types. Currency is only its *fallback* — a Star
 * or a dollar mark for a type the table does not know.
 *
 * So the shapes are legacy's, glyph for glyph, wherever it draws one. Each was read off its path data
 * rather than its export name:
 *
 * | type | `web-app` draws | DS glyph |
 * |---|---|---|
 * | `adjustment` | three sliders | `sliders-simple` |
 * | `bonus` | a star with a sparkle | `star-magic` |
 * | `consumption` | a **gift box** | `gift-simple` |
 * | `conversion` | two horizontal arrows, opposed | `arrows-repeat` — see below |
 * | `refund` | an **undo arc** | `arrow-undo` |
 * | `reward` | a trophy with a **star** in it | `trophy-star` |
 * | `system_deduction` | a circle with a minus | `minus-circle` |
 * | `top_up` | an arrow down onto a line | `arrow-down-line` |
 * | `transfer_inbound` / `_outbound` | diagonal arrows in / out | `arrow-down-left` / `arrow-up-right` |
 *
 * **`conversion` is the one glyph that is not legacy's**, and it is a product call rather than a
 * mistake. `web-app` draws a plain two-headed horizontal arrow, which `arrows-left-right` matches
 * exactly — and at 20px inside a 40px disc it is a thin line with nothing to hold the eye, next to
 * rows carrying a sack, a bank and a trophy. `arrows-repeat` is two opposed arrows closing into a
 * cycle: same meaning (a two-way movement), a closed shape that reads at that size, and no second
 * reading — `arrows-retweet` says *share* and `arrows-rotate` says *refresh*, neither of which is
 * what an exchange between Star and USD is. The DS's own exchange mark exists but only fused into
 * `bell-exchange` and `search-exchange`; it ships no standalone form, and this is not the case that
 * warrants taking one from upstream Zappicon. *
 * Four were wrong before this was checked: `bonus` had the gift box (which is `consumption`'s), so
 * `consumption` had been given a `heart`; `refund` had `arrow-turn-down-left`, a *turn* rather than an
 * undo; `reward` had the plain `trophy-simple`; and `conversion` had `arrows-repeat`, two arrows in a
 * cycle rather than the pair legacy draws. None of them is a wrong *concept*, which is exactly why a
 * reading of the source rather than of the export names was needed.
 *
 * ## Where this is still richer than legacy, and that part was true
 *
 * Every type this ledger can hold **does** have an entry in legacy's table, so nothing here is
 * invented — unlike the currency ledger, where five types fall through to legacy's dollar mark and
 * `features/my-wallet` picks a glyph for each. The two tables are still separate files: they answer
 * different endpoints with different vocabularies, and that is the whole reason these are two
 * features.
 *
 * Every name is from the DS sprite subset and nothing is hand-drawn.
 */
const STAR_ICONS: Record<string, TeviIconName> = {
    adjustment: 'sliders-simple',
    bonus: 'star-magic',
    consumption: 'gift-simple',
    conversion: 'arrows-repeat',
    refund: 'arrow-undo',
    reward: 'trophy-star',
    top_up: 'arrow-down-line',
    transfer_inbound: 'arrow-down-left',
    transfer_outbound: 'arrow-up-right',
    system_deduction: 'minus-circle',
}

/** The filter options for the Star ledger. */
export function starTransactionFilters(): readonly StarTransactionType[] {
    return STAR_TYPES
}

/**
 * Whether a slug is one this ledger can contain.
 *
 * The guard for a filter arriving from outside the picker — today only the initial value, but the
 * moment `?type=` becomes a URL parameter this is what stops a hand-typed `payout` from asking the
 * Star endpoint a question with no answer.
 */
export function isStarTransactionFilter(type: string): boolean {
    return STAR_TYPES.some(entry => entry.key === type)
}

/** The translation key for a type, or `null` when this file does not know it — see the doc above. */
export function starTransactionLabelKey(type: string): TranslationKey | null {
    if (type === ALL_STAR_TRANSACTIONS) return null
    return STAR_TYPES.find(entry => entry.key === type)?.label ?? null
}

/**
 * The glyph for a type — legacy's `TransactionIcon` dispatch, reproduced.
 *
 * The table above holds only the types `web-app` draws a glyph for — which, for this ledger, is all
 * of them. The fallback still matters: an unlisted type (`space_tier_bonus` is one the backend sends)
 * falls back **by unit**, exactly as `TransactionIcon.js` does — a Star row gets the Star mark,
 * anything else gets `USDIcon`.
 *
 * `dollar-circle` and not `dollar-arrow-up`: `USDIcon` draws the dollar disc with the arrow pointing
 * **down** (money in), and the DS ships only the up variant — checked against all 1581 symbols. Taking
 * a down arrow from upstream Zappicon is not warranted here; `dollar-circle` is the same disc without
 * the arrow, so the row still reads as "an amount of currency" and nothing is hand-drawn.
 *
 * `document-list` is gone. It was a *third* answer for "unknown", which meant an unlisted type drew
 * neither of the two marks legacy uses and looked like a different kind of row.
 */
export function starTransactionIcon(type: string, isStar = false): TeviIconName {
    return STAR_ICONS[type] ?? (isStar ? 'star' : 'dollar-circle')
}
