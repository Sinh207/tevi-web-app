import type { WatchState } from './watch-state'

/**
 * **Where a reader outside an exclusive stream's gate stands** — the one state the studio's
 * exclusive layout is drawn from.
 *
 * The studio draws an exclusive stream with the **same layout as the session**: the stage, the chat
 * column, the gift tray. What differs is that the stage plays the ten-second preview (or nothing),
 * the room is never joined, and every action that would need access opens the paywall instead.
 * Four phases, and the order of the checks below is the rule:
 *
 * | phase | stage | paywall |
 * |---|---|---|
 * | `loading` | the channel art | — |
 * | `preview` | the blurred sample, counting down | on an action, dismissable |
 * | `closed` | the channel art, frosted | always, not dismissable |
 *
 * `null` means the exclusive layout does not apply: the reader can watch (`watchable` and signed
 * in), or is held by a refusal of another kind — off air, removed — which has its own panel.
 *
 * ## A guest gets it on **any** live stream
 *
 * Legacy's `(isExclusive || !isAuthenticated) → <LivePreview/>`: a reader who has not signed in is
 * shown the preview of a free broadcast too, and asked to sign in when it ends. So a guest is in
 * this layout whether the stream is `locked` or `watchable`, and the paywall card is *Sign in*.
 * While the session is still being established (`isResolving`) nothing is asked for and the phase
 * is `loading` — a preview requested under the anonymous session of a reader about to be restored
 * as signed in would spend one of their three looks on the wrong account.
 *
 * ## `closed` wins over everything that could still play
 *
 * - **Exhausted** — the device has had its three looks at this event; nothing is requested.
 * - **Complete** — the ten seconds ran out.
 * - **Refused** — the request came back without a stream (a 4xx, a failure, an empty answer). A
 *   paywall over the art is the honest remaining answer.
 * - **Anything else not loading and not playing** — e.g. a stream with nobody on camera yet. A
 *   spinner that never resolves is not an answer.
 *
 * A stream **locked mid-watch** is `closed` at once: no preview (it would spend one of the device's
 * three looks on a stream the reader was just watching). The studio keeps the room's seats on
 * stage, frozen with camera and microphone off, under the wall.
 *
 * Pure, so the precedence is pinned by a test rather than by the order of JSX branches.
 */
export type ExclusivePhase = 'loading' | 'preview' | 'closed'

export interface ExclusivePreviewInput {
    isLoading: boolean
    isPlaying: boolean
    isComplete: boolean
    isExhausted: boolean
    isRefused: boolean
}

export function exclusivePhase({
    state,
    isGuest,
    isResolving,
    isKickedOut,
    isLockedByRoom = false,
    preview,
}: {
    state: WatchState['kind']
    /** Not signed in — the anonymous session every visitor carries. */
    isGuest: boolean
    /** The session is still bootstrapping, so `isGuest` is not known yet. */
    isResolving: boolean
    isKickedOut: boolean
    /** Locked mid-watch — no preview is offered; the frozen room stands under the wall. */
    isLockedByRoom?: boolean
    preview: ExclusivePreviewInput
}): ExclusivePhase | null {
    if (isKickedOut) return null
    if (state !== 'locked' && !(state === 'watchable' && isGuest)) return null
    if (isResolving) return 'loading'
    if (isLockedByRoom || preview.isExhausted || preview.isComplete || preview.isRefused) {
        return 'closed'
    }
    if (preview.isPlaying) return 'preview'
    if (preview.isLoading) return 'loading'
    return 'closed'
}
