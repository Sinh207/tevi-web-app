import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()

vi.mock('@shared/lib/api/model', () => ({
    createApiModel: vi.fn(() => ({
        get,
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        del: vi.fn(),
        apiBase: '',
    })),
}))

const { createApiModel } = await import('@shared/lib/api/model')
const { earningsApi, earningsKeys } = await import('./earnings-api')

beforeEach(() => {
    get.mockReset().mockResolvedValue([])
})

describe('earningsKeys', () => {
    /**
     * The report is one account's money and the switcher is two taps from every screen. An
     * unscoped key would show account B account A's earnings — the single worst thing this
     * feature could do.
     */
    it('scopes the daily key by account', () => {
        expect(earningsKeys.daily('acc-1')).not.toEqual(earningsKeys.daily('acc-2'))
        expect(earningsKeys.daily(null)).toEqual(['earnings', 'daily', 'anon'])
    })

    /**
     * The split is a decomposition of the total, so invalidating the list must take the splits
     * with it — otherwise a refetched total sits above rows that no longer add up to it.
     */
    it('nests the detail key under the daily one, so invalidating the list clears both', () => {
        const daily = earningsKeys.daily('acc-1')
        const detail = earningsKeys.detail('acc-1', 1_739_923_200_000)
        expect(detail.slice(0, daily.length)).toEqual([...daily])
    })

    it('scopes the detail key by account and by day', () => {
        expect(earningsKeys.detail('acc-1', 1)).not.toEqual(earningsKeys.detail('acc-2', 1))
        expect(earningsKeys.detail('acc-1', 1)).not.toEqual(earningsKeys.detail('acc-1', 2))
    })
})

describe('earningsApi', () => {
    /**
     * **The regression this file exists for.** `channelStatsApi` is `${W_API}/analytics` and this
     * is `${W_API}/report` — two different microservices, both answering questions about a
     * channel's numbers, whose legacy model files sit next to each other. Getting it wrong 404s
     * every request on the screen.
     */
    it('is built on the report service, not the analytics one', () => {
        const [config] = vi.mocked(createApiModel).mock.calls[0]
        expect(config.apiBase).toMatch(/\/report$/)
    })

    it('pins the account on the daily request', async () => {
        await earningsApi.getDailyRevenue({ accountId: 'acc-1' })
        const [path, , config] = get.mock.calls[0]
        expect(path).toBe('v1/channel/revenue/daily/')
        expect(config).toMatchObject({ accountId: 'acc-1' })
    })

    /**
     * No account, no key: `{ accountId: undefined }` makes the client's own "act as this account"
     * branch fire on a value it cannot use. Same rule as `identificationApi`.
     */
    it('sends no accountId when there is no account to pin', async () => {
        await earningsApi.getDailyRevenue()
        expect(get.mock.calls[0][2]).not.toHaveProperty('accountId')
    })

    /**
     * `to_date_ts` is computed at fetch time and must **not** be in the query key — putting it
     * there makes every render a distinct query, so the cache never hits and never expires.
     */
    it('sends `to_date_ts` as a fresh millisecond timestamp', async () => {
        const before = Date.now()
        await earningsApi.getDailyRevenue({ accountId: 'acc-1' })
        const params = get.mock.calls[0][1] as { to_date_ts: number }
        expect(params.to_date_ts).toBeGreaterThanOrEqual(before)
        expect(params.to_date_ts).toBeLessThanOrEqual(Date.now())
    })

    /**
     * `date_ts` is the row's `date` **verbatim** — milliseconds. Converting it to seconds to match
     * the URL segment is the mistake this guards: the URL is seconds and the API is not.
     */
    it('sends the day as milliseconds on the detail request', async () => {
        get.mockResolvedValueOnce({ details: [] })
        await earningsApi.getDailyRevenueDetail({ dateMs: 1_739_923_200_000, accountId: 'acc-1' })
        const [path, params, config] = get.mock.calls[0]
        expect(path).toBe('v1/channel/revenue/daily/detail/')
        expect(params).toEqual({ date_ts: 1_739_923_200_000 })
        expect(config).toMatchObject({ accountId: 'acc-1' })
    })

    it('normalises what it returns rather than handing the body through', async () => {
        get.mockResolvedValueOnce([{ id: 'a', date: 1_739_923_200_000, total: '4.50' }])
        await expect(earningsApi.getDailyRevenue()).resolves.toEqual([
            { id: 'a', date: 1_739_923_200_000, total: 4.5 },
        ])
    })
})
