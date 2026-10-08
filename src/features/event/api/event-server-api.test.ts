import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which service an event page reads on the server. It used to be the **channel** service, which has
 * no events — so in the cluster every event page would have rendered as `unavailable`. The claim
 * pinned here is legacy's mapping: in-cluster it is the livestream service at `v1/public-events/`,
 * and without it the public gateway at `core/v4/public/events/`.
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

const { getEventForRequest } = await import('./event-server-api')

beforeEach(() => {
    get.mockReset().mockResolvedValue({ code: 'abc', title: 'Jam', channel: { slug: 'ada' } })
    createServerApiModel.mockClear()
    internal.base = null
    asked.length = 0
})

describe('getEventForRequest', () => {
    it('reads the livestream service in-cluster, at legacy’s path', async () => {
        internal.base = 'http://tevi-livestream/live'

        expect((await getEventForRequest('abc')).status).toBe('ok')
        expect(createServerApiModel).toHaveBeenCalledWith(
            expect.objectContaining({
                apiBase: 'http://tevi-livestream/live',
                unwrapEnvelope: true,
            }),
        )
        expect(get).toHaveBeenCalledWith('v1/public-events/abc/')
    })

    it('falls back to the public gateway’s v4 path when it is unset', async () => {
        await getEventForRequest('xyz')
        expect(createServerApiModel).toHaveBeenCalledWith(
            expect.objectContaining({ apiBase: expect.stringMatching(/\/core$/) }),
        )
        expect(get).toHaveBeenCalledWith('v4/public/events/xyz/')
    })

    it('says gone only for a 404', async () => {
        get.mockRejectedValueOnce({ status: 404 })
        expect((await getEventForRequest('gone')).status).toBe('gone')
        get.mockRejectedValueOnce({ status: 502 })
        expect((await getEventForRequest('down')).status).toBe('unavailable')
    })
})
