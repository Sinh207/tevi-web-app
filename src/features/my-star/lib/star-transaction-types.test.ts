import { describe, expect, it } from 'vitest'
import {
    ALL_STAR_TRANSACTIONS,
    isStarTransactionFilter,
    starTransactionFilters,
    starTransactionIcon,
    starTransactionLabelKey,
} from './star-transaction-types'

/**
 * The filter list is the fact this file exists to carry, so it is pinned here verbatim against legacy's
 * `FILTER_TYPE.getAll('tvs')`. A drift is a filter that can only ever return nothing — a `payout` cannot
 * happen in Star — and the failure is silent: the list just comes back empty and reads as "no activity".
 *
 * `features/my-wallet` has its own table and its own test. That the two are separate is the point; a shared
 * one would be the union, which is exactly what must not be offered on either screen.
 */

describe('starTransactionFilters', () => {
    it('matches legacy exactly', () => {
        expect(starTransactionFilters().map(f => f.key)).toEqual([
            '',
            'adjustment',
            'bonus',
            'consumption',
            'conversion',
            'refund',
            'reward',
            'top_up',
            'transfer_inbound',
            'transfer_outbound',
            'system_deduction',
        ])
    })

    it('opens with the no-filter row', () => {
        expect(starTransactionFilters()[0]).toEqual({
            key: ALL_STAR_TRANSACTIONS,
            label: 'balance_type_all',
        })
    })

    it('gives every row a translation key', () => {
        for (const filter of starTransactionFilters()) {
            expect(filter.label).toMatch(/^balance_type_/)
        }
    })

    // The currency ledger's own types must not appear here — they cannot happen in Star.
    it('excludes the currency ledger types', () => {
        const keys = starTransactionFilters().map(f => f.key)
        for (const key of [
            'charge',
            'commission',
            'payout',
            'payout_failure',
            'platform_earning',
        ]) {
            expect(keys).not.toContain(key)
        }
    })
})

describe('isStarTransactionFilter', () => {
    it('accepts a type this ledger can contain', () => {
        expect(isStarTransactionFilter('top_up')).toBe(true)
        expect(isStarTransactionFilter(ALL_STAR_TRANSACTIONS)).toBe(true)
    })

    /*
     * The guard that matters: a slug valid on the *other* ledger. This is what stops a hand-typed
     * `?type=payout` on `/my-star` from asking the API a question with no answer.
     */
    it('rejects a type that belongs to the currency ledger', () => {
        expect(isStarTransactionFilter('payout')).toBe(false)
        expect(isStarTransactionFilter('platform_earning')).toBe(false)
    })

    it('rejects a type nobody has heard of', () => {
        expect(isStarTransactionFilter('space_tier_bonus')).toBe(false)
        expect(isStarTransactionFilter("'; DROP TABLE")).toBe(false)
    })
})

describe('starTransactionLabelKey', () => {
    /*
     * The two that do not match their slug. Deriving a label from the slug would produce "Consumption" and
     * "Top up", neither of which appears anywhere in the product — the mobile apps show the words on the
     * right.
     */
    it('maps the product words that differ from the wire slug', () => {
        expect(starTransactionLabelKey('consumption')).toBe('balance_type_donate')
        expect(starTransactionLabelKey('top_up')).toBe('balance_type_recharge')
        expect(starTransactionLabelKey('conversion')).toBe('balance_type_exchange')
    })

    it('maps the rest straight through', () => {
        expect(starTransactionLabelKey('refund')).toBe('balance_type_refund')
        expect(starTransactionLabelKey('transfer_inbound')).toBe('balance_type_transfer_in')
    })

    // `null` rather than a raw slug, so the row falls back to the backend's own sentence instead of
    // printing `space_tier_bonus` at somebody.
    it('returns null for an unknown type', () => {
        expect(starTransactionLabelKey('space_tier_bonus')).toBeNull()
    })

    // The no-filter pseudo-type is a menu row, never a row label.
    it('returns null for the no-filter pseudo-type', () => {
        expect(starTransactionLabelKey(ALL_STAR_TRANSACTIONS)).toBeNull()
    })
})

describe('starTransactionIcon', () => {
    it('gives every known type its own glyph', () => {
        for (const filter of starTransactionFilters()) {
            if (filter.key === ALL_STAR_TRANSACTIONS) continue
            expect(starTransactionIcon(filter.key)).not.toBe('document-list')
        }
    })

    // Direction is the thing a reader scans a ledger for, so in and out must not collide.
    it('distinguishes money in from money out', () => {
        expect(starTransactionIcon('transfer_inbound')).not.toBe(
            starTransactionIcon('transfer_outbound'),
        )
    })

    /*
     * The leading disc is part of the row's geometry — leaving one empty makes a single unknown row look
     * broken in a column of complete ones.
     */
    it('falls back to a neutral glyph for an unknown type', () => {
        expect(starTransactionIcon('space_tier_bonus')).toBe('document-list')
        expect(starTransactionIcon('')).toBe('document-list')
    })
})
