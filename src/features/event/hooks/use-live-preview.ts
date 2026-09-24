'use client'

import { useAuth } from '@features/auth'
import { isPreviewExhausted, spendPreview } from '@shared/lib/preview-quota'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { liveApi, liveKeys } from '../api/live-api'
import type { LiveLayout, LivePlayback, LivePublisher } from '../api/live-types'

/**
 * How long the free look lasts. Legacy's `useState(10)` counting down once a second.
 *
 * Ten seconds is short enough to be an advertisement and long enough to see who is on camera and
 * what they are doing — which is the entire product argument for the preview existing.
 */
export const PREVIEW_SECONDS = 10

export interface LivePreviewState {
    /** Still fetching. The stage shows the blurred channel art rather than an empty frame. */
    isLoading: boolean
    /** The stream to play, or `null` — see `liveTransport` for which of its halves to use. */
    playback: LivePlayback | null
    layout: LiveLayout | null
    publishers: LivePublisher[]
    /** Seconds left, counting down from `PREVIEW_SECONDS`. `0` once it has run out. */
    secondsLeft: number
    /** The countdown has finished. The reader saw their preview; now they are asked to pay. */
    isComplete: boolean
    /** This **device** has spent all three of its looks at this event. */
    isExhausted: boolean
    /** Anything is on screen right now — the one flag the stage needs to decide what to draw. */
    isPlaying: boolean
}

/**
 * **The free ten-second look at a paid stream** — legacy's `livePreview/hook`.
 *
 * ```
 * quota left?  ─no→  isExhausted, nothing requested
 *      │yes
 *      ↓
 * GET live/v1/streaming-events/{code}/preview/   → playback  (and one preview is spent)
 *      ↓
 * GET core/v4/live/event/{code}/layout/          → layout + publishers
 *      ↓
 * 10 … 1, 0 → isComplete
 * ```
 *
 * ## The quota is checked before the request and spent on its success
 *
 * Both halves, and they are different guards. The **check** is what stops a fourth attempt costing
 * a round trip and a backend-side count for a preview the reader was never going to get. The
 * **spend** is on success, matching legacy, because a request that failed at the network is not a
 * preview anybody watched — charging for it locally would take a look away that the backend never
 * counted.
 *
 * ⚠ What makes that safe is the query options rather than the ordering. `staleTime: Infinity`,
 * `retry: false`, `refetchOnMount: false` and `refetchOnWindowFocus: false` together are what stop
 * a tab switch, a transient 502 or React's strict-mode double-mount from each spending a look. A
 * retry here is not a free retry: the backend counts the call. Do not relax any of the four.
 *
 * ## Two requests, in series, and the second is not optional
 *
 * The preview payload says *how* to play; the layout payload says *who is on camera*. Legacy waits
 * for the first before asking for the second, and keeping that order matters for the quota rather
 * than for correctness: firing both at once means a reader whose preview is refused has still
 * fetched a layout, and a reader whose quota is spent has made two calls instead of none.
 *
 * ## The countdown starts when there is something to watch
 *
 * Not on mount. A reader on a slow connection whose stream takes four seconds to arrive must get
 * ten seconds of stream, not six — legacy gates its interval on `layout && publishers.length`, and
 * this waits for the same thing. The other direction is worse than it sounds: a preview that
 * finishes counting before the first frame renders shows the paywall over a stream the reader
 * never saw.
 */
export function useLivePreview({
    code,
    enabled = true,
}: {
    code: string | null
    /**
     * Off unless the stage actually wants a preview.
     *
     * The caller decides — a reader who can already watch has no use for one, and a request made
     * on their behalf would spend a look they did not need. `EventStudioScreen` gates it on the
     * watch state.
     */
    enabled?: boolean
}): LivePreviewState {
    const { activeId } = useAuth()

    /*
     * Read once per mount rather than on every render. `isPreviewExhausted` touches
     * `localStorage`, and — more importantly — `spendPreview` below changes the answer: reading it
     * live would flip `isExhausted` true the instant the third look *started*, hiding the preview
     * the reader had just been granted.
     */
    const [exhaustedAtMount] = useState(() => (code ? isPreviewExhausted(code) : true))
    const [secondsLeft, setSecondsLeft] = useState(PREVIEW_SECONDS)

    const active = enabled && Boolean(code) && !exhaustedAtMount

    const previewQuery = useQuery({
        queryKey: liveKeys.preview(code ?? '', activeId),
        queryFn: async ({ signal }) => {
            const playback = await liveApi.getPreview({
                code: code ?? '',
                accountId: activeId,
                signal,
            })
            // On success only — see the note above on why this is not before the call.
            if (code) spendPreview(code)
            return playback
        },
        enabled: active,
        // The four that keep one preview from becoming four. Read the ⚠ above before changing any.
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    })

    const playback = previewQuery.data ?? null

    const roomQuery = useQuery({
        queryKey: liveKeys.room(code ?? '', activeId),
        queryFn: ({ signal }) => liveApi.getRoom({ code: code ?? '', accountId: activeId, signal }),
        // In series: no layout is fetched for a preview that was refused or never asked for.
        enabled: active && playback !== null,
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
        refetchOnWindowFocus: false,
    })

    const layout = roomQuery.data?.layout ?? null
    const publishers = roomQuery.data?.publishers ?? []
    const ready = playback !== null && publishers.length > 0

    /*
     * ⚠ **One interval, armed once — not a `setTimeout` that reschedules itself from state.**
     *
     * The chained-timeout shape looks equivalent and drifts: each tick has to wait for a render
     * before the next is armed, so every slow frame stretches the second. Over ten of them a
     * "ten-second" preview is reliably longer than ten seconds, and on a loaded page noticeably so
     * — which is free stream the creator did not agree to give away.
     *
     * `running` is the dependency rather than `secondsLeft`, so the interval is created once when
     * the stream arrives and cleared once when the count reaches zero. Depending on the count
     * instead would tear down and recreate the timer on every tick, which is the same drift by
     * another route. Legacy uses an interval too, for whatever reason; this one states it.
     */
    const running = ready && secondsLeft > 0
    useEffect(() => {
        if (!running) return
        const timer = window.setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
        return () => window.clearInterval(timer)
    }, [running])

    const isComplete = ready && secondsLeft <= 0

    return {
        isLoading: active && (previewQuery.isLoading || (playback !== null && roomQuery.isLoading)),
        playback,
        layout,
        publishers,
        secondsLeft,
        isComplete,
        isExhausted: exhaustedAtMount,
        isPlaying: ready && !isComplete,
    }
}
