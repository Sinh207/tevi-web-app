import { describe, expect, it } from 'vitest'
import { membershipChannelName, normalizeMemberships } from './types'

/** The shape the endpoint actually answers with, trimmed to the fields this screen reads. */
const ROW = {
    id: 'sub-1',
    status: 'ACTIVE',
    payment_method: 'Star',
    canceled_at: null,
    end_date: '2026-09-01T00:00:00Z',
    package_price: '500.00',
    package_price_currency: 'tvs',
    channel: {
        id: 42,
        name: 'Ada Lovelace',
        slug: 'ada',
        images: { thumb: 'https://cdn/ada.png', avatar_video: null },
        verified_tick_badge: { image: 'https://cdn/tick.png' },
        is_premium: true,
    },
    package: {
        id: 7,
        name: 'Gold',
        prices: [{ id: 'p1', amount: '500', amount_currency: 'tvs' }],
    },
}

describe('normalizeMemberships', () => {
    it('normalises the fields the client compares or formats', () => {
        const [row] = normalizeMemberships([ROW])
        expect(row.id).toBe('sub-1')
        // Lower-cased, so the row's date-label branch and the filter agree with the wire.
        expect(row.status).toBe('active')
        expect(row.payment_method).toBe('star')
        // Upper-cased, because the price helper switches on it.
        expect(row.package_price_currency).toBe('TVS')
        // A decimal string becomes a number — `package_price` is `"500.00"` on the wire.
        expect(row.package_price).toBe(500)
        // Ids arrive as numbers from this service and as strings from others.
        expect(row.channel?.id).toBe('42')
    })

    it('keeps fields it does not model, so the checkout pass can find them', () => {
        const [row] = normalizeMemberships([{ ...ROW, stripe_subscription_id: 'sub_x' }])
        expect(row).toMatchObject({ stripe_subscription_id: 'sub_x' })
    })

    /** A row with no id is a dead end — nothing could cancel it or key it. */
    it('drops a row with no id', () => {
        expect(normalizeMemberships([{ ...ROW, id: null }, ROW])).toHaveLength(1)
    })

    /**
     * ⚠ Regression. Channel-less rows used to be dropped, which produced a tab reading
     * `Expired (15)` over an empty panel — `count` is the server's total and every row was being
     * thrown away here. `channel` is nullable in practice (legacy renders an empty name for it) and
     * shows up most on expired memberships whose space has since gone. The row degrades on its own.
     */
    it('keeps a row whose channel is missing', () => {
        const rows = normalizeMemberships([
            { ...ROW, channel: null },
            { ...ROW, id: 'sub-2' },
        ])
        expect(rows).toHaveLength(2)
        expect(rows[0].channel).toBeNull()
        // The fields that make the row worth showing at all survive.
        expect(rows[0].package_price).toBe(500)
        expect(rows[0].end_date).toBe('2026-09-01T00:00:00Z')
    })

    it('degrades a row field by field rather than dropping it', () => {
        const [row] = normalizeMemberships([
            {
                ...ROW,
                end_date: 'not a date',
                package_price: 'free',
                payment_method: null,
                channel: { ...ROW.channel, name: '   ', images: null },
            },
        ])
        expect(row.end_date).toBeNull()
        expect(row.package_price).toBe(0)
        expect(row.payment_method).toBeNull()
        // `''` is not a name — the row falls back to the handle.
        expect(membershipChannelName(row.channel)).toBe('')
        expect(row.channel?.slug).toBe('ada')
    })

    /**
     * Defensive rather than observed: billy has only been seen sending ISO strings, but `core` sends
     * epoch **milliseconds as a number** for `created_at`, and that arriving through a string-only
     * parser has already silently dropped a row in this repo once.
     */
    it('accepts an epoch timestamp in seconds or milliseconds', () => {
        const ms = normalizeMemberships([{ ...ROW, end_date: 1788220800000 }])[0]
        const s = normalizeMemberships([{ ...ROW, end_date: 1788220800 }])[0]
        expect(ms.end_date).toBe(s.end_date)
        expect(ms.end_date).toBe(new Date(1788220800000).toISOString())
    })

    it('answers an empty list for a body that is not an array', () => {
        expect(normalizeMemberships(undefined)).toEqual([])
        expect(normalizeMemberships({ results: [] })).toEqual([])
    })
})
