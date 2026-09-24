// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventDetailSchema } from '../api/types'
import { RECENTLY_ENDED_MS } from '../lib/event-status'
import { useLiveStudio } from './use-live-studio'

/**
 * **The two halves `isStudioEligible` cannot hold** — the viewport, and the passage of time.
 *
 * Both fail quietly and neither is visible from a call site, which is the whole reason this file
 * exists:
 *
 * 1. Answering `true` on the **first render** is a hydration mismatch that only shows up in the
 *    built page: the server has no `matchMedia`, so a hook that guessed would emit a
 *    `fixed inset-0` stage into HTML that a phone then loads and is covered by until hydration
 *    corrects it. `CLAUDE.md` records the same class of bug for `undefined` props across the RSC
 *    boundary — passes in jsdom, fails in production.
 * 2. The **five-minute window has to actually close.** Nothing re-renders on its own at that
 *    moment — the event payload stopped changing when the status flipped — so without a timer the
 *    reader sits on "the broadcast has ended" until they touch something.
 */
const listeners = new Set<() => void>()

/*
 * One `MediaQueryList` with a **mutable** `matches`, rather than a fresh object per stub.
 *
 * The hook calls `matchMedia` once and keeps the result, so its listener re-reads `mq.matches` off
 * the object it captured at mount. Re-stubbing the global with a new object would leave that
 * listener reading the old one — the resize case would pass for the wrong reason, or rather fail
 * for one.
 */
const viewport = {
    matches: false,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
}

function mockViewport(wide: boolean) {
    viewport.matches = wide
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => viewport),
    )
}

/** Flip the viewport and let the hook's own listener notice, as a real resize would. */
function resizeTo(wide: boolean) {
    viewport.matches = wide
    act(() => {
        for (const cb of listeners) cb()
    })
}

const NOW = Date.parse('2026-09-21T12:00:00.000Z')

function event(status: string, endedAt?: string) {
    return eventDetailSchema.parse({
        code: 'evt-1',
        status,
        ended_at: endedAt ?? null,
        channel: { id: 'ch-1', slug: 'ada' },
    })
}

/** Every render's answer, in order — the first entry is the one the server has to match. */
function track(ev: ReturnType<typeof event> | null) {
    const seen: boolean[] = []
    function Probe() {
        seen.push(useLiveStudio(ev))
        return null
    }
    render(<Probe />)
    return seen
}

beforeEach(() => {
    listeners.clear()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('the first render', () => {
    it('says no on a wide viewport, and only then says yes', () => {
        mockViewport(true)
        const seen = track(event('LIVE'))
        expect(seen[0]).toBe(false)
        expect(seen.at(-1)).toBe(true)
    })

    it('says no on a narrow viewport and keeps saying it', () => {
        mockViewport(false)
        const seen = track(event('LIVE'))
        expect(seen.every(v => v === false)).toBe(true)
    })
})

describe('a viewport that changes while the page is open', () => {
    /*
     * A window dragged narrower must hand the reader back to the details page. The listener is the
     * only thing that can notice — the event payload has not changed and nothing else re-renders.
     */
    it('closes the studio when the window is dragged below the breakpoint', () => {
        mockViewport(true)
        const seen = track(event('LIVE'))
        expect(seen.at(-1)).toBe(true)

        resizeTo(false)
        expect(seen.at(-1)).toBe(false)
    })
})

describe('the five-minute window closing', () => {
    it('drops out of the studio when the window expires, with nothing else changing', () => {
        mockViewport(true)
        const endedAt = new Date(NOW - 60_000).toISOString()
        const seen = track(event('ENDED', endedAt))
        expect(seen.at(-1)).toBe(true)

        // Everything left of the window, and one tick past it. The event prop is untouched: the
        // timer is the only thing that can move the answer.
        act(() => {
            vi.advanceTimersByTime(RECENTLY_ENDED_MS - 60_000 + 1)
        })
        expect(seen.at(-1)).toBe(false)
    })

    /**
     * The remainder is measured from **now**, not from mount.
     *
     * Somebody arriving four minutes after the stream stopped has one minute left, not five. A
     * timer armed for the full window would keep them on the stage for four minutes longer than
     * anyone who was already there.
     */
    it('arms the timer for what is left, not for the whole window', () => {
        mockViewport(true)
        const endedAt = new Date(NOW - 4 * 60_000).toISOString()
        const seen = track(event('ENDED', endedAt))
        expect(seen.at(-1)).toBe(true)

        act(() => {
            vi.advanceTimersByTime(60_001)
        })
        expect(seen.at(-1)).toBe(false)
    })

    /*
     * A live stream has no expiry to wait for. Arming a timer for one would be a re-render on a
     * page that is doing real work, for an answer that cannot have changed.
     */
    it('arms no timer at all for a stream that is on air', () => {
        mockViewport(true)
        track(event('LIVE'))
        expect(vi.getTimerCount()).toBe(0)
    })

    /*
     * Already outside the window on arrival: there is nothing to schedule, and a zero-delay
     * timeout would only be a render that changes nothing.
     */
    it('arms no timer for a stream that ended long ago', () => {
        mockViewport(true)
        const stale = new Date(NOW - 10 * RECENTLY_ENDED_MS).toISOString()
        const seen = track(event('ENDED', stale))
        expect(seen.at(-1)).toBe(false)
        expect(vi.getTimerCount()).toBe(0)
    })
})
