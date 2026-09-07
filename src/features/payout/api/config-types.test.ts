import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    normalizePayoutConfigPage,
    normalizePayoutCountries,
    normalizePayoutMethods,
    normalizeStripeOnboardLink,
} from './config-types'

/**
 * The parsers that decide **whether a payout destination exists on screen**.
 *
 * The first test here is a regression: a live `payout-methods/?countryCode=VN` answered `count: 5` and
 * the screen showed four, because this file used to drop `is_active: false` — a filter this client
 * invented, on a flag whose meaning nobody had established (B89). A row disappearing between the wire
 * and the list is the one failure a screen cannot show, so every drop is pinned here and every drop
 * warns in development.
 */

afterEach(() => {
    vi.restoreAllMocks()
})

/** Silences (and captures) the dev warnings the parsers emit for a dropped row. */
function captureWarnings() {
    return vi.spyOn(console, 'warn').mockImplementation(() => {})
}

function method(over: Record<string, unknown> = {}) {
    return {
        id: 'pm_1',
        name: 'Bank Transfer',
        slug: 'bank_transfer',
        logo: 'https://static.tevi.com/bank.png',
        currency: 'vnd',
        is_active: true,
        order: 1,
        daily_limit: '5000.00',
        minimum_amount: '10.00',
        processing_time_note: '1 business day',
        country: { alpha_2: 'VN', name: 'Viet Nam', allow_payout: true },
        config: { form: [{ field: 'account_number', display_name: 'Account number' }] },
        ...over,
    }
}

describe('normalizePayoutMethods', () => {
    it('keeps every method the endpoint sent, including an inactive one', () => {
        // The reported bug, stated: `count: 5` must not render as four.
        const warn = captureWarnings()
        const results = [
            method({ id: 'pm_1', name: 'Bank Transfer', is_active: false }),
            method({ id: 'pm_2', name: 'USDT', slug: 'usdt' }),
            method({ id: 'pm_3', name: 'VAI Wallet', slug: 'vai_wallet' }),
            method({ id: 'pm_4', name: 'Bank Transfer 24/7' }),
            method({ id: 'pm_5', name: 'Payoneer', slug: 'payoneer' }),
        ]

        const methods = normalizePayoutMethods({ count: 5, next: null, results })

        expect(methods).toHaveLength(5)
        expect(methods.map(entry => entry.id)).toEqual(['pm_1', 'pm_2', 'pm_3', 'pm_4', 'pm_5'])
        // Rendered, and reported — so if these do turn up, B89 is answerable from a console line.
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('is_active: false'),
            expect.objectContaining({ row: 'pm_1' }),
        )
    })

    it('keeps the server’s order rather than sorting on `order`', () => {
        const methods = normalizePayoutMethods({
            results: [method({ id: 'a', order: 9 }), method({ id: 'b', order: 1 })],
        })
        expect(methods.map(entry => entry.id)).toEqual(['a', 'b'])
    })

    it('normalises the fields the screens read', () => {
        const [entry] = normalizePayoutMethods({ results: [method()] })
        expect(entry).toMatchObject({
            id: 'pm_1',
            slug: 'bank_transfer',
            // Upper-cased, because it is printed after the name as `(VND)`.
            currency: 'VND',
            countryName: 'Viet Nam',
            processingTimeNote: '1 business day',
            // Decimal strings off the wire, numbers to the screens.
            dailyLimit: 5000,
            minimumAmount: 10,
        })
    })

    it('reads `choices`, which the published schema does not declare', () => {
        const [entry] = normalizePayoutMethods({
            results: [
                method({
                    config: {
                        form: [
                            {
                                field: 'bank',
                                display_name: 'Bank',
                                choices: [
                                    { id: 1, name: 'Vietcombank', logo: 'https://x/v.png' },
                                    // Nameless: unsubmittable, since the *name* is what is posted.
                                    { id: 2, name: '  ' },
                                ],
                            },
                        ],
                    },
                }),
            ],
        })
        expect(entry.form[0].choices).toEqual([
            { id: '1', name: 'Vietcombank', logo: 'https://x/v.png' },
        ])
    })

    it('drops a field with no wire key, and a method with no id', () => {
        const warn = captureWarnings()
        const [entry] = normalizePayoutMethods({
            results: [method({ config: { form: [{ display_name: 'Mystery' }] } })],
        })
        expect(entry.form).toEqual([])

        // `id` is the only required field, so this is the one row shape that cannot survive.
        expect(normalizePayoutMethods({ results: [method({ id: null })] })).toEqual([])
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('could not be read'),
            expect.objectContaining({ issues: expect.any(Array) }),
        )
    })

    it('survives a payload that is not a list at all', () => {
        for (const body of [null, undefined, 'nope', 42, {}]) {
            expect(normalizePayoutMethods(body)).toEqual([])
        }
    })
})

describe('normalizePayoutCountries', () => {
    const rows = [
        { alpha_2: 'US', alpha_3: 'USA', name: 'United States', allow_payout: true },
        { alpha_2: 'VN', alpha_3: 'VNM', name: 'Viet Nam', allow_payout: true },
        { alpha_2: 'KP', alpha_3: 'PRK', name: 'North Korea', allow_payout: false },
        { alpha_3: 'XXX', name: 'No code', allow_payout: true },
    ]

    it('keeps only the countries payouts are offered in, sorted by name', () => {
        // A country the backend switched off answers an empty method list, so offering it is offering
        // a dead end; a row with no `alpha_2` has nothing to request methods with.
        expect(normalizePayoutCountries(rows)).toEqual([
            { code: 'US', name: 'United States' },
            { code: 'VN', name: 'Viet Nam' },
        ])
    })

    it('sorts in the reader’s own collation', () => {
        const list = [
            { alpha_2: 'SE', name: 'Åland-ish', allow_payout: true },
            { alpha_2: 'AT', name: 'Austria', allow_payout: true },
        ]
        // Not an assertion about Swedish specifically — that the locale reaches `localeCompare` at
        // all is the point, since billy returns ISO order and "United States" would otherwise sit
        // between two countries nobody was looking for.
        expect(normalizePayoutCountries(list, 'sv').map(entry => entry.code)).toEqual(['AT', 'SE'])
        expect(normalizePayoutCountries(list, 'en').map(entry => entry.code)).toEqual(['SE', 'AT'])
    })

    it('falls back to the code when a country has no name', () => {
        expect(normalizePayoutCountries([{ alpha_2: 'vn', allow_payout: true }])).toEqual([
            { code: 'VN', name: 'VN' },
        ])
    })
})

describe('normalizePayoutConfigPage', () => {
    const row = {
        id: 'pc_1',
        status: 'ACTIVE',
        created_at: 1_780_291_984_000,
        contact_name: ' Ada ',
        contact_email: 'ada@tevi.com',
        daily_limit_remainder: '4200.50',
        payout_method: {
            name: 'Bank Transfer 24/7',
            slug: 'BANK_TRANSFER',
            logo: '',
            currency: 'vnd',
            country: { name: 'Viet Nam' },
        },
        payout_detail: { account_number: ' 0071000123456 ', bank_name: 'Vietcombank', empty: '  ' },
    }

    it('reads a saved method, and drops the empty keys from its detail bag', () => {
        const page = normalizePayoutConfigPage({ count: 1, next: null, results: [row] })
        expect(page.count).toBe(1)
        expect(page.next).toBeNull()
        expect(page.results[0]).toMatchObject({
            id: 'pc_1',
            status: 'active',
            methodSlug: 'bank_transfer',
            methodCurrency: 'VND',
            contactName: 'Ada',
            dailyLimitRemainder: 4200.5,
            detail: { account_number: '0071000123456', bank_name: 'Vietcombank' },
        })
        expect(page.results[0].detail).not.toHaveProperty('empty')
    })

    it('keeps `null` and “absent” apart on `next`', () => {
        // `paged-list.ts` treats them differently: an explicit null is the API saying "last page",
        // undefined means the payload has no such key and the end has to be inferred.
        expect(normalizePayoutConfigPage({ results: [], next: null }).next).toBeNull()
        expect(normalizePayoutConfigPage({ results: [] }).next).toBeUndefined()
        expect(normalizePayoutConfigPage({ results: [], next: 'https://x/?page=2' }).next).toBe(
            'https://x/?page=2',
        )
    })

    it('counts what it has when the payload sends no count', () => {
        expect(normalizePayoutConfigPage({ results: [row, { ...row, id: 'pc_2' }] }).count).toBe(2)
    })

    it('warns about a row it had to drop', () => {
        const warn = captureWarnings()
        const page = normalizePayoutConfigPage({ count: 2, results: [row, { id: null }] })
        expect(page.results).toHaveLength(1)
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('could not be read'),
            expect.objectContaining({ row: '#1' }),
        )
    })
})

describe('normalizeStripeOnboardLink', () => {
    it('reads the URL and its expiry', () => {
        expect(
            normalizeStripeOnboardLink({ url: 'https://connect.stripe.com/x', expires_at: 1780 }),
        ).toEqual({ url: 'https://connect.stripe.com/x', expiresAt: 1780 })
    })

    it('answers null for a body with no URL — the caller has one sentence for both', () => {
        expect(normalizeStripeOnboardLink({ expires_at: 1780 })).toBeNull()
        expect(normalizeStripeOnboardLink({ url: '   ' })).toBeNull()
        expect(normalizeStripeOnboardLink(null)).toBeNull()
    })
})
