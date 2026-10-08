import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What reaches the server's HTML at `/` — the only place a guest's and a crawler's view of the feed
 * is decided. Three claims: it is the **post** service in-cluster (the channel one has no posts), a
 * row a scraper may not be handed never is, and a failure is an absent feed rather than an error.
 */
const get = vi.fn()
const createServerApiModel = vi.fn((_options: unknown) => ({ get }))
vi.mock('@shared/lib/api/server-client', () => ({
    createServerApiModel: (options: unknown) => createServerApiModel(options),
}))

/** `null` is a machine outside the cluster — `SERVER_API_VIA_GATEWAY`. */
const internal = { base: 'http://tevi-post/tevi-post' as string | null }
vi.mock('@shared/config/server-env', () => ({
    internalApiBase: (service: string) => (service === 'post' ? internal.base : null),
}))

const { getPublicFeedForRequest } = await import('./home-server-api')

const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    created_at: 1_760_000_000_000,
    channel: { id: 'ch-1', slug: 'ada' },
    ...extra,
})

beforeEach(() => {
    get.mockReset()
    createServerApiModel.mockClear()
    internal.base = 'http://tevi-post/tevi-post'
})

describe('getPublicFeedForRequest', () => {
    it('reads the post service in-cluster, unwrapping its envelope', async () => {
        get.mockResolvedValue({ results: [row('a')] })

        expect(await getPublicFeedForRequest()).toHaveLength(1)
        expect(createServerApiModel).toHaveBeenCalledWith(
            expect.objectContaining({
                apiBase: 'http://tevi-post/tevi-post',
                unwrapEnvelope: true,
            }),
        )
        // `v1` in-cluster — the post service's own version of this feed.
        expect(get).toHaveBeenCalledWith('v1/channel/followed-channels/threads/', { limit: 20 })
    })

    it('asks the gateway for v3 outside the cluster — its v1 is a 404', async () => {
        internal.base = null
        get.mockResolvedValue({ results: [row('a')] })

        await getPublicFeedForRequest()
        expect(createServerApiModel).toHaveBeenCalledWith(
            expect.objectContaining({ apiBase: expect.stringMatching(/\/core$/) }),
        )
        expect(get).toHaveBeenCalledWith('v3/channel/followed-channels/threads/', { limit: 20 })
    })

    it('drops every row a scraper may not be handed', async () => {
        get.mockResolvedValue({
            results: [
                row('ok'),
                row('marked', { marked_nsfw: true }),
                row('space', { channel: { id: 'ch-2', slug: 'x', is_nsfw: true } }),
                row('gone', { deleted: true }),
            ],
        })

        expect((await getPublicFeedForRequest())?.map(post => post.id)).toEqual(['ok'])
    })

    it('answers null — not an empty list — when there is nothing to show', async () => {
        get.mockResolvedValue({ results: [] })
        expect(await getPublicFeedForRequest()).toBeNull()
    })

    it('answers null when the service fails, so the page still renders', async () => {
        get.mockRejectedValue(new Error('ECONNREFUSED'))
        expect(await getPublicFeedForRequest()).toBeNull()
    })
})
