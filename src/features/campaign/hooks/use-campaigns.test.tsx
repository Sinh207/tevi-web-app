// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { campaignKeys } from '../api/campaign-api'
import { type CampaignsByType, EMPTY_CAMPAIGNS, normalizeCampaigns } from '../api/types'
import { useCampaigns } from './use-campaigns'

/**
 * Three promises this hook makes that no call site can see, and that legacy gets wrong:
 *
 * 1. **The request is scoped to the account.** `user_joined` is per-account, so a cached answer
 *    must not survive a switch. Legacy holds one copy in a provider's `useState`.
 * 2. **A visitor with no account makes no request.** The endpoint can only answer "nothing for
 *    you", and legacy's equivalent is gated on `myChannel?.id` for the same reason.
 * 3. **`isLoading` is false when the query is disabled.** A disabled TanStack query reports
 *    `isLoading: true` forever, which is exactly the stuck-skeleton legacy's Lives tab has.
 */

const getCampaigns = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({
    state: { activeId: 'acc-1' as string | null, isAuthenticated: true },
}))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('../api/campaign-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/campaign-api')>('../api/campaign-api')
    return { ...actual, campaignApi: { getCampaigns } }
})

/* Built through the real parser, so the fixture cannot drift from the wire shape. */
const AFFILIATE = normalizeCampaigns({
    results: [{ campaign_type: 'AFFILIATE', is_active: true, user_joined: true }],
}).AFFILIATE

function answer(partial: Partial<CampaignsByType>): CampaignsByType {
    return { ...EMPTY_CAMPAIGNS, ...partial }
}

function renderCampaigns() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api: ReturnType<typeof useCampaigns> | null = null
    function Probe() {
        api = useCampaigns()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return {
        queryClient,
        get current() {
            if (!api) throw new Error('probe did not render')
            return api
        },
    }
}

beforeEach(() => {
    getCampaigns.mockReset()
    auth.state = { activeId: 'acc-1', isAuthenticated: true }
})

describe('useCampaigns', () => {
    it('pins the request and the cache entry to the active account', async () => {
        getCampaigns.mockResolvedValue(answer({ AFFILIATE }))
        const probe = renderCampaigns()

        await waitFor(() => expect(probe.current.campaigns.AFFILIATE).not.toBeNull())

        expect(getCampaigns).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-1' }))
        expect(probe.queryClient.getQueryData(campaignKeys.list('acc-1'))).toBeDefined()
        // The other account's entry is a different key, so switching cannot read this one.
        expect(probe.queryClient.getQueryData(campaignKeys.list('acc-2'))).toBeUndefined()
    })

    it('makes no request for a visitor with no account', async () => {
        auth.state = { activeId: null, isAuthenticated: false }
        const probe = renderCampaigns()

        await waitFor(() => expect(probe.current.isLoading).toBe(false))
        expect(getCampaigns).not.toHaveBeenCalled()
        expect(probe.current.campaigns).toEqual(answer({}))
    })

    it('reports every kind as absent until the answer lands, so no card flashes', () => {
        getCampaigns.mockReturnValue(new Promise(() => {}))
        const probe = renderCampaigns()

        expect(probe.current.campaigns).toEqual(answer({}))
        expect(probe.current.isLoading).toBe(true)
    })

    it('falls back to no campaigns when the request fails, rather than throwing at the rail', async () => {
        getCampaigns.mockRejectedValue(new Error('upstream is down'))
        const probe = renderCampaigns()

        await waitFor(() => expect(probe.current.isLoading).toBe(false))
        expect(probe.current.campaigns).toEqual(answer({}))
    })

    it('threads the abort signal through, so a fast navigation cancels the fetch', async () => {
        getCampaigns.mockResolvedValue(answer({}))
        renderCampaigns()

        await waitFor(() => expect(getCampaigns).toHaveBeenCalled())
        expect(getCampaigns.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal)
    })
})
