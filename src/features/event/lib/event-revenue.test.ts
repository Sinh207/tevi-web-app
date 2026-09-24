import { describe, expect, it } from 'vitest'
import { eventBillSchema, normalizeBill } from '../api/report-types'
import {
    billLine,
    billLineTotal,
    billTotal,
    formatQuantity,
    formatRevenue,
    interactiveBill,
    liveBill,
    mcnCommission,
    toAmount,
} from './event-revenue'

const bill = (fields: Record<string, unknown>) => eventBillSchema.parse(fields)

describe('toAmount', () => {
    it('parses a decimal string without flooring it', () => {
        expect(toAmount('3.50')).toBe(3.5)
        expect(toAmount('0')).toBe(0)
    })

    /** `null` is *unknown*, never `0` — the caller decides how to print an absent figure. */
    it('is null for absent or unparseable', () => {
        expect(toAmount(null)).toBeNull()
        expect(toAmount(undefined)).toBeNull()
        expect(toAmount('')).toBeNull()
        expect(toAmount('free')).toBeNull()
    })
})

describe('liveBill / interactiveBill', () => {
    /**
     * Found by `category`, never by index. A payload that lists `ACTION` first would otherwise file
     * sustained-viewer earnings under *Live revenue*.
     */
    it('finds each half whichever order they arrive in', () => {
        const bills = normalizeBill([
            { category: 'action', net_amount: '5' },
            { category: 'LIVE', net_amount: '10' },
        ])
        expect(liveBill(bills)?.net_amount).toBe('10')
        expect(interactiveBill(bills)?.net_amount).toBe('5')
    })

    it('is null for a half the payload does not carry', () => {
        const bills = normalizeBill([{ category: 'LIVE', net_amount: '10' }])
        expect(interactiveBill(bills)).toBeNull()
    })
})

describe('billLineTotal', () => {
    it('prefers subtotal', () => {
        expect(
            billLineTotal(
                eventBillSchema.parse({
                    category: 'LIVE',
                    bill_detail: {
                        revenue: [
                            { type: 'gift', subtotal: { amount: '12' }, amount: { amount: '99' } },
                        ],
                    },
                }).bill_detail.revenue[0],
            ),
        ).toBe(12)
    })

    /**
     * ⚠ The fallback legacy applies to its **gift** row and to every interactive row, but *not* to
     * its ticket or interactive-games rows — so one payload prints `$0` for tickets and the real
     * figure for gifts, on the same card, from the same shape.
     */
    it('falls back to amount, for every line type', () => {
        const parsed = eventBillSchema.parse({
            category: 'LIVE',
            bill_detail: {
                revenue: [
                    { type: 'ticket', amount: { amount: '60' } },
                    { type: 'gift', amount: { amount: '7.5' } },
                    { type: 'consumables', amount: { amount: '3' } },
                ],
            },
        })
        expect(parsed.bill_detail.revenue.map(billLineTotal)).toEqual([60, 7.5, 3])
    })

    it('is null when neither field is usable, and for no line at all', () => {
        const parsed = eventBillSchema.parse({
            category: 'LIVE',
            bill_detail: { revenue: [{ type: 'gift' }] },
        })
        expect(billLineTotal(parsed.bill_detail.revenue[0])).toBeNull()
        expect(billLineTotal(null)).toBeNull()
        expect(billLineTotal(undefined)).toBeNull()
    })
})

describe('billLine', () => {
    const parsed = eventBillSchema.parse({
        category: 'LIVE',
        bill_detail: {
            revenue: [
                { type: 'Ticket', quantity: 3 },
                { type: 'GIFT', quantity: 9 },
            ],
        },
    })

    /** Lower-cased at the comparison, as legacy does — `type` is two overlapping vocabularies. */
    it('matches case-insensitively', () => {
        expect(billLine(parsed, 'ticket')?.quantity).toBe(3)
        expect(billLine(parsed, 'gift')?.quantity).toBe(9)
    })

    it('is null for a type this bill does not carry, and for no bill', () => {
        expect(billLine(parsed, 'view_cost')).toBeNull()
        expect(billLine(null, 'ticket')).toBeNull()
    })
})

describe('billTotal', () => {
    it('adds both halves', () => {
        expect(
            billTotal(
                normalizeBill([
                    { category: 'LIVE', net_amount: '10.5' },
                    { category: 'ACTION', net_amount: '2.25' },
                ]),
            ),
        ).toBe(12.75)
    })

    it('is one half when only one half has a figure', () => {
        expect(billTotal(normalizeBill([{ category: 'LIVE', net_amount: '10' }]))).toBe(10)
        expect(
            billTotal(
                normalizeBill([{ category: 'LIVE' }, { category: 'ACTION', net_amount: '4' }]),
            ),
        ).toBe(4)
    })

    /**
     * ⚠ **The bug this function exists for.** Legacy's arithmetic branch is
     * `parseFloat(live) + parseFloat(interactive)`, and a non-numeric side makes the sum `NaN` —
     * which `Intl.NumberFormat().format(NaN)` prints as the literal string **"NaN"** on the
     * creator's revenue line. Here the unparseable side is skipped and the readable one survives.
     */
    it('skips an unparseable side rather than poisoning the sum', () => {
        expect(
            billTotal(
                normalizeBill([
                    { category: 'LIVE', net_amount: 'n/a' },
                    { category: 'ACTION', net_amount: '12.5' },
                ]),
            ),
        ).toBe(12.5)
    })

    /** `null` only when **neither** side had a figure. The card prints that as `$0`. */
    it('is null for an empty bill', () => {
        expect(billTotal([])).toBeNull()
        expect(billTotal(normalizeBill([{ category: 'LIVE' }, { category: 'ACTION' }]))).toBeNull()
    })

    /** A real zero is a figure, not an absence. */
    it('is zero, not null, when both halves earned nothing', () => {
        expect(
            billTotal(
                normalizeBill([
                    { category: 'LIVE', net_amount: '0.00' },
                    { category: 'ACTION', net_amount: '0' },
                ]),
            ),
        ).toBe(0)
    })
})

describe('mcnCommission', () => {
    /** Legacy's own condition: shown only above zero, so a creator outside a network sees no row. */
    it('is null at zero or absent, and the figure above it', () => {
        expect(
            mcnCommission(
                bill({ category: 'LIVE', bill_detail: { commission: { mcn: { amount: '0' } } } }),
            ),
        ).toBeNull()
        expect(mcnCommission(bill({ category: 'LIVE' }))).toBeNull()
        expect(mcnCommission(null)).toBeNull()
        expect(
            mcnCommission(
                bill({ category: 'LIVE', bill_detail: { commission: { mcn: { amount: '1.5' } } } }),
            ),
        ).toBe(1.5)
    })
})

describe('formatRevenue', () => {
    /**
     * The symbol is pinned in front and only the separators are the locale's — the measurement
     * `formatIncomeUsd` records: `style: 'currency'` gives a Vietnamese reader `1.234,5 US$`.
     */
    it('leads with the dollar sign in every locale', () => {
        expect(formatRevenue(1234.5, 'en')).toBe('$1,234.5')
        expect(formatRevenue(1234.5, 'vi')).toBe('$1.234,5')
        expect(formatRevenue(1234.5, 'ar').startsWith('$')).toBe(true)
    })

    it('prints null as $0 rather than a blank cell', () => {
        expect(formatRevenue(null, 'en')).toBe('$0')
    })

    it('caps at two fraction digits', () => {
        expect(formatRevenue(1.239, 'en')).toBe('$1.24')
    })

    it('falls back to English on a bad locale tag instead of throwing', () => {
        expect(formatRevenue(10, 'not-a-locale')).toBe('$10')
    })
})

describe('formatQuantity', () => {
    it('is zero for absent, and localised for present', () => {
        expect(formatQuantity(null)).toBe('0')
        expect(formatQuantity(undefined)).toBe('0')
        expect(formatQuantity(1234, 'en')).toBe('1,234')
    })
})
