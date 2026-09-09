import { describe, expect, it } from 'vitest'
import { donationSettingSchema, normalizeDonations } from '../api/donation-types'
import {
    buildDonationPayload,
    DONATION_MAX_AMOUNT,
    DONATION_RANGES,
    DONATION_TERM_OPTIONS,
    DONATION_UNIT_OPTIONS,
    donationAmountUsd,
    donationFormChanged,
    donationFormValues,
    donationRangeBounds,
    donationStatusDisplay,
    formatDonationRangeLabel,
    parseDonationAmountInput,
    starsForUsd,
} from './donation-setting'

/**
 * The five silent failures `donation-setting.ts` exists to make testable. Every assertion here
 * stands for one that ships without an error message.
 */

const setting = (over: Record<string, unknown> = {}) =>
    donationSettingSchema.parse({
        id: 'd1',
        name: 'coffee',
        icon: 'coffee',
        button_text: 'Donate',
        thank_you_msg: 'Thanks!',
        display_supporter_count: true,
        is_active: true,
        sharable_url: 'https://tevi.com/@ada/direct-donation',
        prices: [
            { id: 'p1', amount: '10.00', amount_currency: 'USD' },
            { id: 'p2', amount: '1000.00', amount_currency: 'TVS' },
        ],
        ...over,
    })

describe('donation ranges', () => {
    it("uses the API's spellings, not legacy's", () => {
        // Legacy sends `this_month`, which billy's `date_range` enum does not contain.
        expect(DONATION_RANGES).toEqual(['7d', 'thisMonth'])
    })

    it('7d spans seven days inclusive of today', () => {
        const now = new Date(2026, 8, 9, 14, 30)
        const { startMs, endMs } = donationRangeBounds('7d', now)
        expect(new Date(startMs)).toEqual(new Date(2026, 8, 3, 0, 0, 0, 0))
        expect(endMs).toBe(now.getTime())
    })

    it('thisMonth starts on the first, in local time', () => {
        const now = new Date(2026, 8, 9, 14, 30)
        const { startMs } = donationRangeBounds('thisMonth', now)
        expect(new Date(startMs)).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0))
    })

    it('collapses a shared month into one label rather than repeating it', () => {
        const label = formatDonationRangeLabel('7d', 'en', new Date(2026, 8, 9))
        // `Intl.formatRange` gives "Sep 3 – 9"; legacy's two formats give "Sep 3 - Sep 9".
        expect(label).toContain('Sep 3')
        expect(label).not.toContain('Sep 9')
    })

    it('falls back to en rather than throwing on an unusable locale tag', () => {
        expect(formatDonationRangeLabel('7d', 'not-a-locale', new Date(2026, 8, 9))).not.toBe('')
    })
})

describe('the amount field', () => {
    it('drops non-numeric characters', () => {
        expect(parseDonationAmountInput('1a2', '')).toBe('12')
    })

    it('lets an empty field and a bare decimal point through', () => {
        expect(parseDonationAmountInput('', '10')).toBe('')
        expect(parseDonationAmountInput('.', '')).toBe('0.')
    })

    it('keeps a trailing point so a decimal can be typed at all', () => {
        expect(parseDonationAmountInput('10.', '10')).toBe('10.')
    })

    it('refuses a third decimal place instead of rounding it', () => {
        // The failure this function exists for: rounding would let `1.999` be typed and `2.00` be
        // posted, with nothing on screen saying the price changed.
        expect(parseDonationAmountInput('1.999', '1.99')).toBe('1.99')
    })

    it('refuses a second decimal point', () => {
        expect(parseDonationAmountInput('1.2.3', '1.2')).toBe('1.2')
    })

    /**
     * ⚠ The regression this suite shipped without, and the reason it matters more than any other
     * assertion here: the first cut returned `String(Number(typed))`, which deletes a `0` sitting
     * immediately after the decimal point. Typed one key at a time, `1.05` ended at **`15`** and Save
     * posted `15.00` — a 14× price change with nothing on screen saying so. `web-app` has the bug
     * today.
     */
    it.each([
        ['1.05', '1.05'],
        ['0.05', '0.05'],
        ['1.0', '1.0'],
        ['10.50', '10.50'],
    ])('types %s one key at a time and keeps it', (target, expected) => {
        let value = ''
        for (const key of target) value = parseDonationAmountInput(value + key, value)
        expect(value).toBe(expected)
    })

    it('drops a leading run of zeros before a digit, and only there', () => {
        expect(parseDonationAmountInput('007', '00')).toBe('7')
        // The lookahead needs a digit, so a decimal is never swallowed.
        expect(parseDonationAmountInput('0.5', '0.')).toBe('0.5')
        expect(parseDonationAmountInput('0', '')).toBe('0')
    })

    it('clamps at the maximum', () => {
        expect(parseDonationAmountInput('99999', '9999')).toBe(String(DONATION_MAX_AMOUNT))
    })
})

describe('the Star equivalent', () => {
    it('is the platform rate, and is never re-declared', () => {
        expect(starsForUsd(10)).toBe(1000)
    })

    it('rounds to two decimals rather than trusting float multiplication', () => {
        expect(starsForUsd(10.005)).toBe(1000.5)
    })

    it('is zero for an unusable amount', () => {
        expect(starsForUsd(0)).toBe(0)
        expect(starsForUsd(Number.NaN)).toBe(0)
    })
})

describe('the write payload', () => {
    it('sends both currencies as two-decimal strings, USD first', () => {
        const payload = buildDonationPayload({
            unit: 'pizza',
            amount: '5',
            term: 'Tip',
            message: '  thanks  ',
            displaySupporterCount: true,
            isActive: false,
        })

        expect(payload.prices).toEqual([
            { amount: '5.00', amount_currency: 'USD' },
            { amount: '500.00', amount_currency: 'TVS' },
        ])
        expect(payload.name).toBe('pizza')
        expect(payload.icon).toBe('pizza')
        expect(payload.button_text).toBe('Tip')
        expect(payload.is_active).toBe(false)
    })

    it("sends a cleared message as '' so a PATCH actually clears it", () => {
        const payload = buildDonationPayload({
            unit: 'coffee',
            amount: '10',
            term: 'Donate',
            message: '   ',
            displaySupporterCount: false,
            isActive: true,
        })
        expect(payload.thank_you_msg).toBe('')
        expect('thank_you_msg' in payload).toBe(true)
    })
})

describe('seeding the form', () => {
    it("opens on legacy's defaults when there is no setting", () => {
        expect(donationFormValues(null)).toEqual({
            unit: 'coffee',
            amount: '10',
            term: 'Donate',
            message: '',
            displaySupporterCount: false,
            isActive: true,
        })
    })

    it('falls back to the default amount rather than NaN when no USD price is carried', () => {
        const values = donationFormValues(setting({ prices: [] }))
        expect(values.amount).toBe('10')
    })

    it('reports no change for a form that matches what is saved', () => {
        const saved = setting()
        expect(donationFormChanged(donationFormValues(saved), saved)).toBe(false)
    })

    it("treats '10' and '10.00' as the same price", () => {
        const saved = setting()
        const values = { ...donationFormValues(saved), amount: '10.00' }
        expect(donationFormChanged(values, saved)).toBe(false)
    })

    it('always reports a change when there is nothing saved', () => {
        expect(donationFormChanged(donationFormValues(null), null)).toBe(true)
    })
})

describe('is_active', () => {
    it('defaults to true when the payload omits it', () => {
        // Failing closed here would show a live creator an "off" switch, and Save would turn it off.
        expect(setting({ is_active: undefined }).is_active).toBe(true)
    })
})

describe('a donation row', () => {
    const row = (over: Record<string, unknown>) =>
        normalizeDonations({ count: 1, results: [{ id: 'x', user: null, ...over }] }).results[0]

    it('prefers usd_amount', () => {
        expect(
            donationAmountUsd(row({ usd_amount: '4.50', amount: '450', amount_currency: 'TVS' })),
        ).toBe(4.5)
    })

    it('converts a Star row rather than printing its count with a dollar sign', () => {
        expect(
            donationAmountUsd(row({ usd_amount: '0', amount: '500', amount_currency: 'TVS' })),
        ).toBe(5)
    })

    it('states no figure at all when the row carries none it can read', () => {
        expect(
            donationAmountUsd(row({ usd_amount: '0', amount: '0', amount_currency: null })),
        ).toBeNull()
    })

    it('counts what the server sent, not what parsed', () => {
        const page = normalizeDonations({ count: 42, results: [{ id: 'a' }, 'not-an-object'] })
        expect(page.count).toBe(42)
        expect(page.received).toBe(2)
        expect(page.results).toHaveLength(1)
    })
})

describe('payout status', () => {
    it.each([
        ['success', 'success'],
        ['done', 'success'],
        ['completed', 'success'],
        ['refunded', 'error'],
        ['pending', 'info'],
    ])('%s reads as %s', (wire, tone) => {
        expect(donationStatusDisplay(wire)?.tone).toBe(tone)
    })

    it('says nothing at all for a status it has no vocabulary for', () => {
        // Legacy prints the raw wire value in grey — `on_hold` on a creator's dashboard.
        expect(donationStatusDisplay('on_hold')).toBeNull()
        expect(donationStatusDisplay(null)).toBeNull()
    })
})

describe('the option tables', () => {
    it("carries the wire's four icons in legacy's order", () => {
        expect(DONATION_UNIT_OPTIONS.map(unit => unit.key)).toEqual([
            'coffee',
            'pizza',
            'book',
            'rose',
        ])
    })

    it("carries the wire's two terms, capitalised as the enum spells them", () => {
        expect(DONATION_TERM_OPTIONS.map(term => term.key)).toEqual(['Donate', 'Tip'])
    })
})
