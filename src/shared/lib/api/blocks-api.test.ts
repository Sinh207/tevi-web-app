import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
const del = vi.fn()

vi.mock('@shared/lib/api/model', () => ({
    createApiModel: () => ({ get: vi.fn(), post, del, put: vi.fn(), patch: vi.fn(), apiBase: '' }),
}))

const { blocksApi } = await import('./blocks-api')

beforeEach(() => {
    post.mockReset()
    del.mockReset()
})

describe('blocksApi', () => {
    /** Keyed by **user** id (`channel.owner_id`), not channel id. See B11. */
    it('blocks by user id', async () => {
        post.mockResolvedValue({})
        await blocksApi.blockUser('user-9')
        expect(post).toHaveBeenCalledWith('v3/channel/my-channel/blocks/', { user_id: 'user-9' })
    })

    /**
     * The identifier in the path is whatever the caller passed — the two shipped clients disagree
     * about which one it is (B23) — but it is always **encoded**, because it reaches the path and
     * a block record's id is not guaranteed to be URL-safe.
     */
    it('encodes the path segment rather than trusting the caller’s identifier', async () => {
        del.mockResolvedValue({})
        await blocksApi.unblockUser('user 9/../x')
        expect(del).toHaveBeenCalledWith('v3/channel/my-channel/blocks/user%209%2F..%2Fx/')
    })
})
