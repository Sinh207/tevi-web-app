import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type LiveTopStar, parseTopStars } from '../lib/live-message'

/**
 * **The live room's two analytics reads** — the gift leaderboard and each co-host's gift total.
 *
 * ⚠ **Both have an HTTP source, and this port ran for a while as though neither did.** The room
 * pushes `top_stars` over the socket, so the leaderboard was built on the frame alone — and a room
 * where nobody has sent a gift never pushes one, which left the column on skeleton rows for the
 * whole broadcast. Legacy reads the board over HTTP on entry (`models/analytics.js`, fired from
 * `liveSession/hook` once `playback` has landed) and treats the socket as an *update*. The seat
 * tiles' gift score was the same story one level down: wired, always zero, and described in this
 * repo as having "no producer" when the producer is simply `multi-guests/{code}/gifted/`.
 *
 * No schema is published for the analytics service (`/analytics/docs/schema/` 404s), so the
 * shapes are legacy's reads: the board is the same array the `top_stars` frame carries, and the
 * gifted list is `{ user: { id }, score }` rows.
 *
 * Memory-only, the default. Neither is account-scoped in *content* — every viewer of a broadcast
 * sees the same board — but both change every few seconds of a live room, so a disk copy would be
 * a stale leaderboard served to the next visit. See `interceptors/etag.ts` on `persist`.
 */
const analytics = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/analytics` })

export const liveAnalyticsKeys = {
    all: ['event', 'live-analytics'] as const,
    topStars: (code: string) => [...liveAnalyticsKeys.all, 'top-stars', code] as const,
    gifted: (code: string) => [...liveAnalyticsKeys.all, 'gifted', code] as const,
}

/**
 * The gifted list, keyed by user id.
 *
 * Rows without an id are dropped rather than keyed on `undefined`: legacy's `findIndex` matches
 * `item.user?.id === publisher?.id`, so a row with no user would match a seat with no publisher id,
 * and that seat would show somebody else's total.
 */
export function parseGiftedScores(payload: unknown): Map<string, number> {
    const rows = (payload as { data?: unknown } | null)?.data ?? payload
    const scores = new Map<string, number>()
    if (!Array.isArray(rows)) return scores
    for (const row of rows) {
        const id = (row as { user?: { id?: unknown } } | null)?.user?.id
        const score = Number((row as { score?: unknown } | null)?.score)
        if (id == null || id === '') continue
        scores.set(String(id), Number.isFinite(score) ? score : 0)
    }
    return scores
}

export const liveAnalyticsApi = {
    /** The leaderboard at the moment of entry. The socket keeps it current from there. */
    async getTopStars({
        code,
        signal,
    }: {
        code: string
        signal?: AbortSignal
    }): Promise<LiveTopStar[]> {
        const body = await analytics.get<unknown>(
            `v2/top-stars/${encodeURIComponent(code)}/`,
            undefined,
            { signal },
        )
        return parseTopStars(body)
    },

    /** Each co-host's gift total in a multi-guest room, for the score chip on their tile. */
    async getGiftedScores({
        code,
        signal,
    }: {
        code: string
        signal?: AbortSignal
    }): Promise<Map<string, number>> {
        const body = await analytics.get<unknown>(
            `v2/multi-guests/${encodeURIComponent(code)}/gifted/`,
            undefined,
            { signal },
        )
        return parseGiftedScores(body)
    },
}
