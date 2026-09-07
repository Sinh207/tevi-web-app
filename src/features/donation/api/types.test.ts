import { describe, expect, it } from 'vitest'
import { normalizeDirectDonate } from './types'

const WIRE = {
    name: 'Coffee',
    icon: 'coffee',
    button_text: 'Buy me a coffee',
    thank_you_msg: 'You are the best!',
    display_supporter_count: true,
    donation_count: 42,
    prices: [
        { id: 'p_usd', amount: '1.00', amount_currency: 'usd' },
        { id: 'p_tvs', amount: '100.00', amount_currency: 'tvs' },
    ],
}

describe('normalizeDirectDonate', () => {
    it('reads the offer', () => {
        const offer = normalizeDirectDonate(WIRE)
        expect(offer?.name).toBe('Coffee')
        expect(offer?.icon).toBe('coffee')
        expect(offer?.donation_count).toBe(42)
        expect(offer?.prices).toHaveLength(2)
    })

    it('upper-cases the currency so no call site has to', () => {
        expect(normalizeDirectDonate(WIRE)?.prices.map(p => p.amount_currency)).toEqual([
            'USD',
            'TVS',
        ])
    })

    it('reads a decimal-string amount as a number', () => {
        const tvs = normalizeDirectDonate(WIRE)?.prices.find(p => p.amount_currency === 'TVS')
        expect(tvs?.amount).toBe(100)
    })

    it('answers null for a body that is not an offer', () => {
        expect(normalizeDirectDonate(null)).toBeNull()
        expect(normalizeDirectDonate('nope')).toBeNull()
    })

    it('keeps an unknown icon as null rather than pointing at art that does not exist', () => {
        // Legacy indexes its art map with no guard, so a fifth value is a broken image in
        // four places at once.
        expect(normalizeDirectDonate({ ...WIRE, icon: 'taco' })?.icon).toBeNull()
    })

    it('degrades one bad field instead of dropping the offer', () => {
        const offer = normalizeDirectDonate({ ...WIRE, name: 42, donation_count: 'lots' })
        expect(offer).not.toBeNull()
        expect(offer?.name).toBeNull()
        expect(offer?.donation_count).toBe(0)
        // The part that still works still works.
        expect(offer?.prices).toHaveLength(2)
    })

    it('drops an unreadable price row, not the whole list', () => {
        const offer = normalizeDirectDonate({ ...WIRE, prices: [null, WIRE.prices[1]] })
        expect(offer?.prices).toHaveLength(1)
        expect(offer?.prices[0]?.amount_currency).toBe('TVS')
    })

    it('keeps fields this client does not model — the cash path ships more than these', () => {
        const offer = normalizeDirectDonate({ ...WIRE, checkout_url: '/pay' })
        expect((offer as unknown as { checkout_url?: string })?.checkout_url).toBe('/pay')
    })
})
