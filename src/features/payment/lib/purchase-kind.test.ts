import { describe, expect, it } from 'vitest'
import { offersMore, purchaseKind } from './purchase-kind'

describe('purchaseKind', () => {
    it("reads legacy's three strings", () => {
        expect(purchaseKind('subscription')).toBe('membership')
        expect(purchaseKind('direct_donation')).toBe('donation')
        expect(purchaseKind('crowdfunding_donation')).toBe('donation')
    })

    it('is case- and whitespace-insensitive — the wire case is unconfirmed', () => {
        expect(purchaseKind(' SUBSCRIPTION ')).toBe('membership')
    })

    it('falls through to Star, which is legacy own default and the common purchase', () => {
        // Legacy never enumerates a Star `type`; it uses the `default` branch. See B69.
        expect(purchaseKind('star_conversion')).toBe('stars')
        expect(purchaseKind(null)).toBe('stars')
        expect(purchaseKind('')).toBe('stars')
    })
})

describe('offersMore', () => {
    it('offers more Star only after buying Star', () => {
        expect(offersMore('stars')).toBe(true)
        // "Become a member again" and "donate again" are not next steps.
        expect(offersMore('membership')).toBe(false)
        expect(offersMore('donation')).toBe(false)
    })
})
