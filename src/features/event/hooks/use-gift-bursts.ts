'use client'

import { useEffect, useRef, useState } from 'react'
import { expireGiftBursts, GIFT_BURST_MS, type GiftBurst, mergeGiftBurst } from '../lib/gift-burst'
import { parseChatLine } from '../lib/live-message'
import type { LiveRoomState } from './use-live-room'

/**
 * **The banners flying across the stage**, driven by the room's own frames.
 *
 * ## It listens to `msg`, and there is no `give_gift` channel to listen to
 *
 * That is worth stating because legacy reads like there is one: its float panel and its SVGA player
 * both subscribe to `event:{code}:give_gift`. Nothing on the wire publishes that name — legacy's
 * **comment list** receives an ordinary `msg` frame, tests `msg === '/give_gift'`, and re-emits it
 * on a local emitter under that name. So the gift animation is a downstream consumer of the chat,
 * and a broadcast whose comment list is unmounted shows no gifts at all.
 *
 * Here the room is the source for both: this hook subscribes to `msg` alongside `useLiveChat` (the
 * transport hands every handler in the set a copy), and neither depends on the other being
 * rendered. Two subscribers, one wire, no local re-broadcast.
 *
 * ## A clock, not a timer per banner
 *
 * Legacy keeps a `setTimeout` per group, clears and re-arms it on every merge, and holds the ids
 * that are mid-exit in a second `Set`. This keeps one interval: every tick asks `expireGiftBursts`
 * what is still alive, and that function returns the **same array** when nothing changed, so a
 * quiet room re-renders nothing. The interval runs only while something is on screen.
 */

/**
 * How often the list is swept.
 *
 * A quarter of the display duration: fine enough that a banner does not visibly overstay, coarse
 * enough that the studio is not doing work ten times a second while a stream is playing.
 */
const SWEEP_MS = GIFT_BURST_MS / 4

export function useGiftBursts({
    room,
    enabled = true,
}: {
    room: LiveRoomState
    /**
     * Whether the stage is showing anything. A reader at a paywall has no banners, and a hook that
     * kept accumulating them would have a queue waiting the moment they got in.
     */
    enabled?: boolean
}): GiftBurst[] {
    const [bursts, setBursts] = useState<GiftBurst[]>([])
    const { isConnected, subscribe } = room

    /*
     * The sweep is armed on *whether the list is empty*, not on the list itself — arming it on the
     * array would tear the interval down and build a new one on every gift, and a new interval
     * starts its countdown from zero. Exactly the bug `use-sustained-fee.ts` documents about
     * legacy's fee clock, in miniature.
     */
    const hasBursts = bursts.length > 0

    useEffect(() => {
        if (!enabled || !isConnected) return

        return subscribe('msg', payload => {
            const line = parseChatLine(payload)
            if (line?.kind !== 'gift') return
            setBursts(prev => mergeGiftBurst(prev, line, Date.now()))
        })
    }, [enabled, isConnected, subscribe])

    useEffect(() => {
        if (!hasBursts) return
        const timer = window.setInterval(() => {
            setBursts(prev => expireGiftBursts(prev, Date.now()))
        }, SWEEP_MS)
        return () => window.clearInterval(timer)
    }, [hasBursts])

    /*
     * Leaving the stage clears the list rather than leaving it to expire. A reader who navigates
     * away and comes back within 2.5s would otherwise be greeted by somebody else's gift from the
     * broadcast they just left.
     */
    const wasEnabled = useRef(enabled)
    useEffect(() => {
        if (wasEnabled.current && !enabled) setBursts([])
        wasEnabled.current = enabled
    }, [enabled])

    return bursts
}
