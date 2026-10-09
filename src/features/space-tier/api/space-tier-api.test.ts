import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The call shape, pinned without a network. Legacy's `ApiModel.post(path, {}, { tier })` reads as
 * "body `{}`, query `{ tier }`" to anyone used to axios, and is the reverse — so the one thing this
 * file fences is `tier` travelling in the body.
 */
const get = vi.fn()
const post = vi.fn()

vi.mock('@shared/lib/api/model', () => ({
    createApiModel: ({ apiBase }: { apiBase: string }) => ({
        get: (...args: unknown[]) => get(apiBase, ...args),
        post: (...args: unknown[]) => post(apiBase, ...args),
        apiBase,
    }),
}))

const { spaceTierApi } = await import('./space-tier-api')

describe('spaceTierApi', () => {
    beforeEach(() => {
        get.mockReset().mockResolvedValue({})
        post.mockReset().mockResolvedValue({})
    })

    it('posts the tier in the body, to core', async () => {
        await spaceTierApi.updateTier(5, { accountId: 'a1' })
        const [base, path, body, config] = post.mock.calls[0]
        expect(base).toMatch(/\/core$/)
        expect(path).toBe('v3/channel/my-channel/space-tier/')
        expect(body).toEqual({ tier: 5 })
        expect(config).not.toHaveProperty('params')
    })

    it('reads the state from core and the estimate from report', async () => {
        await spaceTierApi.getState()
        await spaceTierApi.getEstimate()
        expect(get.mock.calls[0][0]).toMatch(/\/core$/)
        expect(get.mock.calls[0][1]).toBe('v3/channel/my-channel/space-tier/')
        expect(get.mock.calls[1][0]).toMatch(/\/report$/)
        expect(get.mock.calls[1][1]).toBe('v1/interaction/space-tier-estimate/')
    })
})
