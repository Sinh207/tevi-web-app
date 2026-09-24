'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** How long after a charge the card appears. Legacy's `5000` in both places that open it. */
export const PREMIUM_NUDGE_DELAY_MS = 5_000
/** How long it stays before closing itself. Legacy's `useState(10)` countdown, one tick a second. */
export const PREMIUM_NUDGE_SECONDS = 10

/**
 * **When the Premium card opens, and when it closes itself** — legacy's `open.subscribePremium`.
 *
 * Two triggers, both "this reader was just charged Star", and both legacy's:
 *
 * - a **paid chat line** went through — `sideBar/actions`, five seconds after the purchase;
 * - the **sustained fee** was charged — `liveSession/hook`, five seconds after its message.
 *
 * The point is the moment: somebody who has just paid for a message is the reader most likely to
 * want the plan that bundles it. A Premium reader is never shown it.
 *
 * Once open it counts down from ten and closes on its own — legacy's *Close after (10s)* — and the
 * reader can close it sooner. A new charge while it is open does not restart the countdown: the
 * card is already saying what the charge would have made it say.
 *
 * Every timer is cleared on unmount. Legacy's are not, which is a state update on an unmounted tree
 * for anybody who leaves inside the window — the same leak `use-sustained-fee.ts` records.
 */
export function usePremiumNudge({
    chargedAt,
    feeNoticeShown,
    isPremium,
    enabled,
}: {
    /** `useLiveChat().chargedAt` — changes on every successful paid-chat charge. */
    chargedAt: number | null
    /** `useSustainedFee().notice !== null` — rises when the sustained fee was just taken. */
    feeNoticeShown: boolean
    isPremium: boolean
    enabled: boolean
}): { isOpen: boolean; secondsLeft: number; close: () => void } {
    const [isOpen, setIsOpen] = useState(false)
    const [secondsLeft, setSecondsLeft] = useState(PREMIUM_NUDGE_SECONDS)
    const delay = useRef<number | null>(null)

    const schedule = useCallback(() => {
        if (delay.current !== null) window.clearTimeout(delay.current)
        delay.current = window.setTimeout(() => {
            delay.current = null
            setSecondsLeft(PREMIUM_NUDGE_SECONDS)
            setIsOpen(true)
        }, PREMIUM_NUDGE_DELAY_MS)
    }, [])

    const active = enabled && !isPremium

    useEffect(() => {
        if (active && chargedAt !== null) schedule()
    }, [active, chargedAt, schedule])

    useEffect(() => {
        if (active && feeNoticeShown) schedule()
    }, [active, feeNoticeShown, schedule])

    // The countdown, only while open.
    useEffect(() => {
        if (!isOpen) return
        const tick = window.setInterval(() => {
            setSecondsLeft(s => {
                if (s <= 1) {
                    setIsOpen(false)
                    return PREMIUM_NUDGE_SECONDS
                }
                return s - 1
            })
        }, 1000)
        return () => window.clearInterval(tick)
    }, [isOpen])

    // A reader who becomes Premium, or leaves the stream, gets nothing further.
    useEffect(() => {
        if (active) return
        setIsOpen(false)
        if (delay.current !== null) {
            window.clearTimeout(delay.current)
            delay.current = null
        }
    }, [active])

    useEffect(
        () => () => {
            if (delay.current !== null) window.clearTimeout(delay.current)
        },
        [],
    )

    const close = useCallback(() => setIsOpen(false), [])
    return { isOpen: isOpen && active, secondsLeft, close }
}
