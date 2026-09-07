import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import {
    type CampaignStats,
    type CurrentCampaign,
    normalizeCurrentCampaign,
    normalizePrograms,
    normalizeStats,
    type Program,
    programSchema,
} from './types'

/**
 * The affiliate service: `${W_API}/raffi`. Its own host prefix, separate from
 * `features/campaign`'s `dapp-campaign` — the campaign list says *whether* affiliate programs are
 * offered to this account, and this service is the programs themselves.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/raffi` })

/** Legacy's page size. One page is the whole list in practice; there is no "load more" screen. */
export const PROGRAMS_PAGE_SIZE = 50

/**
 * Keyed by account, all of it. Which programs are offered, which one is being promoted and what it
 * has earned are per-account answers, so switching accounts refetches on its own and signing out
 * drops the data with the account rather than needing anything cleared by hand.
 *
 * `all` is the invalidation root: joining or leaving changes the current campaign *and* the stats
 * *and* which row the list marks as promoted, so the write invalidates the root rather than trying
 * to name the three.
 */
export const affiliateKeys = {
    all: ['affiliate'] as const,
    programs: (accountId: string | null) =>
        [...affiliateKeys.all, 'programs', accountId ?? 'anon'] as const,
    current: (accountId: string | null) =>
        [...affiliateKeys.all, 'current', accountId ?? 'anon'] as const,
    stats: (accountId: string | null) =>
        [...affiliateKeys.all, 'stats', accountId ?? 'anon'] as const,
}

interface Scoped {
    accountId?: string | null
    signal?: AbortSignal
}

/** Pins the request to a bearer rather than "whoever is active when it goes out". */
const scope = ({ accountId, signal }: Scoped) => ({
    signal,
    ...(accountId ? { accountId } : {}),
})

export const affiliateApi = {
    /** Every program on offer. */
    getPrograms({ accountId, signal }: Scoped = {}): Promise<Program[]> {
        return api
            .get<unknown>(
                'v1/programs/',
                { page: 1, page_size: PROGRAMS_PAGE_SIZE },
                /*
                 * The catalogue is public — nothing here says whether *this* account joined, which
                 * is `campaigns/current/`'s answer and is deliberately not cached.
                 *
                 * An hour, not a day: `estimate_income` and `promoter_count` drift on their own
                 * rather than being edited, which is exactly the line `CACHE_TTL` draws.
                 *
                 * **`persist` but not `shared`**, for one field: `estimate_income` is documented as
                 * a monthly revenue estimate, and whether that is the *program's* figure or *this
                 * promoter's* is not settled. If it is the promoter's, a device-wide scope shows one
                 * account another's projected earnings — **B93**.
                 */
                {
                    ...scope({ accountId, signal }),
                    cache: { persist: true, ttlMs: CACHE_TTL.hour },
                },
            )
            .then(normalizePrograms)
    },

    /** The campaign being promoted, or `null`. */
    getCurrentCampaign({ accountId, signal }: Scoped = {}): Promise<CurrentCampaign | null> {
        return api
            .get<unknown>('v1/campaigns/current/', undefined, scope({ accountId, signal }))
            .then(normalizeCurrentCampaign)
    },

    /** Referrals and earnings to date. */
    getStats({ accountId, signal }: Scoped = {}): Promise<CampaignStats | null> {
        return api
            .get<unknown>('v1/campaigns/stats/', undefined, scope({ accountId, signal }))
            .then(normalizeStats)
    },

    /**
     * Start promoting a program.
     *
     * **`program_id` is a body field, not a query parameter.** Legacy's call is
     * `post(path, {}, { program_id })` against a `post(uri, params, data, headers)` signature — the
     * empty object is the query and the id is the body. Reading that as "params" would send
     * `?program_id=` with an empty body, which the service accepts as a request to join nothing.
     *
     * Answers the joined campaign; the program is folded in by the caller because the response has
     * been seen omitting it.
     */
    joinProgram(
        programId: string,
        { accountId, signal }: Scoped = {},
    ): Promise<{ program: Program | null; referralUrl: string | null }> {
        return api
            .post<unknown>(
                'v1/campaigns/join/',
                { program_id: programId },
                scope({ accountId, signal }),
            )
            .then(body => {
                const parsedProgram = programSchema.safeParse(
                    (body as { program?: unknown } | null)?.program,
                )
                const referral = (body as { referral_url?: unknown } | null)?.referral_url
                return {
                    program: parsedProgram.success ? parsedProgram.data : null,
                    referralUrl: typeof referral === 'string' ? referral : null,
                }
            })
    },

    /**
     * Stop promoting.
     *
     * No program id: the service leaves whatever this account is promoting, because it can only
     * promote one at a time. That is also why a *switch* is a leave followed by a join.
     */
    leaveProgram({ accountId, signal }: Scoped = {}): Promise<void> {
        return api
            .post<unknown>('v1/campaigns/leave/', {}, scope({ accountId, signal }))
            .then(() => undefined)
    },
}
