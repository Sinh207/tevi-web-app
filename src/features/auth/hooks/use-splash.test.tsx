// @vitest-environment jsdom
import { SPLASH_FADE_MS } from '@shared/components/splash'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../store/auth-store'
import {
    SPLASH_MAX_MS,
    SPLASH_MIN_MS,
    type SplashState,
    splashHideDelay,
    useSplashState,
} from './use-splash'

/**
 * The splash is the one thing in this app drawn over the whole viewport on a timer, which makes
 * both of its failure modes invisible in a browser: a fast machine hides the floor (the cover
 * blinks and you blame the render), and a stalled bootstrap hides the ceiling (you wait, decide
 * it is slow, and reload before finding out it was never going to leave). Neither is something a
 * comment can pin down — they are clocks, so they are tested.
 */

function setBootstrapping(value: boolean) {
    act(() => useAuthStore.getState().setBootstrapping(value))
}

function renderProbe() {
    let state: SplashState = 'visible'
    function Probe() {
        state = useSplashState()
        return null
    }
    const view = render(<Probe />)
    return {
        get state() {
            return state
        },
        unmount: view.unmount,
    }
}

beforeEach(() => {
    vi.useFakeTimers()
    useAuthStore.setState({ isBootstrapping: true })
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('splashHideDelay', () => {
    it('schedules nothing while the session is still bootstrapping', () => {
        expect(splashHideDelay({ isBootstrapping: true, elapsedMs: 0 })).toBeNull()
        expect(splashHideDelay({ isBootstrapping: true, elapsedMs: 500 })).toBeNull()
    })

    it('holds a fast bootstrap for the remainder of the floor', () => {
        expect(splashHideDelay({ isBootstrapping: false, elapsedMs: 100 })).toBe(
            SPLASH_MIN_MS - 100,
        )
    })

    it('leaves immediately once the floor has already passed', () => {
        expect(splashHideDelay({ isBootstrapping: false, elapsedMs: SPLASH_MIN_MS + 200 })).toBe(0)
    })

    it('lets the ceiling override a bootstrap that never finished', () => {
        // The distinction the return type exists for: `null` would mean "no exit scheduled",
        // which at this point is the bug.
        expect(splashHideDelay({ isBootstrapping: true, elapsedMs: SPLASH_MAX_MS })).toBe(0)
    })
})

describe('useSplashState', () => {
    it('holds a bootstrap that finished early until the floor', () => {
        const probe = renderProbe()
        expect(probe.state).toBe('visible')

        act(() => void vi.advanceTimersByTime(50))
        setBootstrapping(false)

        // Still covering: the whole point of the floor is that this frame is not a blink.
        act(() => void vi.advanceTimersByTime(SPLASH_MIN_MS - 100))
        expect(probe.state).toBe('visible')

        act(() => void vi.advanceTimersByTime(100))
        expect(probe.state).toBe('leaving')
    })

    it('unmounts a fade after its own length', () => {
        const probe = renderProbe()
        setBootstrapping(false)
        act(() => void vi.advanceTimersByTime(SPLASH_MIN_MS))
        expect(probe.state).toBe('leaving')

        act(() => void vi.advanceTimersByTime(SPLASH_FADE_MS - 1))
        expect(probe.state).toBe('leaving')

        act(() => void vi.advanceTimersByTime(1))
        expect(probe.state).toBe('gone')
    })

    it('leaves on the ceiling even though the bootstrap never finishes', () => {
        const probe = renderProbe()

        act(() => void vi.advanceTimersByTime(SPLASH_MAX_MS - 1))
        expect(probe.state).toBe('visible')
        expect(useAuthStore.getState().isBootstrapping).toBe(true)

        act(() => void vi.advanceTimersByTime(1))
        expect(probe.state).toBe('leaving')

        act(() => void vi.advanceTimersByTime(SPLASH_FADE_MS))
        expect(probe.state).toBe('gone')
    })

    it('does not re-raise the cover when a later sign-out re-enters bootstrap', () => {
        // `AuthProvider` does not raise the flag again on `auth:session-expired`, but nothing
        // stops a future caller from doing so — and a full-screen brand cover thrown over a page
        // the user is reading is a worse bug than the one it would be fixing.
        const probe = renderProbe()
        setBootstrapping(false)
        // Advanced in two steps, not one: the fade timer is only armed by the effect that runs
        // after `leaving` commits, so a single jump past both deadlines would start it late.
        act(() => void vi.advanceTimersByTime(SPLASH_MIN_MS))
        act(() => void vi.advanceTimersByTime(SPLASH_FADE_MS))
        expect(probe.state).toBe('gone')

        setBootstrapping(true)
        act(() => void vi.advanceTimersByTime(SPLASH_MAX_MS))
        expect(probe.state).toBe('gone')
    })

    it('drops the cover without a fade under reduced motion', () => {
        // Stubbed rather than spied on: jsdom ships no `matchMedia` at all, which is also why
        // the hook calls it optionally.
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: query.includes('prefers-reduced-motion'),
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
        }))

        const probe = renderProbe()
        setBootstrapping(false)
        act(() => void vi.advanceTimersByTime(SPLASH_MIN_MS))

        // Straight to `gone`: with `animate-none` the fade never runs, so a `leaving` frame would
        // be 240ms of the cover sitting at full opacity — see the note on `tevi-fade-out`.
        expect(probe.state).toBe('gone')
    })

    it('clears its timers on unmount', () => {
        const probe = renderProbe()
        probe.unmount()
        expect(vi.getTimerCount()).toBe(0)
    })
})
