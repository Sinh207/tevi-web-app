'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { liveApi, liveKeys } from '../api/live-api'
import type { LiveLayout, LivePlayback, LivePublisher } from '../api/live-types'

/**
 * **The real stream**, for a reader who is allowed to watch it.
 *
 * The counterpart to `useLivePreview`, and the differences are the whole reason it is a separate
 * hook rather than a mode flag:
 *
 * | | preview | stream |
 * |---|---|---|
 * | endpoint | `live/v1/streaming-events/{code}/preview/` | `core/v4/live/event/{code}/playback/` |
 * | quota | 3 per device per event | none |
 * | countdown | 10 seconds | none |
 * | blur | 4px, from `is_preview` | none |
 *
 * Folding them would put a quota counter and a countdown in the path of somebody who has already
 * paid, behind two flags that must both be off — and the failure mode of getting that wrong is
 * cutting a paying viewer off after ten seconds.
 *
 * ## Both requests are in series, for a different reason than the preview's
 *
 * There the order protects the quota. Here it is simply that a layout is meaningless without a
 * stream to lay out, and asking for one on a refused playback is a request made on behalf of
 * somebody who is being told no.
 */
export interface LiveStreamState {
    isLoading: boolean
    playback: LivePlayback | null
    layout: LiveLayout | null
    publishers: LivePublisher[]
    /** There is something on screen. The caller uses this to open the room and the chat. */
    isPlaying: boolean
    /** The playback request failed or was refused — the stage falls back to the app hand-off. */
    hasFailed: boolean
}

export function useLiveStream({
    code,
    enabled = true,
}: {
    code: string | null
    enabled?: boolean
}): LiveStreamState {
    const { activeId } = useAuth()
    const active = enabled && Boolean(code)

    const playbackQuery = useQuery({
        queryKey: liveKeys.playback(code ?? '', activeId),
        queryFn: ({ signal }) =>
            liveApi.getPlayback({ code: code ?? '', accountId: activeId, signal }),
        enabled: active,
        /*
         * ⚠ **Never cached beyond the tab, and never retried on a schedule.**
         *
         * `viewer_token` is a short-lived join credential and the playlist URLs are signed, so
         * `live-api.ts` forbids the disk tier. `staleTime: 0` here is the other half: a reader
         * who comes back to a broadcast after an hour must be handed a fresh token rather than
         * one the gateway will refuse, which presents as a player that simply never starts.
         */
        staleTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
    })

    const playback = playbackQuery.data ?? null

    const roomQuery = useQuery({
        queryKey: liveKeys.room(code ?? '', activeId),
        queryFn: ({ signal }) => liveApi.getRoom({ code: code ?? '', accountId: activeId, signal }),
        enabled: active && playback !== null,
        staleTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
    })

    const layout = roomQuery.data?.layout ?? null
    const publishers = roomQuery.data?.publishers ?? []

    return {
        isLoading:
            active && (playbackQuery.isLoading || (playback !== null && roomQuery.isLoading)),
        playback,
        layout,
        publishers,
        isPlaying: playback !== null && publishers.length > 0,
        /*
         * A refused playback is a real state — the backend saying this reader may not have the
         * stream, for a reason the event payload did not carry. The stage shows the app hand-off
         * rather than a spinner that never resolves.
         */
        hasFailed:
            playbackQuery.isError || (playback === null && !playbackQuery.isLoading && active),
    }
}
