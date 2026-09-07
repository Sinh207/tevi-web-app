// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '../api/types'
import { AUTO_FOLLOW_SECONDS } from '../lib/auto-follow'
import { useAutoFollow } from './use-auto-follow'

/**
 * What this hook promises, none of which a pure test of `shouldCountDown` can reach: the clock ticks
 * real seconds, it fires **once**, it stops when the tab goes away, and every one of the three exits
 * closes the other two.
 *
 * The fire-once case is the one worth the setup. `follow.run` is optimistic, so `is_followed` flips
 * a beat later — and "a beat later" is exactly the window a second tick can land in. A duplicate
 * follow is invisible in a browser (the endpoint is idempotent enough that nobody would notice) and
 * would stay that way until it was somebody's analytics problem.
 */

const run = vi.hoisted(() => vi.fn())
const authed = vi.hoisted(() => ({ value: true }))
const autoFollow = vi.hoisted(() => ({ value: true }))

vi.mock('@features/auth', () => ({
    accountAutoFollow: () => autoFollow.value,
    useAuth: () => ({ currentUser: {}, isAuthenticated: authed.value }),
    useRequireAuth:
        () =>
        (cb: (...a: unknown[]) => void) =>
        (...a: unknown[]) => {
            if (authed.value) cb(...a)
        },
}))

vi.mock('./use-channel-actions', () => ({
    useChannelActions: () => ({ follow: { run, isPending: false } }),
}))

function channel(overrides: Partial<Channel> = {}) {
    return { slug: 'ada', is_followed: false, ...overrides } as unknown as Channel
}

function renderHook(initial = channel()) {
    let api!: ReturnType<typeof useAutoFollow>
    function Probe({ value }: { value: Channel }) {
        api = useAutoFollow(value)
        return null
    }
    const view = render(<Probe value={initial} />)
    return {
        read: () => api,
        run: (fn: (a: typeof api) => void) => act(() => fn(api)),
        rerender: (next: Channel) => act(() => view.rerender(<Probe value={next} />)),
    }
}

/** Advance the clock by whole seconds, flushing React between each. */
function tick(seconds: number) {
    act(() => {
        vi.advanceTimersByTime(seconds * 1000)
    })
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    authed.value = true
    autoFollow.value = true
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})

afterEach(() => {
    vi.useRealTimers()
})

describe('the countdown', () => {
    it('starts at legacy’s duration and counts real seconds', () => {
        const hook = renderHook()
        expect(hook.read().remaining).toBe(AUTO_FOLLOW_SECONDS)

        tick(3)

        expect(hook.read().remaining).toBe(AUTO_FOLLOW_SECONDS - 3)
        expect(run).not.toHaveBeenCalled()
    })

    it('follows when it reaches zero', () => {
        const hook = renderHook()

        tick(AUTO_FOLLOW_SECONDS)

        expect(run).toHaveBeenCalledTimes(1)
        expect(hook.read().isCountingDown).toBe(false)
    })

    it('fires exactly once, even while `is_followed` has not come back yet', () => {
        renderHook()

        tick(AUTO_FOLLOW_SECONDS)
        // The optimistic update has not landed, and more time passes.
        tick(5)

        expect(run).toHaveBeenCalledTimes(1)
    })

    it('does not run for a signed-out reader — the bar is still an invitation', () => {
        authed.value = false
        const hook = renderHook()

        tick(AUTO_FOLLOW_SECONDS + 2)

        expect(run).not.toHaveBeenCalled()
        expect(hook.read().isCountingDown).toBe(false)
    })

    it('does not run when the account has not opted in', () => {
        autoFollow.value = false
        renderHook()

        tick(AUTO_FOLLOW_SECONDS + 2)

        expect(run).not.toHaveBeenCalled()
    })

    it('pauses while the tab is in the background', () => {
        const hook = renderHook()
        tick(2)

        act(() => {
            Object.defineProperty(document, 'hidden', { value: true, configurable: true })
            document.dispatchEvent(new Event('visibilitychange'))
        })
        tick(30)

        // Legacy would have followed a space nobody was looking at.
        expect(run).not.toHaveBeenCalled()
        expect(hook.read().remaining).toBe(AUTO_FOLLOW_SECONDS - 2)

        act(() => {
            Object.defineProperty(document, 'hidden', { value: false, configurable: true })
            document.dispatchEvent(new Event('visibilitychange'))
        })
        tick(AUTO_FOLLOW_SECONDS)

        expect(run).toHaveBeenCalledTimes(1)
    })
})

describe('the two presses', () => {
    it('skip stops the clock and leaves the offer standing', () => {
        const hook = renderHook()

        hook.run(h => h.skip())
        tick(AUTO_FOLLOW_SECONDS + 5)

        expect(run).not.toHaveBeenCalled()
        expect(hook.read().skipped).toBe(true)
        expect(hook.read().isCountingDown).toBe(false)
    })

    it('following manually also stops the clock, so it cannot follow twice', () => {
        const hook = renderHook()

        hook.run(h => h.followNow())
        tick(AUTO_FOLLOW_SECONDS + 5)

        expect(run).toHaveBeenCalledTimes(1)
    })

    /**
     * The bug the overflow menu introduced, and the reason `followNow` is no longer guarded by the
     * fire-once ref: **follow → unfollow → follow** in one visit.
     *
     * `fired` is reset only when the slug changes, so once the bar had fired — by countdown or by
     * press — a later press returned immediately and sent nothing. It was sound for exactly as long
     * as the page had no Unfollow; `ChannelViewerMenu` gave it one.
     */
    it('follows again after an unfollow in the same visit', () => {
        const hook = renderHook()

        hook.run(h => h.followNow())
        expect(run).toHaveBeenCalledTimes(1)

        hook.rerender(channel({ is_followed: true }))
        hook.rerender(channel({ is_followed: false }))

        hook.run(h => h.followNow())
        expect(run).toHaveBeenCalledTimes(2)
    })

    /**
     * And it must not follow **by itself** afterwards. Unfollowing hands the countdown a space that
     * is not followed; without the transition watch it would resume and undo a deliberate press ten
     * seconds later.
     */
    it('never re-follows on its own after an unfollow', () => {
        const hook = renderHook()

        hook.rerender(channel({ is_followed: true }))
        hook.rerender(channel({ is_followed: false }))

        expect(hook.read().skipped).toBe(true)
        expect(hook.read().isCountingDown).toBe(false)
        tick(AUTO_FOLLOW_SECONDS + 5)
        expect(run).not.toHaveBeenCalled()
    })

    it('a signed-out press does not follow — the login dialog comes first', () => {
        authed.value = false
        const hook = renderHook()

        hook.run(h => h.followNow())

        expect(run).not.toHaveBeenCalled()
    })
})

describe('moving between spaces', () => {
    it('resets the clock and the skip when the slug changes', () => {
        const hook = renderHook()
        hook.run(h => h.skip())
        tick(3)

        hook.rerender(channel({ slug: 'grace' }))

        expect(hook.read().remaining).toBe(AUTO_FOLLOW_SECONDS)
        expect(hook.read().skipped).toBe(false)

        tick(AUTO_FOLLOW_SECONDS)
        expect(run).toHaveBeenCalledTimes(1)
    })
})
