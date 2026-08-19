import { describe, expect, it } from 'vitest'
import { normalizeEarningsDays, normalizeEarningsDetails } from './types'

/**
 * The boundary parse, and it is tested harder than most because of what it guards.
 *
 * Every other DTO in this app renders a name or a count wrong when it slips. This one renders a
 * **wrong amount of money** to the person who earned it — and a wrong amount is worse than no
 * amount, because it looks like an answer. Hence the emphasis on `NaN`, on strings, and on the
 * unit of `date`, which are the three ways the numbers here can silently become fiction.
 */

describe('normalizeEarningsDays', () => {
    it('reads the shape the API actually sends', () => {
        expect(
            normalizeEarningsDays([
                { id: 'a', date: 1_739_923_200_000, total: 12.5 },
                { id: 'b', date: 1_739_836_800_000, total: 0 },
            ]),
        ).toEqual([
            { id: 'a', date: 1_739_923_200_000, total: 12.5 },
            { id: 'b', date: 1_739_836_800_000, total: 0 },
        ])
    })

    /** The paginated envelope this endpoint may grow into — accepted now so the screen does not
     *  silently empty on the day it is switched on. */
    it('accepts the array under `results` as well as bare', () => {
        const rows = [{ id: 'a', date: 1_739_923_200_000, total: 1 }]
        expect(normalizeEarningsDays({ results: rows })).toEqual(rows)
    })

    it('is empty, never throwing, for a body that is neither', () => {
        expect(normalizeEarningsDays(null)).toEqual([])
        expect(normalizeEarningsDays('nope')).toEqual([])
        expect(normalizeEarningsDays({ data: [] })).toEqual([])
    })

    /**
     * Money over JSON commonly arrives as a string, precisely to avoid float drift. `Number()` of
     * anything else is `NaN`, and `NaN` reaches `Intl` as `$NaN` — on a payout report.
     */
    it('reads an amount sent as a numeric string', () => {
        expect(normalizeEarningsDays([{ date: 1_739_923_200_000, total: '12.50' }])[0].total).toBe(
            12.5,
        )
    })

    it('never lets an unreadable amount become NaN', () => {
        for (const total of [undefined, null, 'twelve', {}, Number.NaN, '']) {
            const [day] = normalizeEarningsDays([{ date: 1_739_923_200_000, total }])
            expect(day.total).toBe(0)
        }
    })

    /** A row with no usable date cannot be labelled, expanded or linked to — see `EarningsDay`. */
    it('drops a row whose date cannot be read', () => {
        expect(
            normalizeEarningsDays([
                { id: 'a', date: null, total: 5 },
                { id: 'b', date: 'yesterday', total: 5 },
                { id: 'c', date: 0, total: 5 },
                { id: 'd', date: 1_739_923_200_000, total: 5 },
            ]).map(day => day.id),
        ).toEqual(['d'])
    })

    /**
     * **The unit guard.** If the wire ever switches to seconds, the amounts stay right and every
     * row claims to be from January 1970 — a failure that looks like a data problem rather than a
     * parsing one, which is why it gets a test rather than a comment.
     */
    it('promotes a seconds timestamp to milliseconds', () => {
        expect(normalizeEarningsDays([{ date: 1_739_923_200, total: 1 }])[0].date).toBe(
            1_739_923_200_000,
        )
    })

    /**
     * Legacy keys rows by array index. The list is newest-first, so one new day at the top shifts
     * every index and React hands the wrong row the previous one's expanded state.
     */
    it('falls back to the timestamp when the row carries no id', () => {
        expect(normalizeEarningsDays([{ date: 1_739_923_200_000, total: 1 }])[0].id).toBe(
            '1739923200000',
        )
    })

    it('sorts newest first rather than trusting the order it was given', () => {
        expect(
            normalizeEarningsDays([
                { id: 'old', date: 1_739_836_800_000, total: 1 },
                { id: 'new', date: 1_739_923_200_000, total: 1 },
            ]).map(day => day.id),
        ).toEqual(['new', 'old'])
    })
})

describe('normalizeEarningsDetails', () => {
    it('reads legacy’s `{ details: [...] }` and a bare array alike', () => {
        const rows = [{ category: 'membership', revenue: 3 }]
        expect(normalizeEarningsDetails({ details: rows })).toEqual(rows)
        expect(normalizeEarningsDetails(rows)).toEqual(rows)
    })

    /** A nameless row has nothing to be labelled with — it could only render as blank + money. */
    it('drops a row with no category', () => {
        expect(
            normalizeEarningsDetails([
                { category: '', revenue: 3 },
                { category: null, revenue: 3 },
                { category: '  membership  ', revenue: 3 },
            ]),
        ).toEqual([{ category: 'membership', revenue: 3 }])
    })

    /** Kept here, filtered at the call site — the two are different decisions. */
    it('keeps a zero-revenue row', () => {
        expect(normalizeEarningsDetails([{ category: 'post', revenue: 0 }])).toEqual([
            { category: 'post', revenue: 0 },
        ])
    })
})
