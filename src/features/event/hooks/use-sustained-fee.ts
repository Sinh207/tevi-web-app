'use client'

import { useAuth } from '@features/auth'
import { useBalance } from '@features/balance'
import { useCountry } from '@shared/lib/geo-provider'
import { resolveSustainedFeeRule, useRemoteConfig } from '@shared/lib/remote-config'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventDetail } from '../api/types'
import { unlockApi } from '../api/unlock-api'
import { type SustainedFee, sustainedFee } from '../lib/sustained-fee'

/**
 * **Charge the sustained fee for as long as the reader is watching.**
 *
 * `lib/sustained-fee.ts` decides *whether and how much*; this is the clock and the charge.
 * Legacy's `useChargeStar`, with three things fixed — the first of which means the fee has
 * probably been charged far less often than intended.
 *
 * ## ⚠ 1. The clock must not restart when the balance crosses the fee
 *
 * Legacy lists `isOutOfStar` (and `handlePurchase`, which closes over it) in the effect that owns
 * the `setInterval`. Crossing the threshold therefore **tears the interval down and builds a new
 * one**, and a new interval starts its countdown from zero. A viewer hovering around the fee —
 * exactly the viewer the out-of-Star dialog exists for — has their five minutes reset every time
 * their balance moves past it, and is never charged at all.
 *
 * Here the interval is armed on the *shape* of the charge (whether there is one, and how often)
 * and the live balance is read from a ref inside the tick. The clock runs on its own schedule,
 * which is the only schedule a recurring charge can have.
 *
 * ## 2. A failed charge is reported
 *
 * Legacy's `catch (e) {}` is empty. A declined charge means the reader keeps watching for free
 * and the streamer is not paid, and nobody on either side is told. Same class of silence as paid
 * chat — see **B109**.
 *
 * ## 3. The notice clears itself without leaking
 *
 * Legacy's two `setTimeout(() => setMsg(''), 10000)` calls are never cleared, so a reader who
 * leaves within ten seconds gets a state update on an unmounted tree.
 *
 * ## What is deliberately *not* fixed
 *
 * ⚠ **Premium is charged.** Legacy calls `handlePurchase` for everybody and only suppresses the
 * "you just paid" notice when `myChannel.is_premium` — so a Premium subscriber pays the sustained
 * fee silently while everybody else is told. That reads like an exemption that was half
 * implemented, but inventing one here would stop money reaching streamers, so it is ported as
 * written and asked about in **B109**.
 */
export interface SustainedFeeState {
    /** The charge that applies, or `null` when none does. */
    charge: SustainedFee | null
    /** The reader cannot afford the next interval. The screen offers them Star. */
    isOutOfStar: boolean
    /**
     * A line for the chat transcript, or `null`.
     *
     * Two of them: the up-front "you will be charged" when the fee is first known, and the
     * "you just paid" after each charge. Both clear after ten seconds, which is legacy's.
     */
    notice: { key: string; fee: number; duration: number } | null
    /** The last charge failed. The reader is still watching and the streamer was not paid. */
    hasFailed: boolean
}

const NOTICE_MS = 10_000

export function useSustainedFee({
    event,
    enabled,
}: {
    event: EventDetail
    /**
     * Only while the reader is actually in the room.
     *
     * The caller gates this: a reader looking at a paywall is not watching anything, and a clock
     * running behind a refusal would bill them for it.
     */
    enabled: boolean
}): SustainedFeeState {
    const { activeId } = useAuth()
    const { star } = useBalance()
    const { country } = useCountry()
    const remote = useRemoteConfig()

    const rule = resolveSustainedFeeRule(remote.event, country)
    const charge = enabled ? sustainedFee(event, rule) : null

    const [notice, setNotice] = useState<SustainedFeeState['notice']>(null)
    const [hasFailed, setHasFailed] = useState(false)
    const [isOutOfStar, setIsOutOfStar] = useState(false)
    /** The clock's own collection, so a top-up can run it once — see the effect at the foot. */
    const collectRef = useRef<((force?: boolean) => void) | null>(null)

    /*
     * The live balance, and the reason it is a ref rather than a dependency: see note 1. The tick
     * needs today's figure, but wanting it must not restart the clock.
     */
    const starRef = useRef(star)
    starRef.current = star

    const code = event.code
    const channelId = event.channel?.id ?? null
    const fee = charge?.fee ?? null
    const durationMinutes = charge?.durationMinutes ?? null

    /*
     * Cleared on unmount and before each replacement, which legacy does for neither — a reader
     * who leaves inside ten seconds gets a state update on a dead tree.
     */
    const noticeTimer = useRef<number | null>(null)
    const showNotice = useCallback((next: NonNullable<SustainedFeeState['notice']>) => {
        if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
        setNotice(next)
        noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
    }, [])

    useEffect(
        () => () => {
            if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
        },
        [],
    )

    /** The up-front warning, once the fee is known. */
    useEffect(() => {
        if (fee === null || durationMinutes === null) return
        showNotice({ key: 'event_studio_fee_intro', fee, duration: durationMinutes })
    }, [fee, durationMinutes, showNotice])

    useEffect(() => {
        if (fee === null || durationMinutes === null || !code) return

        /*
         * Armed on the **shape** of the charge only — `fee`, `durationMinutes`, the event and the
         * account. Not on the balance, and not on a callback that closes over it. See note 1: any
         * dependency that moves with the balance restarts the clock, and a clock that restarts is
         * a fee that is never collected.
         */
        /*
         * One collection, callable from the clock and from the top-up below. `force` skips the
         * balance check, for the one caller that has just read a balance fresher than the ref.
         */
        const collect = (force = false) => {
            if (!force && starRef.current < fee) {
                setIsOutOfStar(true)
                return
            }
            setIsOutOfStar(false)
            unlockApi
                .purchaseSustainedFee({ eventCode: code, channelId, fee, accountId: activeId })
                .then(() => {
                    setHasFailed(false)
                    showNotice({
                        key: 'event_studio_fee_charged',
                        fee,
                        duration: durationMinutes,
                    })
                })
                .catch(() => {
                    // The reader is still watching and the streamer was not paid. Legacy's
                    // `catch (e) {}` tells neither of them.
                    setHasFailed(true)
                })
        }
        collectRef.current = collect

        const interval = window.setInterval(() => collect(), durationMinutes * 60 * 1000)

        return () => {
            window.clearInterval(interval)
            collectRef.current = null
        }
    }, [fee, durationMinutes, code, channelId, activeId, showNotice])

    /*
     * Topping up clears the block. Reading the balance here rather than inside the tick is safe
     * — this effect owns no timer, so re-running it costs nothing.
     */
    useEffect(() => {
        if (!isOutOfStar || fee === null || star < fee) return
        /*
         * ⚠ **Collect the period that was missed, then carry on** — legacy's "when a user tops up
         * stars while the popup is open, charge and hide the popup". Only clearing the flag (what
         * this did) let a reader who ran dry watch until the *next* tick for free: the period the
         * block interrupted was never billed. `force`, because the ref the clock reads may not have
         * caught up with the balance this effect just saw.
         */
        collectRef.current?.(true)
    }, [isOutOfStar, star, fee])

    return { charge, isOutOfStar, notice, hasFailed }
}
