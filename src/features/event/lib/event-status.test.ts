import { describe, expect, it } from 'vitest'
import {
    eventStatusChip,
    isLive,
    isOffAir,
    isRecentlyEnded,
    isUpcoming,
    RECENTLY_ENDED_MS,
} from './event-status'

describe('eventStatusChip', () => {
    it('gives every known status a label and a role', () => {
        expect(eventStatusChip('LIVE')).toEqual({
            key: 'event_status_happening_now',
            status: 'error',
        })
        expect(eventStatusChip('PUBLISHED')?.key).toBe('event_status_coming_soon')
        expect(eventStatusChip('CANCELLED')?.status).toBe('outline')
    })

    /**
     * Legacy's `default` branch returns `{ label: '', color: '' }`, which paints a transparent 22px
     * pill with nothing in it. `null` renders no chip at all.
     */
    it('is null for an absent or unrecognised status', () => {
        expect(eventStatusChip(null)).toBeNull()
        expect(eventStatusChip('ARCHIVED')).toBeNull()
        // Not lower-cased here on purpose: the schema upper-cases on the way in, so a lower-case
        // value reaching this function means it did not come through the schema.
        expect(eventStatusChip('live')).toBeNull()
    })
})

describe('the temporal predicates', () => {
    it('splits the six statuses three ways with no overlap', () => {
        const statuses = ['LIVE', 'PUBLISHED', 'PREPARING', 'PAUSED', 'ENDED', 'CANCELLED']
        for (const status of statuses) {
            const hits = [isLive(status), isUpcoming(status), isOffAir(status)].filter(Boolean)
            expect(hits.length, status).toBe(1)
        }
    })

    /** `PAUSED` is off-air — legacy's own grouping. Not playing, and not over either. */
    it('counts a paused stream as off air', () => {
        expect(isOffAir('PAUSED')).toBe(true)
        expect(isLive('PAUSED')).toBe(false)
    })

    it('answers false for everything on an absent status', () => {
        expect(isLive(null)).toBe(false)
        expect(isUpcoming(null)).toBe(false)
        expect(isOffAir(null)).toBe(false)
    })
})

describe('isRecentlyEnded', () => {
    const now = Date.parse('2026-02-20T12:00:00Z')

    it('is true inside the five-minute window and false outside it', () => {
        expect(isRecentlyEnded(new Date(now - 60_000).toISOString(), now)).toBe(true)
        // Exactly on the boundary is still "recently": the window is inclusive, so a stream that
        // ended five minutes ago to the millisecond does not flip mid-render.
        expect(isRecentlyEnded(new Date(now - RECENTLY_ENDED_MS).toISOString(), now)).toBe(true)
        expect(isRecentlyEnded(new Date(now - RECENTLY_ENDED_MS - 1).toISOString(), now)).toBe(
            false,
        )
    })

    /**
     * Clock skew. A device a minute behind the server would otherwise read a just-ended stream as
     * having ended in the future and answer `false` — the one case where the arithmetic is right
     * and the answer is wrong.
     */
    it('treats a future timestamp as just now', () => {
        expect(isRecentlyEnded(new Date(now + 60_000).toISOString(), now)).toBe(true)
    })

    it('is false with no timestamp, or an unparseable one', () => {
        expect(isRecentlyEnded(null, now)).toBe(false)
        expect(isRecentlyEnded('soon', now)).toBe(false)
    })
})
