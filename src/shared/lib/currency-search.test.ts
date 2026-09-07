import { describe, expect, it } from 'vitest'
import { searchCurrencies } from './currency-search'

/**
 * The ranking is the part a comment cannot hold: "the row you meant is first" is a claim about order,
 * and a plain `includes` filter satisfies every other sentence in that function's doc while getting it
 * wrong.
 */
const LIST = [
    { code: 'AUD', name: 'Australian Dollar', symbol: '$', decimalDigits: 2 },
    { code: 'CUP', name: 'Cuban Peso', symbol: '₱', decimalDigits: 2 },
    { code: 'USD', name: 'US Dollar', symbol: '$', decimalDigits: 2 },
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalDigits: 0 },
    { code: 'VUV', name: 'Vanuatu Vatu', symbol: 'VT', decimalDigits: 0 },
]

const codes = (term: string) => searchCurrencies(LIST, term).map(c => c.code)

describe('searchCurrencies', () => {
    it('returns the list untouched for an empty or blank term', () => {
        // Same array order, and the same array contents — the server's order is the default view.
        expect(searchCurrencies(LIST, '')).toBe(LIST)
        expect(searchCurrencies(LIST, '   ')).toBe(LIST)
    })

    it('puts a code prefix ahead of a name match', () => {
        // `VUV` matches by code prefix and `VND` by name ("Vietnamese"), and the service lists VND
        // first. The code hit still leads: that is the ranking, not the input order.
        expect(codes('v')).toEqual(['VND', 'VUV'])
        expect(codes('vu')).toEqual(['VUV'])
    })

    it('ranks code prefix, name prefix, code substring, name substring in that order', () => {
        const list = [
            { code: 'XVU', name: 'Nothing', symbol: '', decimalDigits: 2 },
            { code: 'ZZZ', name: 'Vulture Coin', symbol: '', decimalDigits: 2 },
            { code: 'VUV', name: 'Vanuatu Vatu', symbol: '', decimalDigits: 2 },
            { code: 'AAA', name: 'Old Vulture', symbol: '', decimalDigits: 2 },
        ]
        // `vu`: VUV (code prefix) → ZZZ (name prefix) → XVU (code substring) → AAA (name substring).
        expect(searchCurrencies(list, 'vu').map(c => c.code)).toEqual(['VUV', 'ZZZ', 'XVU', 'AAA'])
    })

    it('keeps the service order inside one tier', () => {
        // Both are name substring matches, so neither outranks the other and the list order stands.
        expect(codes('dollar')).toEqual(['AUD', 'USD'])
    })

    it('finds a currency by a word in the middle of its name', () => {
        expect(codes('dong')).toEqual(['VND'])
    })

    it('ignores case and surrounding space', () => {
        expect(codes('  vNd ')).toEqual(['VND'])
    })

    it('drops everything when nothing matches', () => {
        expect(codes('zzzz')).toEqual([])
    })
})
