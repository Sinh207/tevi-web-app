import { describe, expect, it } from 'vitest'
import { metricLabel } from './metric-labels'

/**
 * The fallback chain, which is the whole point of the module: a metric we have a word for is
 * translated, and one that ships after this client still gets a name.
 */

/** Stands in for `t`: returns the key itself when it has no translation, as i18next does. */
const t = (key: string) => (key === 'analytics_metric_total_revenue' ? 'Tổng doanh thu' : key)

describe('metricLabel', () => {
    it('translates a metric we have a key for', () => {
        expect(
            metricLabel({ id: '1', name: 'total_revenue', description: 'Total Revenue' }, t),
        ).toBe('Tổng doanh thu')
    })

    it('falls back to the payload English for a metric that ships after this client', () => {
        // Missing rather than absent: a new metric appears in English, not as nothing.
        expect(
            metricLabel({ id: '9', name: 'sticker_revenue', description: 'Sticker Revenue' }, t),
        ).toBe('Sticker Revenue')
    })

    it('never prints a raw translation key', () => {
        // A key in the map with no entry in the locales — the only way this can happen — must not
        // put `analytics_metric_…` on screen.
        expect(
            metricLabel({ id: '2', name: 'live_sessions', description: 'Live Sessions' }, t),
        ).toBe('Live Sessions')
    })

    it('keys on the wire name, not the row id', () => {
        // Legacy keys this map on `name` in one place and on `id` in two others, so its tab strip is
        // translated and the chart heading above it is not.
        expect(metricLabel({ id: 'total_revenue', name: '', description: '' }, t)).toBe(
            'total_revenue',
        )
    })

    it('falls all the way back to the id rather than rendering blank', () => {
        expect(metricLabel({ id: '77', name: '', description: '' }, t)).toBe('77')
    })
})
