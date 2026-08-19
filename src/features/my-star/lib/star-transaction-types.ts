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
    label: string
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
 * ## Richer than legacy's, on purpose
 *
 * Legacy has three icons and picks by **currency**, not by type (`icons/TransactionIcon.js`): `reward`
 * gets its own mark and everything else gets a Star or a USD glyph. So a Star ledger of ten different
 * types draws the same icon ten times, which makes the column decoration rather than information. The
 * thing a reader scans a ledger for is *direction* — in, out, refunded, deducted — so each type carries
 * its own glyph.
 *
 * Every name is from the DS sprite subset and nothing is hand-drawn.
 */
const STAR_ICONS: Record<string, TeviIconName> = {
    adjustment: 'sliders-simple',
    bonus: 'gift-simple',
    consumption: 'heart',
    conversion: 'arrows-repeat',
    refund: 'arrow-turn-down-left',
    reward: 'trophy-simple',
    top_up: 'plus-circle',
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
export function starTransactionLabelKey(type: string): string | null {
    if (type === ALL_STAR_TRANSACTIONS) return null
    return STAR_TYPES.find(entry => entry.key === type)?.label ?? null
}

/**
 * The glyph for a type.
 *
 * Falls back to a neutral document mark rather than to nothing: the leading disc is part of the row's
 * geometry, and leaving one empty makes a single unknown row look broken in a column of complete ones.
 * The sprite has no receipt or invoice glyph — checked — so `document-list` is the nearest thing that
 * reads as "a record of something".
 */
export function starTransactionIcon(type: string): TeviIconName {
    return STAR_ICONS[type] ?? 'document-list'
}
