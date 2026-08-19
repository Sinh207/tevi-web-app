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
    it('gives every known type its own glyph', () => {
        for (const filter of walletTransactionFilters()) {
            if (filter.key === ALL_WALLET_TRANSACTIONS) continue
            expect(walletTransactionIcon(filter.key)).not.toBe('document-list')
        }
    })

    // A payout and a failed payout are the pair a reader most needs to tell apart.
    it('distinguishes a payout from a failed one', () => {
        expect(walletTransactionIcon('payout')).not.toBe(walletTransactionIcon('payout_failure'))
    })

    it('falls back to a neutral glyph for an unknown type', () => {
        expect(walletTransactionIcon('space_tier_bonus')).toBe('document-list')
        expect(walletTransactionIcon('')).toBe('document-list')
    })
})
