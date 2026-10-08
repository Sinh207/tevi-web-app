import type { TranslationKey } from '@shared/i18n/settings'
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
    label: TranslationKey
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
 * warrants taking one from upstream Zappicon.
 *
 * Four were wrong before this was checked: `bonus` had the gift box (which is `consumption`'s), so
 * `consumption` had been given a `heart`; `refund` had `arrow-turn-down-left`, a *turn* rather than an
 * undo; `reward` had the plain `trophy-simple`; and `conversion` had `arrows-repeat`, two arrows in a
 * cycle rather than the pair legacy draws. None of them is a wrong *concept*, which is exactly why a
 * reading of the source rather than of the export names was needed.
 *
 * Every name is from the DS sprite subset and nothing is hand-drawn.
 */
const WALLET_ICONS: Record<string, TeviIconName> = {
    adjustment: 'sliders-simple',
    bonus: 'star-magic',
    conversion: 'arrows-repeat',
    refund: 'arrow-undo',
    reward: 'trophy-star',
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
export function walletTransactionLabelKey(type: string): TranslationKey | null {
    if (type === ALL_WALLET_TRANSACTIONS) return null
    return WALLET_TYPES.find(entry => entry.key === type)?.label ?? null
}

/**
 * The glyph for a type — legacy's `TransactionIcon` dispatch, reproduced.
 *
 * The table above holds only the types `web-app` draws a glyph for. Everything else falls back **by
 * unit**, exactly as `TransactionIcon.js` does: a Star row gets the Star mark, anything else gets
 * `USDIcon`. So `charge`, `commission`, `payout`, `payout_failure` and `platform_earning` all render
 * `dollar-arrow-down` — the same mark, on purpose, because that is what the app they came from shows.
 *
 * `USDIcon` **is** the DS's `dollar-arrow-down--regular` (the bare id's weight): an outlined disc
 * opened at the top-right for a down arrow, verified by rendering the two side by side. Until the
 * full-library import (2026-10-08) the sprite had only the up variant and this drew `dollar-circle`,
 * whose bare id is the **filled** disc — a second difference from legacy, not just a missing arrow.
 *
 * `document-list` is gone. It was a *third* answer for "unknown", which meant an unlisted type drew
 * neither of the two marks legacy uses and looked like a different kind of row.
 */
export function walletTransactionIcon(type: string, isStar = false): TeviIconName {
    return WALLET_ICONS[type] ?? (isStar ? 'star' : 'dollar-arrow-down')
}
