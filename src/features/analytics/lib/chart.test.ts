import { describe, expect, it } from 'vitest'
import { buildChart, nearestIndex, niceStep, pointChangePercent } from './chart'

/**
 * The chart's arithmetic.
 *
 * A wrong chart is not visibly wrong — it is a plausible line — so the scale, the baseline and the
 * tick ladder are asserted rather than eyeballed. These are the cases that would each produce a
 * believable picture of the wrong thing.
 */

const point = (date: number, current: number, previous = 0) => ({ date, current, previous })

describe('niceStep', () => {
    it('climbs the 1-2-5 ladder', () => {
        expect(niceStep(1)).toBe(1)
        expect(niceStep(1.5)).toBe(2)
        expect(niceStep(4)).toBe(5)
        expect(niceStep(9)).toBe(10)
        expect(niceStep(25)).toBe(20)
        expect(niceStep(120)).toBe(100)
    })

    it('never returns zero, whatever it is handed', () => {
        // A zero step is a division by zero two lines later, and the inputs include an empty period.
        expect(niceStep(0)).toBe(1)
        expect(niceStep(-5)).toBe(1)
        expect(niceStep(Number.NaN)).toBe(1)
    })
})

describe('buildChart', () => {
    it('draws no twin for a bucket the backend sent none for', () => {
        /*
         * A metric with an empty `prev_points` used to be coerced to zeros: a dashed line flat along
         * the baseline and "↑ 100%" in every tooltip, for a period nobody sent.
         */
        const chart = buildChart({
            points: [
                { date: 1, current: 10, previous: null },
                { date: 2, current: 20, previous: null },
            ],
            compare: true,
            width: 100,
            height: 50,
        })
        expect(chart.coords.every(coord => coord.previousY === null)).toBe(true)
        expect(chart.previousPath).toBe('')
    })

    it('survives an empty series', () => {
        const chart = buildChart({ points: [] })
        expect(chart.currentPath).toBe('')
        expect(chart.coords).toEqual([])
        expect(chart.ticks).toEqual([])
    })

    it('starts the axis at zero for non-negative data', () => {
        // Scaling to dataMin would draw 1000 → 1010 as a doubling.
        const chart = buildChart({ points: [point(1, 1000), point(2, 1010)], compare: false })
        expect(chart.min).toBe(0)
        expect(chart.max).toBeGreaterThanOrEqual(1010)
    })

    it('keeps a real minimum when the data goes negative', () => {
        const chart = buildChart({ points: [point(1, -50), point(2, 100)], compare: false })
        expect(chart.min).toBe(-50)
    })

    it('gives an all-zero period a domain it can be drawn in', () => {
        // The first thing a new creator sees. A zero-height domain divides by zero.
        const chart = buildChart({ points: [point(1, 0), point(2, 0)], compare: false })
        expect(chart.max).toBeGreaterThan(chart.min)
        expect(chart.coords.every(coord => Number.isFinite(coord.y))).toBe(true)
        // Flat along the bottom, which is the truth.
        expect(chart.coords[0].y).toBe(chart.coords[1].y)
    })

    it('drops the comparison from the domain when compare is off', () => {
        const points = [point(1, 10, 1000), point(2, 20, 2000)]
        const withCompare = buildChart({ points, compare: true })
        const without = buildChart({ points, compare: false })
        expect(withCompare.max).toBeGreaterThan(without.max)
        expect(without.previousPath).toBe('')
        expect(without.coords[0].previousY).toBeNull()
    })

    it('spaces buckets evenly and centres a lone one', () => {
        const three = buildChart({ points: [point(1, 1), point(2, 2), point(3, 3)], width: 1000 })
        expect(three.coords.map(coord => coord.x)).toEqual([0, 500, 1000])

        // A single bucket has no line to draw, so the component shows the dot — and a dot at x=0
        // reads as a clipped chart.
        const one = buildChart({ points: [point(1, 5)], width: 1000 })
        expect(one.coords[0].x).toBe(500)
        expect(one.currentPath).toBe('')
    })

    it('draws the higher value further up the plot', () => {
        // y grows downwards in SVG; inverting this is the classic silent chart bug.
        const chart = buildChart({ points: [point(1, 0), point(2, 100)], compare: false })
        expect(chart.coords[1].y).toBeLessThan(chart.coords[0].y)
    })

    it('keeps every point inside the box, inset for the stroke', () => {
        const chart = buildChart({
            points: [point(1, 0), point(2, 100)],
            compare: false,
            height: 200,
        })
        for (const coord of chart.coords) {
            expect(coord.y).toBeGreaterThanOrEqual(4)
            expect(coord.y).toBeLessThanOrEqual(196)
        }
    })

    it('labels the axis in round numbers, ending on the top line', () => {
        const chart = buildChart({ points: [point(1, 0), point(2, 87)], compare: false })
        expect(chart.ticks.map(tick => tick.value)).toEqual([0, 20, 40, 60, 80, 100])
        expect(chart.ticks.at(-1)?.value).toBe(chart.max)
    })

    it('never divides a count into fractions', () => {
        /*
         * "Live sessions" over a month: 0…2. A half-unit step is "nice" arithmetically and useless
         * here — the labels are whole numbers for a count, so the axis printed `0 · 1 · 1 · 2 · 2`.
         */
        const chart = buildChart({
            points: [point(1, 0), point(2, 2)],
            compare: false,
            minStep: 1,
        })
        expect(chart.ticks.map(tick => tick.value)).toEqual([0, 1, 2])
    })

    it('never divides money below a cent', () => {
        /*
         * A creator who earned **$0.02** in the period. The ladder's answer is a step of `0.005`, and
         * a money axis cannot print half a cent: it came out `$0 · $0.01 · $0.01 · $0.02 · $0.02` —
         * duplicated labels, and React reporting two children with the key `grid-0.01` because the
         * ticks were keyed by value. Reported from a real dashboard.
         */
        const chart = buildChart({
            points: [point(1, 0), point(2, 0.02)],
            compare: false,
            minStep: 0.01,
        })
        expect(chart.ticks.map(tick => tick.value)).toEqual([0, 0.01, 0.02])
    })

    it('gives every tick a distinct value, whatever the domain', () => {
        // The invariant behind both cases above, stated once: a duplicated tick is a duplicated
        // label *and* a duplicated React key.
        for (const [max, minStep] of [
            [0.02, 0.01],
            [0.07, 0.01],
            [2, 1],
            [3, 1],
            [1234.56, 0.01],
            [0.0004, 0],
        ] as const) {
            const values = buildChart({
                points: [point(1, 0), point(2, max)],
                compare: false,
                minStep,
            }).ticks.map(tick => tick.value)
            expect(new Set(values).size, `max ${max} / minStep ${minStep}`).toBe(values.length)
        }
    })

    it('never draws more than eight grid lines', () => {
        // A finely split domain is hatching behind the line, not a scale.
        const chart = buildChart({
            points: [point(1, 0), point(2, 1_000_000)],
            compare: false,
            tickCount: 4,
        })
        expect(chart.ticks.length).toBeLessThanOrEqual(9)
    })
})

describe('nearestIndex', () => {
    it('snaps to the closest bucket, both ends included', () => {
        expect(nearestIndex(0, 5)).toBe(0)
        expect(nearestIndex(0.5, 5)).toBe(2)
        // Flooring would make the last bucket unreachable except at the exact right edge.
        expect(nearestIndex(0.99, 5)).toBe(4)
        expect(nearestIndex(1, 5)).toBe(4)
    })

    it('clamps a pointer that left the box', () => {
        expect(nearestIndex(-2, 5)).toBe(0)
        expect(nearestIndex(4, 5)).toBe(4)
        expect(nearestIndex(Number.NaN, 5)).toBe(0)
        expect(nearestIndex(0.5, 0)).toBe(-1)
    })
})

describe('pointChangePercent', () => {
    it('reads a rise from nothing as +100%', () => {
        expect(pointChangePercent(50, 0)).toBe(100)
        expect(pointChangePercent(0, 0)).toBe(0)
    })

    it('is signed', () => {
        expect(pointChangePercent(150, 100)).toBe(50)
        expect(pointChangePercent(50, 100)).toBe(-50)
    })
})
