import { describe, expect, it } from 'vitest'
import { normalizeMemberships } from '../api/types'
import { renewalOffer } from './renewal'

/** Built through the parser, so the test exercises the shape the screen actually holds. */
function row(patch: Record<string, unknown>) {
    return normalizeMemberships([
        {
            id: 'sub-1',
            status: 'expired',
            payment_method: 'star',
            canceled_at: null,
            end_date: '2025-08-01T00:00:00Z',
            package_price: 500,
            package_price_currency: 'TVS',
            channel: { id: 'c1', name: 'Ada', slug: 'ada' },
            package: {
                id: 'p1',
                name: 'Gold',
                prices: [
                    { id: 'price-usd', amount: '5.00', amount_currency: 'usd' },
                    { id: 'price-tvs', amount: '500', amount_currency: 'tvs' },
                ],
            },
            ...patch,
        },
    ])[0]
}

describe('renewalOffer', () => {
    /**
     * The subject of the return value: **where** to subscribe and **who** it is with, plus the tier
     * exactly as `joinOffer` resolves it for the space page. Both price lines survive, which is the
     * point of routing renewal through the join dialog — the reader chooses the currency.
     */
    it('carries the space, the creator and the whole tier', () => {
        expect(renewalOffer(row({}))).toEqual({
            slug: 'ada',
            channelId: 'c1',
            name: 'Ada',
            avatarUrl: null,
            offer: {
                packageId: 'p1',
                name: 'Gold',
                description: null,
                // The USD line is first in the fixture on purpose — legacy's `findIndex` over
                // `amount_currency` is the only thing that has ever selected these correctly.
                priceId: 'price-tvs',
                stars: 500,
                usd: 5,
                cashPriceId: 'price-usd',
            },
        })
    })

    /** A live membership renews by not cancelling; a cancelled one renews through `undo-cancel/`. */
    it('offers nothing for a membership that has not expired', () => {
        expect(renewalOffer(row({ status: 'active' }))).toBeNull()
    })

    /**
     * Still nothing for a cash-only tier — and now for one reason rather than two: `joinOffer` needs a
     * billable Star line to resolve at all. When that resolver learns to open on a cash-only tier,
     * this screen follows it without a change here, which is the point of delegating.
     */
    it('offers nothing when the tier has no Star price', () => {
        expect(
            renewalOffer(
                row({
                    package: {
                        id: 'p1',
                        prices: [{ id: 'price-usd', amount: '5.00', amount_currency: 'USD' }],
                    },
                }),
            ),
        ).toBeNull()
    })

    it('offers nothing when there is nowhere to subscribe to', () => {
        // An expired membership whose space is gone — the common `channel: null` case.
        expect(renewalOffer(row({ channel: null }))).toBeNull()
        expect(renewalOffer(row({ channel: { id: 'c1', slug: '' } }))).toBeNull()
        expect(renewalOffer(row({ package: null }))).toBeNull()
    })

    /** A zero or unreadable price is not a free renewal — it is a payload this client cannot bill. */
    it('offers nothing for a price it cannot bill', () => {
        for (const prices of [
            [{ id: 'price-tvs', amount: '0', amount_currency: 'TVS' }],
            [{ id: 'price-tvs', amount: 'free', amount_currency: 'TVS' }],
            [{ id: '', amount: '500', amount_currency: 'TVS' }],
            [],
        ]) {
            expect(renewalOffer(row({ package: { id: 'p1', prices } }))).toBeNull()
        }
    })

    it('offers nothing for no membership at all', () => {
        expect(renewalOffer(null)).toBeNull()
        expect(renewalOffer(undefined)).toBeNull()
    })
})
