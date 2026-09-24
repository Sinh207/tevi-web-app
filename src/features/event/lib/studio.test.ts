import { describe, expect, it } from 'vitest'
import { eventDetailSchema } from '../api/types'
import { RECENTLY_ENDED_MS } from './event-status'
import { isStudioEligible } from './studio'

/**
 * **Which streams open the Live studio** — legacy's `EventLayout` condition, minus the two halves
 * that are not a pure function's to know.
 *
 * The predicate has exactly one interesting edge and it is the five-minute window. Everything else
 * is a status lookup; the window is where a wrong answer is invisible and consequential, because
 * both mistakes look like a working page:
 *
 * - closing it **too early** swaps somebody who was watching onto a details page the instant the
 *   broadcast stops, so the stream they were in reads as one that never happened;
 * - never closing it leaves an hours-dead stream showing "the broadcast has ended" on a
 *   full-viewport stage instead of the page with the title, the host and the description.
 */
function event(status: string, endedAt?: string) {
    return eventDetailSchema.parse({
        code: 'evt-1',
        status,
        ended_at: endedAt ?? null,
        channel: { id: 'ch-1', slug: 'ada' },
    })
}

const NOW = Date.parse('2026-09-21T12:00:00.000Z')

describe('a stream that is on air', () => {
    it('opens the studio, with no clock involved', () => {
        expect(isStudioEligible(event('LIVE'), NOW)).toBe(true)
    })

    /*
     * A live stream has no `ended_at`, and the one it might carry is from a *previous* run of the
     * same event. Reading it would close the studio on a broadcast that is currently on air, which
     * is why `isLive` short-circuits ahead of the window.
     */
    it('opens it even carrying a stale ended_at from a previous run', () => {
        const longAgo = new Date(NOW - 10 * RECENTLY_ENDED_MS).toISOString()
        expect(isStudioEligible(event('LIVE', longAgo), NOW)).toBe(true)
    })
})

describe('a stream that has come off air', () => {
    /**
     * Three statuses, not one.
     *
     * Legacy's `isEnded` is `['CANCELLED', 'ENDED', 'PAUSED'].includes(status)` — measured from
     * `containers/event/hook/index.js`, not inferred. **`PAUSED` is the one that matters**: the
     * host has stepped away and is coming back, and bouncing the room out to a details page for
     * the duration empties it.
     */
    for (const status of ['ENDED', 'CANCELLED', 'PAUSED']) {
        it(`keeps the studio open for ${status} inside the window`, () => {
            const justNow = new Date(NOW - 60_000).toISOString()
            expect(isStudioEligible(event(status, justNow), NOW)).toBe(true)
        })
    }

    it('closes it once the window has passed', () => {
        const stale = new Date(NOW - RECENTLY_ENDED_MS - 1).toISOString()
        expect(isStudioEligible(event('ENDED', stale), NOW)).toBe(false)
    })

    /** The boundary itself is inclusive — `now - at <= RECENTLY_ENDED_MS`. */
    it('is still open at the last millisecond of the window', () => {
        const edge = new Date(NOW - RECENTLY_ENDED_MS).toISOString()
        expect(isStudioEligible(event('ENDED', edge), NOW)).toBe(true)
    })

    /**
     * ⚠ **No `ended_at` is not "just now".**
     *
     * A stream marked `ENDED` with no timestamp is unplaceable in time, and the studio is the
     * screen that claims to know. Failing to the details page is the honest direction: it says
     * less rather than something possibly wrong, and it is the screen that still has the title and
     * the host on it.
     */
    it('closes it when the payload carries no ended_at at all', () => {
        expect(isStudioEligible(event('ENDED'), NOW)).toBe(false)
    })

    /**
     * A device whose clock runs behind the server's reads a just-ended stream as ended in the
     * future. `isRecentlyEnded` treats anything ahead of `now` as "just now" rather than as out of
     * the window — the alternative drops the whole audience of every stream that ends, on any
     * machine that is a minute slow.
     */
    it('keeps it open when the device clock is behind the server', () => {
        const future = new Date(NOW + 60_000).toISOString()
        expect(isStudioEligible(event('ENDED', future), NOW)).toBe(true)
    })
})

describe('the states the studio never opens for', () => {
    for (const status of ['PUBLISHED', 'PREPARING']) {
        it(`leaves ${status} on the details page`, () => {
            expect(isStudioEligible(event(status), NOW)).toBe(false)
        })
    }

    /*
     * A status this client has never seen. Falling through to the details page is the same
     * fail-quiet direction `watchState`'s `unknown` takes: the backend adding a status must not
     * put a reader on a full-screen stage that describes it wrongly.
     */
    it('leaves a status this client does not know on the details page', () => {
        expect(isStudioEligible(event('ARCHIVED'), NOW)).toBe(false)
    })

    it('answers no without an event at all', () => {
        expect(isStudioEligible(null, NOW)).toBe(false)
    })
})
