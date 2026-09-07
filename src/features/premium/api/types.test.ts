import { describe, expect, it } from 'vitest'
import {
    normalizePremiumBenefits,
    normalizePremiumPackages,
    premiumBenefitSchema,
    toPremiumInfo,
} from './types'

/**
 * The parsers, which are the whole silent-failure surface of this feature: nothing here throws, so
 * a renamed field costs a line of the screen and reports nothing. Two shapes of case matter — the
 * ones that must **survive** (content this client does not model) and the ones that must be
 * **dropped** (a package that cannot be bought).
 */

/** A package as the service really sends one — captured from `v1/packages/?platform=web`. */
const pkg = {
    id: 6,
    name: 'Yearly Subscription',
    slug: 'yearly-subscription-web',
    price: 77.92,
    currency: 'USD',
    amount: 1,
    duration_days: 365,
    product_id: 'price_1ShshtBfiRzT30LKGwUH7unh',
    is_active: true,
    country: null,
    platform: 'web',
    version: 'v1',
    sort_order: 0,
}

describe('normalizePremiumPackages', () => {
    it('reads the service’s own envelope, a bare array and DRF’s results', () => {
        expect(normalizePremiumPackages({ packages: [pkg] })).toHaveLength(1)
        expect(normalizePremiumPackages([pkg])).toHaveLength(1)
        expect(normalizePremiumPackages({ results: [pkg] })).toHaveLength(1)
    })

    it('normalises an id to a string and reads the price, its currency and the cadence', () => {
        const [parsed] = normalizePremiumPackages([pkg])
        expect(parsed).toMatchObject({
            id: '6',
            price: 77.92,
            currency: 'USD',
            duration_days: 365,
        })
    })

    /** `price` has been seen as a number *and* as a decimal string, from the same service. */
    it('reads a decimal-string price', () => {
        expect(normalizePremiumPackages([{ ...pkg, price: '49.00' }])[0]?.price).toBe(49)
    })

    /**
     * **The backoffice's off switch has to work.** A deactivated package that still renders is a
     * price somebody can press, and `checkout/` would be asked to charge for it.
     */
    it('drops a deactivated package', () => {
        expect(normalizePremiumPackages([{ ...pkg, is_active: false }])).toEqual([])
        // `z.coerce.boolean()` would make this string truthy, which is why the flag has its own parser.
        expect(normalizePremiumPackages([{ ...pkg, is_active: 'false' }])).toEqual([])
    })

    /** A payload from before the flag existed returned only live rows; absent must not hide them. */
    it('treats a missing is_active as live', () => {
        const { is_active, ...withoutFlag } = pkg
        void is_active
        expect(normalizePremiumPackages([withoutFlag])).toHaveLength(1)
    })

    /** USD is the default because the figure is about to be converted — see `currencyCode`. */
    it('falls back to USD when the payload states no currency', () => {
        const { currency, ...withoutCurrency } = pkg
        void currency
        expect(normalizePremiumPackages([withoutCurrency])[0]?.currency).toBe('USD')
        expect(normalizePremiumPackages([{ ...pkg, currency: 'vnd' }])[0]?.currency).toBe('VND')
    })

    /**
     * The real payload arrives **yearly, monthly, weekly** — not in cadence order — so the screen's
     * order is `PLAN_ORDER`'s. What `sort_order` decides is the order *within* a list the backoffice
     * arranged, and ignoring it leaves that arrangement to whatever the server happens to return.
     */
    it('sorts by sort_order, keeping the payload order for ties', () => {
        const rows = normalizePremiumPackages([
            { ...pkg, id: 'c', sort_order: 3 },
            { ...pkg, id: 'a', sort_order: 1 },
            { ...pkg, id: 'b1', sort_order: 2 },
            { ...pkg, id: 'b2', sort_order: 2 },
        ])
        expect(rows.map(r => r.id)).toEqual(['a', 'b1', 'b2', 'c'])
    })

    /**
     * The three facts a package needs to be one. A `$0` tile, a tile that lasts no time, or a tile
     * with nothing to charge against are all worse than an absent tile on a screen that takes money.
     */
    it.each([
        ['no price', { ...pkg, price: 0 }],
        ['an unreadable price', { ...pkg, price: 'free' }],
        ['no duration', { ...pkg, duration_days: null }],
        ['no price id', { ...pkg, product_id: '   ' }],
    ])('drops a package with %s', (_why, row) => {
        expect(normalizePremiumPackages([row])).toEqual([])
    })

    it('is empty rather than throwing for a body it cannot read', () => {
        expect(normalizePremiumPackages(null)).toEqual([])
        expect(normalizePremiumPackages({ packages: 'soon' })).toEqual([])
    })
})

describe('normalizePremiumBenefits', () => {
    /**
     * ⚠ **A detail row's label is `title`, not `name`** — the benefit has a `name`, its rows have a
     * `title`, and this parser said `name` for both. Every comparison row rendered with its label
     * dropped and nothing failed: the two fields live one nesting level apart, which is exactly why
     * it survived review. Captured from `v1/benefits/`.
     */
    it('reads a comparison row’s title, its two values and its numbers', () => {
        const [parsed] = normalizePremiumBenefits({
            benefits: [
                {
                    name: 'Enhanced Storage & Upload',
                    slug: 'enhanced-storage-upload',
                    details: [
                        {
                            id: 3,
                            benefit_id: 4,
                            title: 'Video Length',
                            description: 'Maximum resolution for video uploads',
                            free_value: '1 minutes',
                            prem_value: '30 minutes',
                            metadata: { free: 1.5, prem: 30, unit: 'minutes' },
                            sort_order: 1,
                            slug: 'video-length',
                        },
                    ],
                },
            ],
        })
        expect(parsed?.details[0]).toMatchObject({
            slug: 'video-length',
            title: 'Video Length',
            free_value: '1 minutes',
            prem_value: '30 minutes',
            metadata: { free: 1.5, prem: 30 },
        })
    })

    it('drops a deactivated benefit and keeps one with no flag', () => {
        expect(
            normalizePremiumBenefits({ benefits: [{ name: 'No Ads', is_active: false }] }),
        ).toEqual([])
        expect(normalizePremiumBenefits({ benefits: [{ name: 'No Ads' }] })).toHaveLength(1)
    })

    /** The captured payload's own order — ascending with gaps where a row was removed. */
    it('sorts benefits and their rows by sort_order', () => {
        const [parsed, second] = normalizePremiumBenefits({
            benefits: [
                { name: 'later', sort_order: 12 },
                {
                    name: 'first',
                    sort_order: 1,
                    details: [
                        { title: 'b', free_value: '2', prem_value: '3', sort_order: 2 },
                        { title: 'a', free_value: '0', prem_value: '1', sort_order: 1 },
                    ],
                },
            ],
        })
        expect(parsed?.name).toBe('first')
        expect(second?.name).toBe('later')
        expect(parsed?.details.map(d => d.title)).toEqual(['a', 'b'])
    })

    /** `banner: ""` is real — the Star-purchase bonus has no picture, only a table. */
    it('reads an empty banner as absent', () => {
        const [parsed] = normalizePremiumBenefits({
            benefits: [{ name: 'Star Purchase Bonus', banner: '', icon: '' }],
        })
        expect(parsed?.banner).toBeNull()
        expect(parsed?.icon).toBeNull()
    })

    /** A benefit is content: a name is the whole bar, because a name is a true statement. */
    it('keeps a benefit that has nothing but a name', () => {
        expect(normalizePremiumBenefits({ benefits: [{ name: 'Fast Payout' }] })).toEqual([
            {
                slug: null,
                name: 'Fast Payout',
                description: null,
                icon: null,
                banner: null,
                tag: null,
                details: [],
                // Both default rather than being required — see their own cases below.
                is_active: true,
                sort_order: 0,
            },
        ])
    })

    it('drops a row with no name — there would be nothing to draw', () => {
        expect(normalizePremiumBenefits({ benefits: [{ description: 'orphan' }] })).toEqual([])
    })

    /**
     * `icon` and `banner` become an `<img src>`, so a relative path (a request against our own
     * origin) and a `javascript:` string (a sink) are both refused. The benefit itself survives —
     * losing the art costs a picture, not the perk.
     */
    it.each(['/local/icon.svg', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAA', 42])(
        'refuses %s as art but keeps the benefit',
        icon => {
            const [parsed] = normalizePremiumBenefits({
                benefits: [{ name: 'No Ads', icon, banner: icon }],
            })
            expect(parsed?.name).toBe('No Ads')
            expect(parsed?.icon).toBeNull()
            expect(parsed?.banner).toBeNull()
        },
    )

    it('accepts an absolute https URL', () => {
        const [parsed] = normalizePremiumBenefits({
            benefits: [{ name: 'No Ads', icon: 'https://static.tevi.dev/a.svg' }],
        })
        expect(parsed?.icon).toBe('https://static.tevi.dev/a.svg')
    })

    it('lower-cases the slug it branches the detail slide on', () => {
        const [parsed] = normalizePremiumBenefits([{ name: 'Bonus', slug: 'Star-Purchase-Bonus' }])
        expect(parsed?.slug).toBe('star-purchase-bonus')
    })

    /**
     * The comparison table's rows carry a display pair **and** a numeric pair, and the numeric one
     * is what the post composer reads for its upload limits. Neither may be derived from the other:
     * "Unlimited" is a legitimate `prem_value` with no number behind it.
     */
    it('keeps both the display values and the metadata numbers', () => {
        const parsed = premiumBenefitSchema.parse({
            name: 'Video Length',
            details: [
                {
                    slug: 'video-length',
                    free_value: '5 minutes',
                    prem_value: 'Unlimited',
                    metadata: { free: 5, prem: 60 },
                },
            ],
        })
        expect(parsed.details[0]).toMatchObject({
            free_value: '5 minutes',
            prem_value: 'Unlimited',
            metadata: { free: 5, prem: 60 },
        })
    })

    it('survives details that are not an array', () => {
        const [parsed] = normalizePremiumBenefits([{ name: 'Bonus', details: 'later' }])
        expect(parsed?.details).toEqual([])
    })
})

describe('toPremiumInfo', () => {
    it('reads an ISO expiry', () => {
        expect(toPremiumInfo({ is_premium: true, expires_at: '2026-11-19T00:00:00Z' })).toEqual({
            isPremium: true,
            expiresAt: Date.parse('2026-11-19T00:00:00Z'),
        })
    })

    /** A seconds feed would otherwise render every grant as expiring in 1970. */
    it('promotes an epoch in seconds to milliseconds', () => {
        expect(toPremiumInfo({ is_premium: true, expires_at: 1_795_000_000 })?.expiresAt).toBe(
            1_795_000_000_000,
        )
    })

    it('keeps an epoch already in milliseconds', () => {
        expect(toPremiumInfo({ is_premium: true, expires_at: 1_795_000_000_000 })?.expiresAt).toBe(
            1_795_000_000_000,
        )
    })

    /**
     * A bare numeric **string** is an epoch, not a date: `Date.parse('1795000000')` is the year
     * 1795000000 in V8.
     */
    it('treats a numeric string as an epoch', () => {
        expect(toPremiumInfo({ is_premium: true, expires_at: '1795000000' })?.expiresAt).toBe(
            1_795_000_000_000,
        )
    })

    /** No date is a state the screen renders (it prints nothing); a wrong date is not. */
    it.each(['whenever', '', 0, -1, null])('answers a null expiry for %s', value => {
        expect(toPremiumInfo({ is_premium: true, expires_at: value })).toEqual({
            isPremium: true,
            expiresAt: null,
        })
    })

    it('is null for a body it cannot read', () => {
        expect(toPremiumInfo(null)).toBeNull()
        expect(toPremiumInfo('nope')).toBeNull()
    })
})
