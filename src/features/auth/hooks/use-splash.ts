'use client'

import { SPLASH_FADE_MS } from '@shared/components/splash'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth-store'

/**
 * How long the splash cover stays up, and the two numbers that bound it.
 *
 * The logic is split from the component the way `features/channel/lib/onboarding-gate.ts` is
 * split from its provider: the decision is a pure function of "is bootstrap done" and "how long
 * has it been", so it can be stated in a test instead of in a comment.
 */

/**
 * The floor. Bootstrap on a warm cache and a fast machine finishes in a few tens of
 * milliseconds, and a cover that appears and vanishes inside one or two frames reads as a
 * rendering fault, not as a splash — so a fast session is held here rather than blinked.
 */
export const SPLASH_MIN_MS = 600

/**
 * The ceiling, and the reason this is safe to put over the whole app.
 *
 * The bootstrap effect is wrapped in try/finally and always lowers its flag
 * (`auth-provider.tsx`), but it awaits a device fingerprint, a dynamically imported Firebase,
 * an anonymous sign-in and `/me` — four things on a network. A cover whose only exit is another
 * system's success is a cover that can stay up forever, so it also leaves on the clock. Three
 * seconds is past the point where a splash is doing anything for the user: after that they are
 * better served looking at whatever the app managed to render underneath.
 */
export const SPLASH_MAX_MS = 3000

export type SplashState =
    /** Covering the app. */
    | 'visible'
    /** Fading out; still mounted. */
    | 'leaving'
    /** Unmounted. */
    | 'gone'

/**
 * How much longer the cover must stay, or `null` while it must not leave at all.
 *
 * `null` and `0` are different answers and the caller treats them differently — `null` means
 * "no exit is scheduled yet", `0` means "leave on this tick". Collapsing them into a number
 * would make "not yet" indistinguishable from "now".
 */
export function splashHideDelay({
    isBootstrapping,
    elapsedMs,
}: {
    isBootstrapping: boolean
    elapsedMs: number
}): number | null {
    // The ceiling wins over everything, including a bootstrap that never finishes.
    if (elapsedMs >= SPLASH_MAX_MS) return 0
    if (isBootstrapping) return null
    return Math.max(0, SPLASH_MIN_MS - elapsedMs)
}

/**
 * Drive the splash cover's lifecycle from the session bootstrap.
 *
 * ## Once per page load, by construction
 *
 * It reads `isBootstrapping`, which `AuthProvider` raises exactly once — the bootstrap effect is
 * guarded by a ref, and the two paths that re-establish a session later (`auth:session-expired`
 * and the cross-tab `auth:accounts-synced` resync) call `ensureAnonymousSession()` **without**
 * raising the flag again. So an expiring session drops to anonymous in place, as it is meant to,
 * and does not throw a full-screen brand cover over whatever the user was reading.
 *
 * ## Reduced motion skips the fade rather than freezing it
 *
 * With `motion-reduce:animate-none` the exit animation never runs, so `opacity: 0` never
 * applies — a cover that merely had its fade disabled would sit at full opacity for the whole
 * 240ms and then vanish, which is a worse flash than the fade it replaced. The state machine
 * therefore skips `'leaving'` entirely in that case. Same trap `tevi-row-collapse` documents in
 * `globals.css`, handled the same way.
 */
export function useSplashState(): SplashState {
    const isBootstrapping = useAuthStore(s => s.isBootstrapping)
    const [state, setState] = useState<SplashState>('visible')

    // Mount time, not module-load time: the module is evaluated during SSR, where "now" is the
    // server's clock and has nothing to do with when this user's page started.
    const startedAt = useRef<number | null>(null)

    useEffect(() => {
        if (state === 'gone') return
        if (startedAt.current === null) startedAt.current = Date.now()
        const started = startedAt.current

        const reduced =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

        const timers: ReturnType<typeof setTimeout>[] = []
        const leave = () => setState(reduced ? 'gone' : 'leaving')

        if (state === 'leaving') {
            timers.push(setTimeout(() => setState('gone'), SPLASH_FADE_MS))
        } else {
            const delay = splashHideDelay({ isBootstrapping, elapsedMs: Date.now() - started })
            if (delay !== null) timers.push(setTimeout(leave, delay))

            // The ceiling is armed on every pass rather than only on mount, so it survives a
            // re-render that clears the effect's timers. `started` is stable, so re-arming it
            // does not push the deadline out.
            timers.push(setTimeout(leave, Math.max(0, SPLASH_MAX_MS - (Date.now() - started))))
        }

        return () => {
            for (const t of timers) clearTimeout(t)
        }
    }, [isBootstrapping, state])

    return state
}
