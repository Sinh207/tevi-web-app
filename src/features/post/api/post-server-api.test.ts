import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which service a post page reads on the server. It used to be the **channel** service, which
 * answers a post id with a 404 — so in the cluster every shared post would have rendered as deleted.
 * Legacy's `POST_SERVICE` is `http://tevi-post/tevi-post/v1/posts`.
 */
const get = vi.fn()
const createServerApiModel = vi.fn((_options: unknown) => ({ get }))
vi.mock('@shared/lib/api/server-client', () => ({
    createServerApiModel: (options: unknown) => createServerApiModel(options),
}))

/** `null` is a machine outside the cluster — `SERVER_API_VIA_GATEWAY`. */
const internal = { base: null as string | null }
const asked: string[] = []
vi.mock('@shared/config/server-env', () => ({
    internalApiBase: (service: string) => {
        asked.push(service)
        return internal.base
    },
}))

const { getPostForRequest } = await import('./post-server-api')

beforeEach(() => {
    get.mockReset().mockResolvedValue({ id: 'p1', code: 'pone', created_at: 1_760_000_000_000 })
    createServerApiModel.mockClear()
    internal.base = null
    asked.length = 0
})

describe('getPostForRequest', () => {
    it('reads the post service in-cluster', async () => {
        internal.base = 'http://tevi-post/tevi-post'

        expect((await getPostForRequest('pone')).status).toBe('ok')
        expect(createServerApiModel).toHaveBeenCalledWith(
            expect.objectContaining({
                apiBase: 'http://tevi-post/tevi-post',
                unwrapEnvelope: true,
            }),
        )
        expect(get).toHaveBeenCalledWith('v1/posts/pone/')
    })

    it('falls back to the public gateway when it is unset', async () => {
        await getPostForRequest('pone')
        expect(createServerApiModel).toHaveBeenCalledWith(
            expect.objectContaining({ apiBase: expect.stringMatching(/\/core$/) }),
        )
    })
})
