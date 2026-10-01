import type { Post } from '../api/types'
import { isLocked, isNsfw } from './post-access'
import { videoSrc } from './post-media'

/**
 * iOS's autoplay policy for a clip in a feed, as the parts a browser can actually honour.
 *
 * ## What iOS does (`PostListingViewController`, `PostVideoView`, `AppVariable`)
 *
 * - `scrollViewDidScroll` → `throttledHandleAutoPlayVideo()`, **throttled to 500ms** with a trailing
 *   call so the final scroll position is still evaluated.
 * - The focused cell is the one under the viewport's **1/3** mark, falling back to **2/3**.
 * - **One at a time**: the previous view is stopped the moment focus moves.
 * - `duration > 0 && duration <= 60`; anything longer just shows its play button.
 * - Never behind the NSFW cover (`prepareAutoPlay` checks `isHiddenNSFW`).
 * - Always muted (`lazy var isMuted = true`).
 * - And the gate over all of it: `isEnabledPostAutoPlayVideo = internet_type == "WIFI"`.
 *
 * ## ⚠ The Wi-Fi gate cannot be ported, and this is the nearest honest thing
 *
 * No browser reports Wi-Fi reliably. `navigator.connection.type` exists on Chromium only, and in
 * practice is populated on Android; Safari and Firefox ship no `navigator.connection` at all, so
 * on roughly half of real traffic the question has **no answer** rather than a cheap one.
 *
 * So the gate is inverted: instead of "only on Wi-Fi", this is "**not** when the reader or the
 * connection has said no". `saveData`, an explicitly cellular connection, and a 2g-class link each
 * veto it; silence does not. Defaulting silence to "no autoplay" would mean the policy applied to
 * Chrome users and not Safari users, which is a worse rule than either answer — the same reasoning
 * `use-may-animate.ts` already writes down for `saveData`, and this reuses that hook rather than
 * asking the question twice.
 *
 * That is a **deliberate divergence**, not a port: on an Android phone with mobile data this
 * behaves like iOS, and on an iPhone's Safari it autoplays where the native app would not.
 */

/** iOS's own ceiling — `duration <= 60`. Legacy web's is 180, and iOS is the stricter reference. */
export const AUTOPLAY_MAX_SECONDS = 60

/**
 * Whether this post's clip is eligible at all, before anything about where it is on screen.
 *
 * Locked and NSFW are both refusals rather than oversights: a paywalled post has no clip to play
 * (its payload carries a cover, not a source), and a post behind the sensitive-content cover must
 * not start moving underneath it — which is iOS's `isHiddenNSFW` check, read from the other side.
 */
export function mayAutoplay(post: Post): boolean {
    if (!videoSrc(post.video)) return false
    if (isLocked(post) || isNsfw(post)) return false
    const seconds = post.video?.duration_seconds ?? 0
    return seconds > 0 && seconds <= AUTOPLAY_MAX_SECONDS
}

/** The shape of `navigator.connection`, which no lib.dom in this repo's TS version declares. */
export interface NetworkInformationLike {
    saveData?: boolean
    type?: string
    effectiveType?: string
}

/**
 * Whether the connection vetoes autoplay. **Silence is not a veto** — see the header.
 *
 * `type === 'cellular'` is the closest thing to iOS's rule that a browser offers, and where it is
 * reported it is exactly the case iOS is protecting: a reader paying for the bytes.
 */
export function connectionAllowsAutoplay(connection: NetworkInformationLike | null): boolean {
    if (!connection) return true
    if (connection.saveData === true) return false
    if (connection.type === 'cellular') return false
    return connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g'
}

/** A candidate tile, as the picker needs it: where it is, and whether it could play. */
export interface AutoplayCandidate {
    id: string
    top: number
    bottom: number
}

/**
 * iOS's two-checkpoint rule, verbatim: the tile straddling **1/3** of the viewport wins, and
 * failing that the one straddling **2/3**.
 *
 * Not "the most visible tile", which is the obvious alternative and a different behaviour: at the
 * top of a feed the most-visible clip can be one the reader has already scrolled past the start of.
 * Two fixed lines mean the clip that plays is the one roughly under the eye, and the fallback is
 * what keeps a tall clip between the two marks from leaving the feed silent.
 *
 * Returns `null` when neither mark lands on a candidate, which is iOS's `replaceFocusPostVideoView(nil)`
 * — the playing clip stops and nothing takes its place.
 */
export function pickAutoplayTarget(
    candidates: readonly AutoplayCandidate[],
    viewportHeight: number,
): string | null {
    const first = viewportHeight / 3
    const second = (viewportHeight * 2) / 3

    let fallback: string | null = null
    for (const candidate of candidates) {
        if (first >= candidate.top && first < candidate.bottom) return candidate.id
        if (fallback === null && second >= candidate.top && second < candidate.bottom) {
            fallback = candidate.id
        }
    }
    return fallback
}
