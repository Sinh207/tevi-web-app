import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { CAMPAIGN_TYPES, type CampaignsByType, normalizeCampaigns } from './types'

/**
 * The campaign service: `${W_API}/dapp-campaign`. Its own host prefix, like `auth` and `billy`.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/dapp-campaign` })

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
                /*
                 * `campaign_type` goes out **once per value**, not bracketed: DRF ignores
                 * `campaign_type[]=…` and answers with every campaign, so the rail would render
                 * whichever three came first. `apiClient`'s instance-level `paramsSerializer` is
                 * what produces the repeated key — this call site relies on it rather than
                 * restating it.
                 */
                { campaign_type: [...CAMPAIGN_TYPES] },
                { signal, ...(accountId ? { accountId } : {}) },
            )
            .then(normalizeCampaigns)
    },
}
