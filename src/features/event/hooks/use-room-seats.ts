'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { liveApi, liveKeys } from '../api/live-api'
import type { LiveLayout, LivePublisher } from '../api/live-types'

/**
 * **Who is on stage, without watching** — the room's seats for a reader the paywall holds.
 *
 * `core/v4/live/event/{code}/layout/` describes the arrangement and the publishers and plays
 * nothing, so it is **not** a preview: it spends none of the device's three looks. The studio asks
 * it once the paywall is a wall and no preview has brought the seats with it — the looks were all
 * spent, or the preview was refused — so the stage behind the frost can still show the room's
 * people (faces only, see `stillOnly`) rather than the channel art.
 *
 * Shares `liveKeys.room` with the preview and the stream, so when either already holds the room
 * this is a cache hit, not a second request. Never retried: a refusal is an answer, and the art is
 * the fallback.
 */
export function useRoomSeats({ code, enabled }: { code: string | null; enabled: boolean }): {
    layout: LiveLayout | null
    publishers: LivePublisher[]
} {
    const { activeId } = useAuth()
    const active = enabled && Boolean(code)
    const query = useQuery({
        queryKey: liveKeys.room(code ?? '', activeId),
        queryFn: ({ signal }) => liveApi.getRoom({ code: code ?? '', accountId: activeId, signal }),
        enabled: active,
        staleTime: Number.POSITIVE_INFINITY,
        retry: false,
        refetchOnWindowFocus: false,
    })
    return {
        layout: active ? (query.data?.layout ?? null) : null,
        publishers: active ? (query.data?.publishers ?? []) : [],
    }
}
