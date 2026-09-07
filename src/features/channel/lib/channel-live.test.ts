import { describe, expect, it } from 'vitest'
import { channelEventSchema } from '../api/events-api'
import { isChannelLive, liveEvents } from './channel-live'

/**
 * Rows go through the **real schema**, not hand-written objects. The case-insensitivity these tests
 * rely on lives in `channelEventSchema` (it upper-cases `status` on the way in), so asserting it
 * against a literal would test a normalisation nobody performs at runtime.
 */
const channel = (...statuses: unknown[]) => ({
    lives: statuses.map(status => channelEventSchema.parse({ status, code: 'c', title: 't' })),
})

describe('isChannelLive', () => {
    it('is live when any event says so, whatever the case on the wire', () => {
        expect(isChannelLive(channel('live'))).toBe(true)
        expect(isChannelLive(channel('Live'))).toBe(true)
        expect(isChannelLive(channel('ENDED', 'LIVE'))).toBe(true)
    })

    it('is not live for events that have ended, are scheduled, or say nothing', () => {
        expect(isChannelLive(channel('ENDED'))).toBe(false)
        expect(isChannelLive(channel('PUBLISHED'))).toBe(false)
        expect(isChannelLive(channel(null))).toBe(false)
    })

    it('is not live with no events — the case legacy gets backwards', () => {
        // `findIndex` on a missing array yields undefined, and `undefined !== -1` is true, so legacy
        // paints a live flag on a space that has never streamed.
        expect(isChannelLive({ lives: [] })).toBe(false)
        expect(isChannelLive(undefined)).toBe(false)
        expect(isChannelLive(null)).toBe(false)
    })
})

describe('liveEvents', () => {
    it('returns only the events on air, and keeps their order', () => {
        const rows = liveEvents(channel('ENDED', 'LIVE', 'CANCELLED', 'live'))

        expect(rows).toHaveLength(2)
        expect(rows.every(event => event.status === 'LIVE')).toBe(true)
    })

    it('is empty rather than null when nothing is on air', () => {
        expect(liveEvents(channel('ENDED'))).toEqual([])
        expect(liveEvents(null)).toEqual([])
    })
})
