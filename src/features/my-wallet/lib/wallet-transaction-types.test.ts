import { describe, expect, it } from 'vitest'
import {
    ALL_WALLET_TRANSACTIONS,
    isWalletTransactionFilter,
    walletTransactionFilters,
    walletTransactionIcon,
    walletTransactionLabelKey,
} from './wallet-transaction-types'

/**
 * Pinned verbatim against legacy's `FILTER_TYPE.getAll()` non-TVS branch. See
 * `features/my-star/lib/star-transaction-types.test.ts` for why the two tables — and these two tests — are
 * separate: a shared one would be the union, which is exactly what must not be offered on either screen.
 */

describe('walletTransactionFilters', () => {
    it('matches legacy exactly', () => {
        expect(walletTransactionFilters().map(f => f.key)).toEqual([
            '',
            'adjustment',
            'bonus',
            'charge',
            'commission',
            'conversion',
            'payout',
            'payout_failure',
            'platform_earning',
            'refund',
            'reward',
            'system_deduction',
        ])
    })

    it('opens with the no-filter row', () => {
        expect(walletTransactionFilters()[0]).toEqual({
            key: ALL_WALLET_TRANSACTIONS,
            label: 'balance_type_all',
        })
    })

    it('gives every row a translation key', () => {
        for (const filter of walletTransactionFilters()) {
            expect(filter.label).toMatch(/^balance_type_/)
        }
    })

    // The Star ledger's own types must not appear here — they cannot happen in USD.
    it('excludes the Star ledger types', () => {
        const keys = walletTransactionFilters().map(f => f.key)
        for (const key of ['consumption', 'top_up', 'transfer_inbound', 'transfer_outbound']) {
            expect(keys).not.toContain(key)
        }
    })
})

describe('isWalletTransactionFilter', () => {
    it('accepts a type this ledger can contain', () => {
        expect(isWalletTransactionFilter('payout')).toBe(true)
        expect(isWalletTransactionFilter(ALL_WALLET_TRANSACTIONS)).toBe(true)
    })

    it('rejects a type that belongs to the Star ledger', () => {
        expect(isWalletTransactionFilter('top_up')).toBe(false)
        expect(isWalletTransactionFilter('consumption')).toBe(false)
    })

    it('rejects a type nobody has heard of', () => {
        expect(isWalletTransactionFilter('space_tier_bonus')).toBe(false)
    })
})

describe('walletTransactionLabelKey', () => {
    /*
     * The two that do not match their slug. Deriving from the slug would produce "Conversion" and "Platform
     * earning", neither of which appears anywhere in the product.
     */
    it('maps the product words that differ from the wire slug', () => {
        expect(walletTransactionLabelKey('conversion')).toBe('balance_type_exchange')
        expect(walletTransactionLabelKey('platform_earning')).toBe('balance_type_revenue')
    })

    it('maps the rest straight through', () => {
        expect(walletTransactionLabelKey('payout_failure')).toBe('balance_type_payout_failure')
        expect(walletTransactionLabelKey('commission')).toBe('balance_type_commission')
    })

    it('returns null for an unknown type and for the pseudo-type', () => {
        expect(walletTransactionLabelKey('space_tier_bonus')).toBeNull()
        expect(walletTransactionLabelKey(ALL_WALLET_TRANSACTIONS)).toBeNull()
    })
})

describe('walletTransactionIcon', () => {
    /*
     * The five types `web-app` has no glyph for — they fall through to its `USDIcon`, and so must fall
     * through here. Pinned because the previous version of this table gave each of them a glyph of its
     * own, which read as a richer ledger and was simply a different app's.
     */
    const UNLISTED = ['charge', 'commission', 'payout', 'payout_failure', 'platform_earning']

    it('gives every type web-app draws a glyph for one of its own', () => {
        for (const filter of walletTransactionFilters()) {
            if (filter.key === ALL_WALLET_TRANSACTIONS) continue
            if (UNLISTED.includes(filter.key)) continue
            expect(walletTransactionIcon(filter.key)).not.toBe('dollar-circle')
        }
    })

    it('falls back by unit, as legacy dispatches on currency', () => {
        for (const type of [...UNLISTED, 'space_tier_bonus', '']) {
            expect(walletTransactionIcon(type)).toBe('dollar-circle')
            expect(walletTransactionIcon(type, true)).toBe('star')
        }
    })

    /*
     * A listed type keeps its glyph whatever the row's unit is: a `conversion` has a leg in each, and
     * the type is what the row *is* — the unit only decides the fallback.
     */
    it('does not let the unit override a listed type', () => {
        expect(walletTransactionIcon('refund', true)).toBe(walletTransactionIcon('refund', false))
    })
})
