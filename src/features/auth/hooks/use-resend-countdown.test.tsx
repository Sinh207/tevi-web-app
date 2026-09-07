// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResendCountdown } from './use-resend-countdown'

/**
 * The clock behind every emailed code, now that three flows share it — password reset (60s), passcode
 * recovery (30s) and changing the recovery address (60s). Before the extraction each held its own copy
 * and none of them was tested directly; the flows' own suites only ever drove it forward.
 *
 * The claims are small and all three matter to a *credential* flow: it counts down once per second,
 * it stops at zero rather than going negative, a restart re-arms it, and it tears its timer down.
 */
type Clock = ReturnType<typeof useResendCountdown>

function Probe({ ttl, out }: { ttl: number; out: { clock?: Clock } }) {
    out.clock = useResendCountdown(ttl)
    return null
}

function mount(ttl: number) {
    const out: { clock?: Clock } = {}
    const view = render(<Probe ttl={ttl} out={out} />)
    return {
        view,
        get clock() {
            return out.clock as Clock
        },
    }
}

/** Advance the page clock by whole seconds, one tick per second — which is how the hook re-arms. */
async function tick(seconds: number) {
    for (let i = 0; i < seconds; i += 1) {
        await act(async () => {
            vi.advanceTimersByTime(1000)
        })
    }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
    vi.useRealTimers()
    cleanup()
})

describe('useResendCountdown', () => {
    /** Idle until something is sent — nothing has expired before the first send. */
    it('starts at zero and arms no timer', async () => {
        const probe = mount(30)
        expect(probe.clock.secondsLeft).toBe(0)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('counts down one second at a time from the ttl it was given', async () => {
        const probe = mount(30)
        await act(async () => probe.clock.start())
        expect(probe.clock.secondsLeft).toBe(30)

        await tick(1)
        expect(probe.clock.secondsLeft).toBe(29)
        await tick(28)
        expect(probe.clock.secondsLeft).toBe(1)
    })

    /**
     * **Stops at zero, and stops arming.** A countdown that ran negative would make every
     * `secondsLeft === 0` check — which is how all three callers spell "you may ask again" — false
     * forever one second after it elapsed.
     */
    it('stops at zero and leaves no timer running', async () => {
        const probe = mount(3)
        await act(async () => probe.clock.start())
        await tick(3)

        expect(probe.clock.secondsLeft).toBe(0)
        expect(vi.getTimerCount()).toBe(0)

        await tick(5)
        expect(probe.clock.secondsLeft).toBe(0)
    })

    /** A resend re-arms it from the top, whether it had elapsed or not. */
    it('re-arms on a restart', async () => {
        const probe = mount(60)
        await act(async () => probe.clock.start())
        await tick(59)
        expect(probe.clock.secondsLeft).toBe(1)

        await act(async () => probe.clock.start())
        expect(probe.clock.secondsLeft).toBe(60)
    })

    it('drops the clock on reset', async () => {
        const probe = mount(60)
        await act(async () => probe.clock.start())
        await act(async () => probe.clock.reset())

        expect(probe.clock.secondsLeft).toBe(0)
        expect(vi.getTimerCount()).toBe(0)
    })

    /**
     * **The timer is torn down on unmount.** The reason all three copies used `setTimeout` per tick
     * rather than one `setInterval` — an interval has to be cleared on every exit path, and the one
     * that gets missed leaks a tick per second for the life of the page.
     */
    it('clears its timer when the caller unmounts', async () => {
        const probe = mount(60)
        await act(async () => probe.clock.start())
        expect(vi.getTimerCount()).toBe(1)

        probe.view.unmount()
        expect(vi.getTimerCount()).toBe(0)
    })
})
