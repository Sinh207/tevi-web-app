import type { ChannelStatMetric, TopEarningItem } from '@features/analytics'

/**
 * Fixtures for `/dev/dashboard-analytics`, chosen for the **payload shapes the screen has to
 * survive** rather than four tidy metrics.
 *
 * Dates are built from a fixed instant rather than `Date.now()`, so the preview looks the same
 * tomorrow and a screenshot in a review still matches the page.
 */

/** 19 Feb 2025, local. Matches the fixed `now` in the lib tests, for no reason but consistency. */
const ANCHOR = new Date(2025, 1, 19).getTime()
const DAY = 86_400_000
const HOUR = 3_600_000

function dailySeries(amounts: number[], endMs = ANCHOR) {
    return amounts.map((amount, index) => ({
        date: endMs - (amounts.length - 1 - index) * DAY,
        amount,
    }))
}

function hourlySeries(amounts: number[], endMs = ANCHOR) {
    return amounts.map((amount, index) => ({
        date: endMs - (amounts.length - 1 - index) * HOUR,
        amount,
    }))
}

/** A month of revenue with a weekend shape, a spike, and a quiet tail. */
const REVENUE = [
    182, 210, 168, 240, 302, 480, 512, 260, 198, 176, 220, 265, 401, 620, 588, 240, 210, 195, 230,
    280, 455, 690, 1240, 420, 260, 240, 268, 310, 505, 742,
]

/** The same window, a period earlier — lower, so the comparison line sits under the current one. */
const REVENUE_PREVIOUS = REVENUE.map(value => Math.round(value * 0.78))

export const METRICS: ChannelStatMetric[] = [
    {
        id: '1',
        name: 'total_revenue',
        description: 'Total Revenue',
        display: '$11,204.30',
        prevDisplay: '$8,739.35',
        changePercent: 28.2,
        isInteger: false,
        currencyDisplay: '$',
        hourInterval: 24,
        points: dailySeries(REVENUE),
        prevPoints: dailySeries(REVENUE_PREVIOUS),
    },
    {
        // A count, not money: no symbol, whole numbers on the axis.
        id: '2',
        name: 'live_sessions',
        description: 'Live Sessions',
        display: '18',
        prevDisplay: '24',
        // Down, so the red arrow and the falling comparison can be checked in one place.
        changePercent: -25,
        isInteger: true,
        currencyDisplay: '',
        hourInterval: 24,
        points: dailySeries([1, 0, 0, 1, 1, 2, 1, 0, 0, 1, 1, 1, 2, 1, 0, 0, 1, 0, 1, 1, 2]),
        prevPoints: dailySeries([1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 2, 2]),
    },
    {
        // A period where nothing happened — the first thing a new creator sees. The domain has no
        // height, which is the case that would divide by zero.
        id: '3',
        name: 'membership_revenue',
        description: 'Membership Revenue',
        display: '$0.00',
        prevDisplay: '$0.00',
        changePercent: 0,
        isInteger: false,
        currencyDisplay: '$',
        hourInterval: 24,
        points: dailySeries([0, 0, 0, 0, 0, 0, 0]),
        prevPoints: dailySeries([0, 0, 0, 0, 0, 0, 0]),
    },
    {
        // Hourly buckets (the `yesterday` period), so the axis prints times instead of dates — and a
        // metric the label map has no key for, so the payload's English `description` shows through.
        id: '4',
        name: 'sticker_revenue',
        description: 'Sticker Revenue',
        display: '$42.80',
        prevDisplay: '$0.00',
        changePercent: 100,
        isInteger: false,
        currencyDisplay: '$',
        hourInterval: 1,
        points: hourlySeries([0, 0, 1.2, 4, 2.5, 0, 8, 12.4, 6, 3.2, 0.5, 5]),
        prevPoints: [],
    },
]

/**
 * **A creator who earned two cents.** The domain the ladder cannot divide: its "nice" step for
 * `0.02 / 4` is `0.005`, so the axis used to read `$0 · $0.01 · $0.01 · $0.02 · $0.02` and React
 * reported *"two children with the same key, `grid-0.01`"*. Reported from a real dashboard; kept here
 * because a tiny-money period is the **normal** state for a new creator, not an edge case.
 */
export const TINY_MONEY_METRIC: ChannelStatMetric = {
    id: 'tiny',
    name: 'total_revenue',
    description: 'Total Revenue',
    display: '$0.02',
    prevDisplay: '$0.00',
    changePercent: 100,
    isInteger: false,
    currencyDisplay: '$',
    hourInterval: 24,
    points: dailySeries([0, 0, 0, 0.02, 0, 0, 0]),
    prevPoints: dailySeries([0, 0, 0, 0, 0, 0, 0]),
}

/** One bucket: no line to draw, so the dot is the chart. */
export const SINGLE_POINT_METRIC: ChannelStatMetric = {
    ...METRICS[0],
    id: 'single',
    display: '$182.00',
    points: dailySeries([182]),
    prevPoints: dailySeries([140]),
}

/** No buckets at all — a metric the backend has nothing to say about in this range. */
export const NO_POINTS_METRIC: ChannelStatMetric = {
    ...METRICS[0],
    id: 'empty',
    display: '—',
    prevDisplay: '—',
    points: [],
    prevPoints: [],
}

export const TOP_EARNING: TopEarningItem[] = [
    {
        key: '0',
        // No thumbnail: the glyph tile stands in, rather than a broken image.
        thumbnail: '',
        title: 'Friday night marathon — 6 hours of Valorant with the crew',
        tag: 'Live',
        display: '$1,240.00',
        time: ANCHOR - 2 * DAY,
    },
    {
        key: '1',
        thumbnail: '',
        title: 'Members-only Q&A',
        tag: 'Post',
        display: '$402.00',
        time: ANCHOR - 5 * DAY,
    },
    {
        key: '2',
        thumbnail: '',
        // No tag and no time — both are optional on the wire, and the row has to hold its shape.
        title: 'Behind the scenes: setting up the new studio',
        tag: '',
        display: '$96.50',
        time: null,
    },
]
