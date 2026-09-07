import { describe, expect, it } from 'vitest'
import {
    normalizeGateways,
    normalizeSavedCards,
    normalizeSetupIntent,
    normalizeStarPackages,
    normalizeStarTransactions,
    normalizeStripeConfig,
    pickDefaultCard,
    type SavedCard,
} from './types'

describe('normalizeStripeConfig', () => {
    it('reads the publishable key', () => {
        expect(normalizeStripeConfig({ publishable_key: ' pk_test_1 ' })).toEqual({
            publishableKey: 'pk_test_1',
        })
    })

    it('is null without a usable key, so nothing mounts Elements against an empty string', () => {
        expect(normalizeStripeConfig({ publishable_key: '' })).toBeNull()
        expect(normalizeStripeConfig({})).toBeNull()
        expect(normalizeStripeConfig(null)).toBeNull()
    })
})

describe('normalizeSavedCards', () => {
    const WIRE = [
        {
            id: 'pm_1',
            default: false,
            type: 'CARD',
            card: {
                brand: 'Visa',
                last4: 4242,
                exp_month: '5',
                exp_year: '2027',
                funding: 'credit',
            },
        },
        { id: 'pm_2', default: true, type: 'card', card: { brand: 'mastercard', last4: '1881' } },
    ]

    it('lower-cases the vocabulary fields and reads numeric digits as a string', () => {
        const [first] = normalizeSavedCards(WIRE)
        expect(first).toMatchObject({ id: 'pm_1', type: 'card' })
        expect(first.card).toMatchObject({
            brand: 'visa',
            last4: '4242',
            exp_month: 5,
            exp_year: 2027,
        })
    })

    it('keeps a method with no card block instead of dropping it', () => {
        const rows = normalizeSavedCards([{ id: 'pm_3', type: 'link' }])
        expect(rows).toHaveLength(1)
        expect(rows[0].card).toBeNull()
    })

    it('drops a row with no id — it could not be paid with, deleted, or defaulted', () => {
        expect(normalizeSavedCards([{ default: true, card: { last4: '4242' } }])).toEqual([])
    })

    it('accepts a bare array or a paginated envelope, and nothing else', () => {
        expect(normalizeSavedCards({ results: WIRE })).toHaveLength(2)
        expect(normalizeSavedCards(null)).toEqual([])
        expect(normalizeSavedCards('nope')).toEqual([])
    })

    it('preserves server order — position is not authority', () => {
        expect(normalizeSavedCards(WIRE).map(card => card.id)).toEqual(['pm_1', 'pm_2'])
    })
})

describe('pickDefaultCard', () => {
    const card = (id: string, isDefault: boolean) =>
        ({ id, default: isDefault, type: 'card', card: null }) as SavedCard

    it('prefers the flagged card, falls back to the first, and answers null for an empty list', () => {
        expect(pickDefaultCard([card('a', false), card('b', true)])?.id).toBe('b')
        expect(pickDefaultCard([card('a', false), card('b', false)])?.id).toBe('a')
        expect(pickDefaultCard([])).toBeNull()
    })
})

describe('normalizeSetupIntent', () => {
    it('reads the secret and renames it once, here', () => {
        expect(normalizeSetupIntent({ id: 'seti_1', client_secret: 'seti_1_secret' })).toEqual({
            id: 'seti_1',
            clientSecret: 'seti_1_secret',
        })
    })

    it('is null without a secret — an empty card form is worse than an error', () => {
        expect(normalizeSetupIntent({ id: 'seti_1' })).toBeNull()
        expect(normalizeSetupIntent(null)).toBeNull()
    })
})

describe('normalizeGateways', () => {
    it('reads decimal-string rates as numbers and tolerates a missing logo list', () => {
        const [gateway] = normalizeGateways([
            {
                id: 'gw.stripe',
                name: 'Card',
                fee_percent_rate: '2.9',
                fee_flat_amount: '0.30',
                currency: { id: '$', usd_conversion_rate: '1', min_unit: '0.01' },
            },
        ])
        expect(gateway).toMatchObject({ fee_percent_rate: 2.9, fee_flat_amount: 0.3, images: [] })
        expect(gateway.currency).toMatchObject({ usd_conversion_rate: 1, min_unit: 0.01 })
    })

    it('keeps only string image URLs', () => {
        const [gateway] = normalizeGateways([
            { id: 'gw.coda', images: ['https://cdn/x.png', '', null, 7] },
        ])
        expect(gateway.images).toEqual(['https://cdn/x.png'])
    })

    it('drops a row with no id — the id is the checkout body', () => {
        expect(normalizeGateways([{ name: 'Nameless' }])).toEqual([])
        expect(normalizeGateways(null)).toEqual([])
    })
})

describe('normalizeStarPackages', () => {
    const WIRE = { results: [{ id: 7, amount: '1000', bonus_amount: 100, price: '9.99' }] }

    it('reads the envelope and the string amounts', () => {
        // `labels` is `[]` for a row that carries none — an array either way, so `recommendedIndex`
        // never has to ask whether the field arrived.
        expect(normalizeStarPackages(WIRE)).toEqual([
            { id: '7', amount: 1000, bonus_amount: 100, price: 9.99, labels: [] },
        ])
    })

    it('keeps the backoffice labels, dropping anything in the array that is not a string', () => {
        const wire = {
            results: [
                {
                    id: 7,
                    amount: '1000',
                    bonus_amount: 0,
                    price: '9.99',
                    labels: ['Most popular', 3],
                },
            ],
        }
        expect(normalizeStarPackages(wire)[0]?.labels).toEqual(['Most popular'])
    })

    it('drops a package that sells nothing or costs nothing', () => {
        expect(
            normalizeStarPackages([
                { id: '1', amount: 0, bonus_amount: 0, price: 1 },
                { id: '2', amount: 100, bonus_amount: 0, price: 0 },
                { id: '3', amount: 100, bonus_amount: 0, price: 'free' },
            ]),
        ).toEqual([])
    })

    it('accepts a bare array', () => {
        expect(normalizeStarPackages([{ id: '1', amount: 100, price: 0.99 }])).toHaveLength(1)
    })
})

describe('normalizeStarTransactions', () => {
    const WIRE = {
        count: 2,
        results: [
            {
                id: 91,
                top_up_quantity: '500',
                status: 'SUCCEEDED',
                created_at: '2026-08-26T08:27:00Z',
                payment: {
                    amount: '137500',
                    amount_currency: 'VND',
                    payment_method: {
                        id: 'gw.appotapay.cc',
                        name: 'Card',
                        images: ['https://x/v.svg'],
                    },
                },
            },
        ],
    }

    it('reads the paginated envelope and keeps the count', () => {
        const page = normalizeStarTransactions(WIRE)
        expect(page.count).toBe(2)
        expect(page.rows).toHaveLength(1)
        expect(page.rows[0]?.id).toBe('91')
        expect(page.rows[0]?.top_up_quantity).toBe(500)
        // Lower-cased on the way in, so the status map never has to case-fold twice.
        expect(page.rows[0]?.status).toBe('succeeded')
        expect(page.rows[0]?.payment?.amount).toBe(137500)
        expect(page.rows[0]?.payment?.payment_method?.images).toEqual(['https://x/v.svg'])
    })

    it('survives the nested object being null — legacy reads it unguarded', () => {
        const page = normalizeStarTransactions({ results: [{ id: 1, payment: null }] })
        expect(page.rows[0]?.payment).toBeNull()
        expect(page.count).toBeNull()
    })

    it('drops a row with no id — the id is the list key and the support reference', () => {
        expect(normalizeStarTransactions({ results: [{ top_up_quantity: 100 }] }).rows).toEqual([])
    })

    it('accepts a bare array, for a backend that stops paginating', () => {
        expect(normalizeStarTransactions([{ id: 5 }]).rows).toHaveLength(1)
    })

    it('is empty rather than throwing for a body of the wrong shape', () => {
        expect(normalizeStarTransactions(null)).toEqual({ rows: [], count: null })
        expect(normalizeStarTransactions('nope')).toEqual({ rows: [], count: null })
    })
})
