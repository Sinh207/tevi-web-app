'use client'

import { useMayAnimate } from '@shared/hooks/use-may-animate'
import { useCallback, useEffect, useId, useSyncExternalStore } from 'react'
import {
    type AutoplayCandidate,
    connectionAllowsAutoplay,
    type NetworkInformationLike,
    pickAutoplayTarget,
} from '../lib/video-autoplay'

/**
 * Which clip in a feed is playing — **one**, chosen by where the reader is looking.
 *
 * iOS's arrangement (`PostListingViewController`), and the reason the state is a module-level
 * registry rather than something each tile holds: the decision is about the *list*, not about any
 * one row. A tile cannot know it should stop, because what stopped it is another tile starting.
 * iOS owns exactly this in `focusingPostVideoView`, swapped by `replaceFocusPostVideoView`.
 *
 * It is also what keeps the cost bounded, which is the objection `PostVideoTile` has carried since
 * it was written: a feed that mounts one `<video>` per card pays a decode and a connection for
 * each, and past the third or fourth a phone browser refuses. One focused clip is one element
 * whatever the feed's length — so autoplay arrives without the problem that kept it out.
 *
 * `useSyncExternalStore` over a plain `Map` rather than Zustand: every tile subscribing to one
 * store would re-render every tile on each focus change, where here a tile reads only
 * `focused === myId` and a scroll re-renders the two that actually changed.
 */

const registry = new Map<string, HTMLElement>()
const listeners = new Set<() => void>()
let focused: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let lastRun = 0
let watching = 0

/** iOS's `autoPlayThrottleInterval` — 500ms, about two evaluations a second. */
const THROTTLE_MS = 500

function setFocused(next: string | null) {
    if (focused === next) return
    focused = next
    for (const listener of listeners) listener()
}

/**
 * Choose the clip under the viewport's thirds — one `getBoundingClientRect` per registered tile,
 * which is why this is throttled rather than run on every scroll event.
 */
function evaluate() {
    const candidates: AutoplayCandidate[] = []
    for (const [id, element] of registry) {
        const box = element.getBoundingClientRect()
        candidates.push({ id, top: box.top, bottom: box.bottom })
    }
    setFocused(pickAutoplayTarget(candidates, window.innerHeight))
}

/**
 * Throttle with a **trailing** call, which is iOS's own shape and not an embellishment: without the
 * trailing run the last evaluation lands mid-flick, and the clip left playing is not the one that
 * ends up on screen.
 */
function schedule() {
    const now = Date.now()
    const elapsed = now - lastRun
    if (timer !== null) clearTimeout(timer)

    if (elapsed >= THROTTLE_MS) {
        lastRun = now
        timer = null
        evaluate()
        return
    }
    timer = setTimeout(() => {
        lastRun = Date.now()
        timer = null
        evaluate()
    }, THROTTLE_MS - elapsed)
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

function connectionOf(): NetworkInformationLike | null {
    if (typeof navigator === 'undefined') return null
    return (navigator as Navigator & { connection?: NetworkInformationLike }).connection ?? null
}

function subscribeConnection(listener: () => void) {
    const connection = connectionOf() as (NetworkInformationLike & Partial<EventTarget>) | null
    if (!connection?.addEventListener) return () => {}
    connection.addEventListener('change', listener)
    return () => connection.removeEventListener?.('change', listener)
}

/**
 * One tile's half of the arrangement: register the box, learn whether it is the focused one.
 *
 * `eligible` is the caller's answer to *could this clip play at all* (`mayAutoplay` — duration,
 * lock, NSFW). This adds the two answers that are about the **reader** rather than the post:
 *
 * - `useMayAnimate` — `prefers-reduced-motion` and `saveData`. Somebody who has asked for less
 *   motion has asked once, and a feed that stills their avatars and then plays video at them has
 *   only half-listened.
 * - the connection's veto (`connectionAllowsAutoplay`), which is as near as a browser gets to
 *   iOS's Wi-Fi-only rule. `video-autoplay.ts` has the long form of why it is a veto and not a
 *   requirement.
 */
export function useVideoAutoplay(eligible: boolean) {
    /*
     * ⚠ The key is **per mounted tile**, not per post — `useId`, not `post.id`.
     *
     * Keying on the post was the first version and it mounted **two** `<video>` elements, measured:
     * the same post can be on screen twice (two lists, a list and a quote, the `/dev/post` harness
     * drawing one fixture in several sections), and both tiles then answered to the same key — the
     * second overwrote the first in the registry and both read `focused === theirId` as true. The
     * registry is about elements on a page, so its key has to be one too. Same class of mistake
     * `docs/TEST_IDS.md` bans for ids, and for the same reason.
     */
    const id = useId()
    const mayAnimate = useMayAnimate()
    const connectionAllows = useSyncExternalStore(
        subscribeConnection,
        () => connectionAllowsAutoplay(connectionOf()),
        /*
         * `true` on the server. Starting at `false` would render a still for every eligible clip
         * and then swap a player into each on hydration; the client corrects this in the tick where
         * it disagrees, and only for the one tile that is focused.
         */
        () => true,
    )
    const active = eligible && mayAnimate && connectionAllows

    const isFocused = useSyncExternalStore(
        subscribe,
        () => focused === id,
        () => false,
    )

    /* The shared scroll listener, reference-counted so a feed of fifty tiles installs one. */
    useEffect(() => {
        if (!active) return
        watching += 1
        if (watching === 1) {
            // `capture`, so a clip inside a scrolling panel is evaluated too — the post detail page
            // scrolls inside itself from `md` up and its scroll never reaches `window`.
            window.addEventListener('scroll', schedule, { passive: true, capture: true })
            window.addEventListener('resize', schedule, { passive: true })
        }
        schedule()
        return () => {
            watching -= 1
            if (watching > 0) return
            window.removeEventListener('scroll', schedule, { capture: true })
            window.removeEventListener('resize', schedule)
            if (timer !== null) clearTimeout(timer)
            timer = null
            setFocused(null)
        }
    }, [active])

    const register = useCallback(
        (element: HTMLElement | null) => {
            if (!active || element === null) {
                registry.delete(id)
                if (focused === id) setFocused(null)
                return
            }
            registry.set(id, element)
            schedule()
        },
        [id, active],
    )

    return { isPlaying: active && isFocused, register }
}
