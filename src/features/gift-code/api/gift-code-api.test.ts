import { ApiError } from '@shared/lib/api/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
const get = vi.hoisted(() => vi.fn())
vi.mock('@shared/lib/api/model', () => ({
    createApiModel: ({ apiBase }: { apiBase: string }) => ({
        post: (path: string, body: unknown, config?: unknown) =>
            post(`${apiBase.split('/').pop()}:${path}`, body, config),
        get: (path: string, params?: unknown, config?: unknown) =>
            get(`${apiBase.split('/').pop()}:${path}`, params, config),
    }),
}))

const { giftCodeApi } = await import('./gift-code-api')

/**
 * The sequence's one dangerous edge, now settled by the backend (**B68**): both services have to be
 * tried, and **whichever answers 200 has redeemed the code**.
 *
 * This is worth a test rather than a comment because neither response shows the mistake. The client
 * used to require a *truthy body* from the Premium service, copying legacy — so a `200 {}` read as
 * "not one of ours" and the same code was posted on to the gifting service. A code spent twice, and
 * the second grant dropped on the floor.
 */
beforeEach(() => {
    post.mockReset()
    get.mockReset()
})

describe('giftCodeApi.redeem', () => {
    it('stops at a Premium 2xx even when the body is empty', async () => {
        // The shape that used to fall through: accepted, with nothing to show for it.
        post.mockImplementation(async (path: string) =>
            path.startsWith('premium:') ? undefined : { star: 100 },
        )

        await expect(giftCodeApi.redeem('CODE-1')).resolves.toEqual({ kind: 'premium' })

        // The point of the whole test: the gifting service is never offered a spent code.
        expect(post).toHaveBeenCalledTimes(1)
        expect(post.mock.calls[0]?.[0]).toBe('premium:v1/redeem/')
    })

    it('moves on to gifting when Premium refuses the code', async () => {
        post.mockImplementation(async (path: string) => {
            // A 4xx is "not ours" — the line `isCodeRejection` draws.
            if (path.startsWith('premium:')) {
                throw new ApiError({ message: 'no', status: 404 })
            }
            return { star_amount: 100 }
        })

        const result = await giftCodeApi.redeem('CODE-2')

        expect(post).toHaveBeenCalledTimes(2)
        expect(post.mock.calls[1]?.[0]).toBe('billy:v1/gifting/redeem/')
        expect(result.kind).not.toBe('premium')
    })
})
