import { env } from '@shared/config/env'
import { ANON_SCOPE, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'

/**
 * Two services, one screen.
 *
 * - **core** owns the tier itself: `GET`/`POST v3/channel/my-channel/space-tier/` (BE-135). The
 *   write's body is `{ tier }` — legacy calls `ApiModel.post(path, {}, { tier })`, whose *third*
 *   argument is the body (its signature is `post(uri, params, data)`, the reverse of axios), so the
 *   query string is empty. `space-tier-api.test.ts` pins the call shape, because nothing above the
 *   axios call can see the difference.
 * - **report** owns the estimate: `GET v1/interaction/space-tier-estimate/` (BE-172), every tier's
 *   figure in one call.
 *
 * Both are per-bearer, so neither is persisted to disk (`cache: { persist }` stays off).
 */
const core = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })
const report = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/report` })

const TIER_PATH = 'v3/channel/my-channel/space-tier/'
const ESTIMATE_PATH = 'v1/interaction/space-tier-estimate/'

export const spaceTierKeys = {
    all: ['space-tier'] as const,
    state: (accountId: string | null) => ['space-tier', 'state', accountId ?? 'anon'] as const,
    estimate: (accountId: string | null) =>
        ['space-tier', 'estimate', accountId ?? 'anon'] as const,
}

interface Scoped {
    accountId?: string | null
    signal?: AbortSignal
}

function scope({ accountId, signal }: Scoped) {
    return { signal, ...(accountId ? { accountId } : {}) }
}

export const spaceTierApi = {
    /** The wire body, unparsed — the cache holds it so a partial POST answer can merge over it. */
    getState(rest: Scoped = {}): Promise<unknown> {
        return core.get<unknown>(TIER_PATH, undefined, scope(rest))
    },

    updateTier(tier: number, rest: Scoped = {}): Promise<unknown> {
        return core.post<unknown>(TIER_PATH, { tier }, scope(rest))
    },

    getEstimate(rest: Scoped = {}): Promise<unknown> {
        return report.get<unknown>(ESTIMATE_PATH, undefined, scope(rest))
    },

    /**
     * Drop the GET's validator before the refetch that follows a write — the server's ETag moves
     * with the tier, but a stale memory copy is one more thing to be wrong about for no saving.
     */
    forgetState(accountId: string | null) {
        return invalidateETagCache(accountId ?? ANON_SCOPE, `${core.apiBase}/${TIER_PATH}`)
    },
}
