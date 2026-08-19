import type { TeviIconName } from '@shared/ui/icon-names'

/**
 * The transaction types the **currency** ledger can contain, and what they are called.
 *
 * Ported from legacy's `FILTER_TYPE.getAll()` non-TVS branch
 * (`containers/myWallet/components/transactionHistory/constant.js`). `features/my-star` has its own,
 * different list — and that separation is the reason these tables are per-feature rather than shared:
 *
 * | | currency ledger | Star ledger |
 * |---|---|---|
 * | shared | adjustment · bonus · conversion · refund · reward · system_deduction | ← same six |
 * | only there | **charge · commission · payout · payout_failure · platform_earning** | consumption · top_up · transfer_inbound · transfer_outbound |
 *
 * A `top_up` cannot happen in USD and a `payout` cannot happen in Star, so offering either filter on the
 * wrong screen is offering a filter that can only ever return nothing — and an empty list reads as "no
 * activity", not as a bad filter. B36 asks whether the split is real.
 *
 * ## Two labels do not match their slug, and both are product words
 *
 * `conversion` → **Exchange** and `platform_earning` → **Revenue**. Legacy's own `getLabel` does this and
 * the mobile apps show the same words; deriving a label from the slug would produce "Conversion" and
 * "Platform earning", neither of which appears anywhere in the product.
 *
 * `platform_earning` is also the type whose **net** figure is the one shown — see `normalizeLedger` in
 * `features/balance`, which is where that rule lives because it is a property of the payload rather than
 * of this screen.
 *
 * ## An unknown type is shown, not dropped
 *
 * `walletTransactionLabelKey` returns `null` for a type this file does not know, and the row falls back to
 * the backend's own `description`. Legacy drops unknown types, and the consequence on a *ledger* is money
 * the reader cannot account for.
 */

export interface WalletTransactionType {
    /** The backend's slug, lower-cased. `''` is the "no filter" pseudo-type. */
    key: string
    /** `{module}_{slug}` translation key. */
    label: string
}

/** `''` — the pseudo-type the filter list opens with. Never sent to the API. */
export const ALL_WALLET_TRANSACTIONS = ''

/**
 * The filter list, in legacy's order — alphabetical by slug after the "All" row, which is also the order
 * the mobile apps show. Fixed here rather than taken from a payload, for the reason `REVENUE_CATEGORIES`
 * gives: a menu whose rows move between openings is a menu the reader has to re-read every time.
 */
const WALLET_TYPES: readonly WalletTransactionType[] = [
    { key: ALL_WALLET_TRANSACTIONS, label: 'balance_type_all' },
    { key: 'adjustment', label: 'balance_type_adjustment' },
    { key: 'bonus', label: 'balance_type_bonus' },
    { key: 'charge', label: 'balance_type_charge' },
    { key: 'commission', label: 'balance_type_commission' },
    // `conversion` on the wire, "Exchange" on screen.
    { key: 'conversion', label: 'balance_type_exchange' },
    { key: 'payout', label: 'balance_type_payout' },
    { key: 'payout_failure', label: 'balance_type_payout_failure' },
    // `platform_earning` on the wire, "Revenue" on screen.
    { key: 'platform_earning', label: 'balance_type_revenue' },
    { key: 'refund', label: 'balance_type_refund' },
    { key: 'reward', label: 'balance_type_reward' },
    { key: 'system_deduction', label: 'balance_type_system_deduction' },
] as const

/**
 * The glyph in a row's 40px leading disc.
 *
 * Richer than legacy's, which has three icons and picks by **currency** rather than by type
 * (`icons/TransactionIcon.js`) — so a ledger of eleven different types draws the same icon eleven times,
 * making the column decoration rather than information. The thing a reader scans a ledger for is
 * *direction*, so each type carries its own glyph.
 *
 * Every name is from the DS sprite subset and nothing is hand-drawn. Two are honest approximations rather
 * than exact matches, flagged because a design pass should confirm them: `charge` borrows the payment-card
 * mark the menu's "Card management" row uses, and `commission` borrows `badge-dollar` — the sprite has no
 * percent glyph at all (checked), so a commission cannot be drawn as one.
 */
const WALLET_ICONS: Record<string, TeviIconName> = {
    adjustment: 'sliders-simple',
    bonus: 'gift-simple',
    charge: 'address-card',
    commission: 'badge-dollar',
    conversion: 'arrows-repeat',
    payout: 'bank',
    payout_failure: 'exclamation-diamond',
    platform_earning: 'sack-dollar',
    refund: 'arrow-turn-down-left',
    reward: 'trophy-simple',
    system_deduction: 'minus-circle',
}

/** The filter options for the currency ledger. */
export function walletTransactionFilters(): readonly WalletTransactionType[] {
    return WALLET_TYPES
}

/**
 * Whether a slug is one this ledger can contain.
 *
 * The guard for a filter arriving from outside the picker — today only the initial value, but the moment
 * `?type=` becomes a URL parameter this is what stops a hand-typed `top_up` from asking this endpoint a
 * question with no answer.
 */
export function isWalletTransactionFilter(type: string): boolean {
    return WALLET_TYPES.some(entry => entry.key === type)
}

/** The translation key for a type, or `null` when this file does not know it — see the doc above. */
export function walletTransactionLabelKey(type: string): string | null {
    if (type === ALL_WALLET_TRANSACTIONS) return null
    return WALLET_TYPES.find(entry => entry.key === type)?.label ?? null
}

/**
 * The glyph for a type.
 *
 * Falls back to a neutral document mark rather than to nothing: the leading disc is part of the row's
 * geometry, and leaving one empty makes a single unknown row look broken in a column of complete ones. The
 * sprite has no receipt or invoice glyph — checked — so `document-list` is the nearest thing that reads as
 * "a record of something".
 */
export function walletTransactionIcon(type: string): TeviIconName {
    return WALLET_ICONS[type] ?? 'document-list'
}
