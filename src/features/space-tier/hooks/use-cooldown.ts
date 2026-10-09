'use client'

import { useEffect, useState } from 'react'

/**
 * Milliseconds left until `endsAt`, ticking once a second; `0` once it has passed or when there
 * is nothing to count.
 *
 * `active` is legacy's gate — the countdown only runs while the backend says the tier *cannot*
 * change. Its `can_change` is computed when the GET was answered and goes stale the moment the
 * window closes, which is why the screen trusts `remaining === 0` over it once a countdown was
 * running (legacy's `cooldownEnded`): the button re-enables on time without a reload.
 *
 * The first value is computed during render only on the client after mount — `Date.now()` in the
 * server render would differ from the hydrating one and the label would mismatch.
 */
export function useCooldown(
    endsAt: number | null,
    active: boolean,
): {
    remainingMs: number
    ended: boolean
} {
    const [remainingMs, setRemainingMs] = useState(0)
    const [ended, setEnded] = useState(false)

    useEffect(() => {
        if (!active || endsAt === null) {
            setRemainingMs(0)
            setEnded(false)
            return
        }
        const tick = () => {
            const left = endsAt - Date.now()
            if (left > 0) {
                setRemainingMs(left)
                setEnded(false)
            } else {
                setRemainingMs(0)
                setEnded(true)
            }
        }
        tick()
        const timer = window.setInterval(tick, 1000)
        return () => window.clearInterval(timer)
    }, [active, endsAt])

    return { remainingMs, ended }
}

/** `HH:MM:SS`, hours unbounded — legacy's `formatRemainingHHMMSS`. */
export function formatRemaining(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '00:00:00'
    const total = Math.floor(ms / 1000)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}
