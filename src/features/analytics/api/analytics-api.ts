import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import type { DateRange } from '../lib/periods'
import {
    type ChannelStatMetric,
    type MetricOption,
    normalizeChannelStats,
    normalizeMetricOptions,
    normalizeTopEarning,
    type TopEarningItem,
} from './types'

/**
 * The **report** service: `${W_API}/report`.
 *
 * ⚠ Not `/analytics`, despite this feature's name and despite legacy's file being called
 * `models/analyticsReport.js`. That file is built on `models/apiReport.js`, which is
 * `${W_API_DOMAIN}/report` — the `/analytics` service is where the *public* channel stats block
 * lives (`features/channel/api/channel-stats-api.ts`). The two are different microservices and
 * landing on the wrong one 404s. `features/earnings` makes the same note about the same pair.
 *
 * **The channel is derived from the bearer, never passed.** There is no `channel_id` or slug on any
 * of these requests — the dashboard is whoever the token says you are. Two consequences the screen
 * has to handle, and they are the same two the earnings report handles:
 *
 * 1. Every request must **pin the account** (`accountId`), or a multi-account reader gets whichever
 *    bearer happened to be active when the request went out, filed under the key of the one they
 *    were looking at.
 * 2. There is no URL to check against — unlike `/@{slug}/earnings-report`, this screen has no slug
 *    in its path, so there is no "is this your dashboard?" comparison to make. Being signed in *is*
 *    the whole gate.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/report` })

/**
 * Query keys.
 *
 * Account-scoped, per the note above: this is one account's revenue and the switcher is two taps
 * from every screen.
 *
 * **The range and the bucket size are in the key**, unlike `earningsKeys.daily` — and the difference
 * is not an inconsistency. The earnings report's bound is `Date.now()`, so keying on it would make
 * every render a cache miss. Here the range is *chosen by the reader* and stays put until they
 * choose another one, so it is genuine identity: going 30d → 7d → 30d serves the first answer from
 * cache instead of asking again, and that is most of what makes the period control feel instant.
 *
 * `metrics` (what is available) is **not** account-scoped-by-range and is separate from
 * `userMetrics` (what this account picked), because only the second one changes when a slot is
 * swapped — so the swap invalidates one key, not the catalogue.
 */
export const analyticsKeys = {
    all: ['analytics'] as const,
    stats: (accountId: string | null, range: DateRange, hourInterval: number) =>
        [
            'analytics',
            'stats',
            accountId ?? 'anon',
            range.startMs,
            range.endMs,
            hourInterval,
        ] as const,
    topEarning: (accountId: string | null, range: DateRange) =>
        ['analytics', 'top-earning', accountId ?? 'anon', range.startMs, range.endMs] as const,
    metricCatalogue: (accountId: string | null) =>
        ['analytics', 'metric-catalogue', accountId ?? 'anon'] as const,
    userMetrics: (accountId: string | null) =>
        ['analytics', 'user-metrics', accountId ?? 'anon'] as const,
}

interface Scoped {
    accountId?: string | null
    signal?: AbortSignal
}

/** `accountId` reaches the client as request config; omitted entirely when there is none. */
function scope({ accountId, signal }: Scoped) {
    return { signal, ...(accountId ? { accountId } : {}) }
}

export const analyticsApi = {
    /**
     * The selected metrics, each with its series and its comparison.
     *
     * `hour_interval` is sent rather than left to the endpoint's default because the client is the
     * one that knows how wide the plot is: 90 days of daily buckets is 90 points in ~300px. See
     * `hourIntervalFor`.
     */
    async getChannelStats({
        range,
        hourInterval,
        ...rest
    }: Scoped & { range: DateRange; hourInterval: number }): Promise<ChannelStatMetric[]> {
        const body = await api.get<unknown>(
            'v1/channel/stats/',
            { from_date_ts: range.startMs, to_date_ts: range.endMs, hour_interval: hourInterval },
            scope(rest),
        )
        return normalizeChannelStats(body)
    },

    /** The period's best-earning content. Same range, no bucket size — it is a list, not a series. */
    async getTopEarningContent({
        range,
        ...rest
    }: Scoped & { range: DateRange }): Promise<TopEarningItem[]> {
        const body = await api.get<unknown>(
            'v1/channel/top-earning-content/',
            { from_date_ts: range.startMs, to_date_ts: range.endMs },
            scope(rest),
        )
        return normalizeTopEarning(body)
    },

    /** Every metric the backoffice offers — the swap menu's contents. */
    async getMetricCatalogue(rest: Scoped = {}): Promise<MetricOption[]> {
        const body = await api.get<unknown>('v1/config/metrics/', undefined, {
            ...scope(rest),
            // The menu of metrics the backoffice offers — not this channel's figures.
            cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day },
        })
        return normalizeMetricOptions(body)
    },

    /**
     * The metrics this account has chosen, in slot order.
     *
     * Read for one reason only: to take the already-chosen ones *out* of the swap menu, so a slot
     * cannot be set to a metric another slot is already showing. The tabs themselves come from
     * `getChannelStats`, which is the payload that has the figures.
     */
    async getUserMetrics(rest: Scoped = {}): Promise<MetricOption[]> {
        const body = await api.get<unknown>(
            'v1/config/user_config/metrics/',
            undefined,
            scope(rest),
        )
        return normalizeMetricOptions(body)
    },

    /**
     * Put `metricId` in slot `position`.
     *
     * A **POST**, and the id is in the path with the position in the body — legacy's shape, kept
     * because the endpoint is the endpoint (`config/user_config/metric/{id}/`). It is not
     * idempotent as far as the client is concerned, so `shared/lib/api/client.ts` will not replay
     * it on a 502; that is deliberate (see its note on retrying writes).
     *
     * `is_selected: true` is the only value ever sent. There is no "deselect" on this screen — a
     * slot always shows *something*, so removing a metric means putting another one in its place.
     */
    async selectMetric({
        metricId,
        position,
        ...rest
    }: Scoped & { metricId: string; position: number }): Promise<void> {
        await api.post(
            `v1/config/user_config/metric/${encodeURIComponent(metricId)}/`,
            { position, is_selected: true },
            scope(rest),
        )
    },
}
