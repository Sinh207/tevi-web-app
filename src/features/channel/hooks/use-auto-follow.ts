'use client'

import { accountAutoFollow, useAuth, useRequireAuth } from '@features/auth'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel } from '../api/types'
import { AUTO_FOLLOW_SECONDS, shouldCountDown } from '../lib/auto-follow'
import { useChannelActions } from './use-channel-actions'

/**
 * The countdown behind the auto-follow bar, and the press that ends it either way.
 *
 * ## One clock, three ways to stop it
 *
 * The reader follows manually, the reader skips, or the clock reaches zero and follows for them.
 * `shouldCountDown` decides whether it runs at all (`lib/auto-follow.ts`); this owns the tick and
 * the firing.
 *
 * **An interval, not a chain of `setTimeout`s.** Legacy re-arms a timeout on every state change,
 * which means a re-render of the channel page — a refetch, a hover that changes some other prop —
 * restarts the current second. Ten seconds of *page* time therefore takes longer than ten seconds
 * whenever anything else on the screen moves. One interval, cleared once, counts real seconds.
 *
 * ## It fires once, and the ref is the reason
 *
 * `follow.run` is optimistic (`useChannelActions`), so `channel.is_followed` flips almost
 * immediately and the effect would tear down — but "almost" is doing work in that sentence, and a
 * second tick arriving first would send a second follow. `fired` is checked and set synchronously,
 * so the request cannot leave twice however the re-renders land.
 *
 * ## Signed out is not an error
 *
 * The bar shows to everybody: the prompt is how a guest discovers the space is followable at all.
 * The countdown does not run for them (`shouldCountDown`), and pressing Follow goes through
 * `useRequireAuth` — the login dialog, in place, not a redirect. Legacy does exactly this.
 */
export function useAutoFollow(channel: Channel) {
    const { currentUser, isAuthenticated } = useAuth()
    const requireAuth = useRequireAuth()
    const { follow } = useChannelActions(channel)

    const [remaining, setRemaining] = useState(AUTO_FOLLOW_SECONDS)
    const [skipped, setSkipped] = useState(false)
    const [isVisible, setIsVisible] = useState(true)
    const fired = useRef(false)

    /*
     * Reset when the reader moves to a different space. The bar is rendered by the channel page, so
     * a client-side navigation between two `/@slug` routes keeps this hook mounted and would
     * otherwise carry the previous space's remaining seconds — and its `skipped` — onto the new one.
     */
    // biome-ignore lint/correctness/useExhaustiveDependencies: the slug is the identity being watched
    useEffect(() => {
        setRemaining(AUTO_FOLLOW_SECONDS)
        setSkipped(false)
        fired.current = false
    }, [channel.slug])

    /**
     * An **explicit unfollow ends the automatic half for this visit.**
     *
     * Without this, unfollowing hands the countdown a space that is not followed and not skipped —
     * so it resumes and re-follows ten seconds later, undoing a deliberate press. The reader's own
     * decision has to outrank the preference that would otherwise make it for them.
     *
     * `fired` is cleared at the same time: it means "the countdown has already fired", and after an
     * unfollow it has not fired *for this state*. `skipped` keeps the timer off, so clearing it
     * cannot start one — it only lets the Follow button work again.
     */
    const wasFollowed = useRef(channel.is_followed)
    useEffect(() => {
        if (channel.is_followed) {
            wasFollowed.current = true
            return
        }
        if (!wasFollowed.current) return
        wasFollowed.current = false
        setSkipped(true)
        fired.current = false
    }, [channel.is_followed])

    /** `document.hidden`, so a tab left in the background does not count as "viewed". */
    useEffect(() => {
        const read = () => setIsVisible(!document.hidden)
        read()
        document.addEventListener('visibilitychange', read)
        return () => document.removeEventListener('visibilitychange', read)
    }, [])

    const running = shouldCountDown({
        isAuthenticated,
        autoFollow: accountAutoFollow(currentUser),
        isFollowed: channel.is_followed,
        skipped,
        isVisible,
    })

    useEffect(() => {
        if (!running) return
        const id = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000)
        return () => clearInterval(id)
    }, [running])

    useEffect(() => {
        if (!running || remaining > 0 || fired.current) return
        fired.current = true
        follow.run()
    }, [running, remaining, follow])

    /**
     * The manual press. Guarded by auth, and it **skips first**: whatever happens next, the reader
     * has answered, so the clock must not also fire. Legacy sets the same flag for the same reason.
     */
    const followNow = requireAuth(() => {
        setSkipped(true)
        /*
         * **Not guarded by `fired`.** It was, and that was correct for exactly as long as this page
         * had no way to unfollow: `fired` is reset only on a slug change, so once the bar had fired
         * — by countdown or by press — the button was dead for the rest of the visit.
         *
         * The overflow menu's Unfollow broke that assumption. Unfollow, and the bar comes back with
         * a Follow button that returns immediately and sends no request. Reported as "press Follow,
         * nothing happens", and it is exactly that.
         *
         * What remains is the guard that belongs on a button: not while a call is in flight, and
         * not when the space is already followed.
         */
        if (follow.isPending || channel.is_followed) return
        fired.current = true
        follow.run()
    })

    return {
        /** Seconds left. Only meaningful while `isCountingDown`. */
        remaining,
        isCountingDown: running && remaining > 0,
        skipped,
        isPending: follow.isPending,
        skip: useCallback(() => setSkipped(true), []),
        followNow,
    }
}
