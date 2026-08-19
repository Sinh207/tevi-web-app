import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import {
    type EarningsCategoryAmount,
    type EarningsDay,
    normalizeEarningsDays,
    normalizeEarningsDetails,
} from './types'

/**
 * The **report** service: `${W_API}/report`.
 *
 * ⚠ Not `/analytics`, which is where `channelStatsApi` lives. The two are different microservices
 * and it is easy to land on the wrong one, because both answer questions about a channel's
 * numbers and legacy's model files sit next to each other. Legacy's `models/apiReport.js` is
 * `${W_API_DOMAIN}/report` and `models/analyticsReport.js` builds every earnings path on it; the
 * public stats block on a channel page is the `/analytics` one. Getting this wrong 404s.
 *
 * **The channel is derived from the bearer, never passed.** There is no `channel_id` or slug on
 * any of these requests — the report is whoever the token says you are. That is the single most
 * important fact about this file and it has two consequences the screen has to handle:
 *
 * 1. Every request must **pin the account** (`accountId`), or a multi-account reader gets
 *    whichever bearer happened to be active when the request went out, filed under the key of
 *    the one they were looking at. Same rule, same reason, as `authApi.getMe`.
 * 2. The slug in the URL is **decoration**. `/@bob/earnings-report` opened by Alice would show
 *    Alice's money under Bob's address — legacy does exactly that. `EarningsReportView` compares
 *    the URL's slug against the reader's own channel before rendering a single figure.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/report` })

/**
 * Query keys.
 *
 * Account-scoped, for the reason above: this is one account's money and the switcher is two taps
 * from every screen.
 *
 * `detail` sits **under** `daily` on purpose. Invalidating the list therefore invalidates every
 * expanded day with it, which is the behaviour you want — the split is a decomposition of the
 * total, so a total that has been refetched and a split that has not is a card whose rows do not
 * add up to its own header.
 */
export const earningsKeys = {
    all: ['earnings'] as const,
    daily: (accountId: string | null) => ['earnings', 'daily', accountId ?? 'anon'] as const,
    detail: (accountId: string | null, dateMs: number) =>
        ['earnings', 'daily', accountId ?? 'anon', 'detail', dateMs] as const,
}

export const earningsApi = {
    /**
     * Every day the report covers, newest first.
     *
     * ## `to_date_ts` is computed **here**, not in the query key
     *
     * The endpoint takes an upper bound and legacy passes `Date.now()`. Putting that in the key
     * would make every render a distinct query — a permanent cache miss, a request per keystroke
     * of re-render, and an infinite cache. So the key is just the account (see `earningsKeys`)
     * and the bound is read at fetch time: a refetch naturally asks for a later "now", which is
     * exactly the intent.
     *
     * There is no lower bound and no page size, matching legacy. B32 asks how far back this goes
     * and whether it will paginate; if it does, this becomes an infinite query and the screen
     * grows a sentinel like `/settings/blocked-accounts` has.
     */
    async getDailyRevenue({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<EarningsDay[]> {
        const body = await api.get<unknown>(
            'v1/channel/revenue/daily/',
            { to_date_ts: Date.now() },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeEarningsDays(body)
    },

    /**
     * One day's total, split by revenue category.
     *
     * `date_ts` is the row's `date` verbatim — epoch **milliseconds**, per the note on
     * `EarningsDay.date`. Do not convert it to seconds to match the URL segment: the URL is
     * seconds and the API is not, and reconciling the two is `parseEarningsDateParam`'s job.
     */
    async getDailyRevenueDetail({
        dateMs,
        accountId,
        signal,
    }: {
        dateMs: number
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<EarningsCategoryAmount[]> {
        const body = await api.get<unknown>(
            'v1/channel/revenue/daily/detail/',
            { date_ts: dateMs },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeEarningsDetails(body)
    },
}
