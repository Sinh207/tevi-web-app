import { describe, expect, it } from 'vitest'
import { normalizeChannelStats, normalizeMetricOptions, normalizeTopEarning } from './types'

/**
 * What the parsers do with payloads the backend can actually send.
 *
 * The rule these pin is the one in the file's own header: this screen shows a creator **money**, so a
 * field that cannot be read must not become a plausible wrong number. Each case below is a shape that
 * would otherwise reach the chart as `NaN`, as 1970, or as a tab that cannot be pressed.
 */

const metric = (over: Record<string, unknown> = {}) => ({
    id: 7,
    name: 'total_revenue',
    description: 'Total Revenue',
    display: '$1,204.30',
    prev_display: '$980.00',
    last_duration_compare_percent: '22.887',
    is_integer: false,
    currency_display: '$',
    hour_interval: 24,
    points: [
        { date: 1_739_923_200_000, amount: 12.5 },
        { date: 1_740_009_600_000, amount: '20.25' },
    ],
    prev_points: [{ date: 1_737_244_800_000, amount: 8 }],
    ...over,
})

describe('normalizeChannelStats', () => {
    it('reads the payload the endpoint sends today', () => {
        const [parsed] = normalizeChannelStats([metric()])
        expect(parsed).toMatchObject({
            id: '7',
            name: 'total_revenue',
            display: '$1,204.30',
            prevDisplay: '$980.00',
            // Arrives as a string; `parseFloat` is what legacy calls, and `Number(undefined)` is NaN.
            changePercent: 22.887,
            currencyDisplay: '$',
            hourInterval: 24,
        })
        // Amounts may be strings — money over JSON commonly is, to avoid float drift.
        expect(parsed.points.map(p => p.amount)).toEqual([12.5, 20.25])
    })

    it('accepts the array under `results` as well as bare', () => {
        expect(normalizeChannelStats({ results: [metric()] })).toHaveLength(1)
        expect(normalizeChannelStats([metric()])).toHaveLength(1)
    })

    it('drops a metric with no id, because a tab is keyed on it', () => {
        expect(normalizeChannelStats([metric({ id: null })])).toEqual([])
    })

    it('promotes a series that arrives in seconds instead of milliseconds', () => {
        // The exact failure a unit change on the wire would produce: every date in January 1970,
        // with the amounts still right.
        const [parsed] = normalizeChannelStats([
            metric({ points: [{ date: 1_739_923_200, amount: 1 }], prev_points: [] }),
        ])
        expect(parsed.points[0].date).toBe(1_739_923_200_000)
    })

    it('drops a point with no date and sorts what is left', () => {
        const [parsed] = normalizeChannelStats([
            metric({
                points: [
                    { date: 1_740_009_600_000, amount: 2 },
                    { date: null, amount: 99 },
                    { date: 1_739_923_200_000, amount: 1 },
                ],
                prev_points: [],
            }),
        ])
        expect(parsed.points.map(p => p.amount)).toEqual([1, 2])
    })

    it('reads an unreadable figure as zero rather than NaN', () => {
        const [parsed] = normalizeChannelStats([
            metric({
                last_duration_compare_percent: 'lots',
                points: [{ date: 1_739_923_200_000, amount: undefined }],
            }),
        ])
        expect(parsed.changePercent).toBe(0)
        expect(parsed.points[0].amount).toBe(0)
    })

    it('falls back to daily buckets when the interval is missing', () => {
        // A zero would make the axis print a time of day for daily buckets.
        expect(normalizeChannelStats([metric({ hour_interval: 0 })])[0].hourInterval).toBe(24)
    })

    it('does not reject a row over a field it has never heard of', () => {
        // `looseObject` is tolerance, not pass-through: the row parses, and the unmodelled field is
        // simply not in the mapped result until someone adds it to both.
        const [parsed] = normalizeChannelStats([metric({ future_field: 'ignored' })])
        expect(parsed.id).toBe('7')
        expect(parsed).not.toHaveProperty('future_field')
    })

    it('is empty for anything that is not a list', () => {
        expect(normalizeChannelStats(null)).toEqual([])
        expect(normalizeChannelStats({ detail: 'Not found' })).toEqual([])
        expect(normalizeChannelStats('nope')).toEqual([])
    })
})

describe('normalizeTopEarning', () => {
    const item = (over: Record<string, unknown> = {}) => ({
        thumbnail: 'https://static.tevi.com/a.jpg',
        title: 'Friday night stream',
        tag: 'Live',
        display: '$402.00',
        time: 1_739_923_200_000,
        ...over,
    })

    it('accepts the array bare, under `items`, and under `results`', () => {
        expect(normalizeTopEarning([item()])).toHaveLength(1)
        expect(normalizeTopEarning({ items: [item()] })).toHaveLength(1)
        expect(normalizeTopEarning({ results: [item()] })).toHaveLength(1)
    })

    it('drops an untitled row', () => {
        // A thumbnail and a figure with nothing to say which post earned it.
        expect(normalizeTopEarning([item({ title: '   ' })])).toEqual([])
    })

    it('keys on position *and* time, so a reordered refetch cannot reuse a row', () => {
        const [first, second] = normalizeTopEarning([item(), item({ time: 1_740_009_600_000 })])
        expect(first.key).not.toBe(second.key)
    })

    it('keeps a row whose time is unreadable, with a null time', () => {
        // The figure is still true; only the date line is dropped.
        const [parsed] = normalizeTopEarning([item({ time: 'unknown' })])
        expect(parsed.time).toBeNull()
        expect(parsed.display).toBe('$402.00')
    })
})

describe('normalizeMetricOptions', () => {
    it('drops an option with no id, which could not be chosen', () => {
        const parsed = normalizeMetricOptions([
            { id: 1, name: 'total_revenue', description: 'Total Revenue' },
            { name: 'orphan', description: 'No id' },
        ])
        expect(parsed).toEqual([{ id: '1', name: 'total_revenue', description: 'Total Revenue' }])
    })

    it('is empty for a non-list', () => {
        expect(normalizeMetricOptions(undefined)).toEqual([])
    })
})
