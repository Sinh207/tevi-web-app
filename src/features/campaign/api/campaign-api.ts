import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { CAMPAIGN_TYPES, type CampaignsByType, normalizeCampaigns } from './types'

/**
 * The campaign service: `${W_API}/dapp-campaign`. Its own host prefix, like `auth` and `billy`.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/dapp-campaign` })

/**
 * `campaign_type` is sent **once per value**, not as a bracketed array.
 *
 * axios's default serializer emits `campaign_type[]=LUCKY_WHEEL&campaign_type[]=…`, which DRF
 * ignores — it does not error, it just returns every campaign, and the rail would render whatever
 * happened to come first. `channel-api.ts` carries the identical constant for the identical reason
 * and calls the failure silent; this is the second instance, so the comment is worth repeating
 * rather than cross-referencing.
 */
const REPEAT_ARRAY_PARAMS = { paramsSerializer: { indexes: null } } as const

/**
 * Keyed by account: `user_joined` is per-account, and so is whether a campaign is offered at all.
 * Switching accounts in this tab or another therefore refetches on its own, and signing out drops
 * the data with the account rather than needing anything cleared by hand.
 */
export const campaignKeys = {
    all: ['campaign'] as const,
    list: (accountId: string | null) => [...campaignKeys.all, 'list', accountId ?? 'anon'] as const,
}

export const campaignApi = {
    /** The rail's three campaigns, in one request. */
    getCampaigns({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<CampaignsByType> {
        return api
            .get<unknown>(
                'v1/campaigns/',
                { campaign_type: [...CAMPAIGN_TYPES] },
                { signal, ...(accountId ? { accountId } : {}), ...REPEAT_ARRAY_PARAMS },
            )
            .then(normalizeCampaigns)
    },
}
