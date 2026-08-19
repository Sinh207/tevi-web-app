import { ApiError } from '@shared/lib/api/errors'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const post = vi.fn()
const del = vi.fn()

vi.mock('@shared/lib/api/model', () => ({
    createApiModel: () => ({ get, post, del, put: vi.fn(), patch: vi.fn(), apiBase: '' }),
}))

const { channelApi, channelKeys } = await import('./channel-api')

const CHANNEL = { id: 1, owner_id: 9, slug: 'ada', name: 'Ada', privacy: 'public' }

beforeEach(() => {
    get.mockReset()
    post.mockReset()
    del.mockReset()
})

describe('channelKeys', () => {
    /**
     * `detail` looks like it needs only a slug. It doesn't — the payload carries `is_followed`,
     * `blocking_channel` and `income_usd`, so an un-scoped key hands one account's follow state
     * to the next after a switch.
     */
    it('scopes every key by account so a switch cannot serve the previous user’s view', () => {
        expect(channelKeys.detail('ada', 'acc-1')).not.toEqual(channelKeys.detail('ada', 'acc-2'))
        expect(channelKeys.detail('ada', null)).toEqual(['channel', 'detail', 'ada', 'anon'])
        expect(channelKeys.myChannel(null)).toEqual(['channel', 'my-channel', 'anon'])
        expect(channelKeys.stats('ada', 'a')).toEqual(['channel', 'stats', 'ada', 'a'])
        expect(channelKeys.threads('ada', 'media', 'a')).toEqual([
            'channel',
            'threads',
            'ada',
            'media',
            'a',
        ])
    })

    it('nests under one root so the feature can be invalidated wholesale', () => {
        expect(channelKeys.detail('ada', null)[0]).toBe(channelKeys.all[0])
    })
})

describe('getChannel', () => {
    it('requests the channel and normalises the body', async () => {
        get.mockResolvedValue(CHANNEL)
        const channel = await channelApi.getChannel('ada')
        expect(get).toHaveBeenCalledWith('v3/channel/channels/ada/', undefined, undefined)
        expect(channel).toMatchObject({ slug: 'ada', is_followed: false })
    })

    /** The slug comes off the URL, so it is encoded at every use (DoD §8). */
    it('encodes the slug', async () => {
        get.mockResolvedValue(CHANNEL)
        await channelApi.getChannel('a b/../c')
        expect(get).toHaveBeenCalledWith(
            'v3/channel/channels/a%20b%2F..%2Fc/',
            undefined,
            undefined,
        )
    })

    it('pins the account when one is given', async () => {
        get.mockResolvedValue(CHANNEL)
        await channelApi.getChannel('ada', 'acc-1')
        expect(get).toHaveBeenCalledWith('v3/channel/channels/ada/', undefined, {
            accountId: 'acc-1',
        })
    })
})

describe('getMyChannel', () => {
    /** Without `auto_create=0` the endpoint provisions a space as a side effect of being asked. */
    it('asks without provisioning', async () => {
        get.mockResolvedValue(CHANNEL)
        await channelApi.getMyChannel()
        expect(get).toHaveBeenCalledWith('v3/channel/my-channel/', { auto_create: 0 }, undefined)
    })

    /**
     * The contract that makes ownership resolution and `/my-space` work: a 404 resolves as
     * `null`, so the query is `success` with `isPending` false — "no channel yet" is
     * distinguishable from "still loading". Rethrowing here would collapse the two.
     */
    it('returns null on 404 rather than failing', async () => {
        get.mockRejectedValue(new ApiError({ message: 'nope', status: 404 }))
        await expect(channelApi.getMyChannel()).resolves.toBeNull()
    })

    it('still rethrows a real failure', async () => {
        get.mockRejectedValue(new ApiError({ message: 'boom', status: 500 }))
        await expect(channelApi.getMyChannel()).rejects.toMatchObject({ status: 500 })

        get.mockRejectedValue(new ApiError({ message: 'offline', isNetwork: true }))
        await expect(channelApi.getMyChannel()).rejects.toMatchObject({ isNetwork: true })
    })
})

describe('getThreads', () => {
    const PAGE = { results: [], count: 0, next: null, previous: null }

    it('reads the owner’s own list, which returns drafts the public one filters out', async () => {
        get.mockResolvedValue(PAGE)
        await channelApi.getThreads({ slug: 'ada', isOwner: true, kind: 'posts' })
        expect(get.mock.calls[0][0]).toBe('v3/channel/my-channel/threads/')

        await channelApi.getThreads({ slug: 'ada', isOwner: false, kind: 'posts' })
        expect(get.mock.calls[1][0]).toBe('v3/channel/channels/ada/threads/')
    })

    it('uses the tab’s first-page params, media being a whole number of grid rows', async () => {
        get.mockResolvedValue(PAGE)
        await channelApi.getThreads({ slug: 'ada', isOwner: false, kind: 'posts' })
        expect(get.mock.calls[0][1]).toEqual({ limit: 20, pinned: 0 })

        await channelApi.getThreads({ slug: 'ada', isOwner: false, kind: 'media' })
        expect(get.mock.calls[1][1]).toEqual({
            limit: 21,
            pinned: 0,
            media_type: ['image', 'video'],
        })
    })

    /**
     * Legacy passes `limit` *alongside* an already-complete cursor query, duplicating whatever
     * the cursor carried. One or the other, never both.
     */
    it('replaces the first-page params with the cursor rather than merging', async () => {
        get.mockResolvedValue(PAGE)
        await channelApi.getThreads({
            slug: 'ada',
            isOwner: false,
            kind: 'media',
            cursor: { created_at_lt: ['17'], media_type: ['image', 'video'] },
        })
        expect(get.mock.calls[0][1]).toEqual({
            created_at_lt: ['17'],
            media_type: ['image', 'video'],
        })
        expect(get.mock.calls[0][1]).not.toHaveProperty('limit')
    })

    /**
     * Axios would send `media_type[]=image`; DRF wants the bare key repeated. Without this the
     * server ignores the filter and returns unfiltered results — the tab **looks** like it
     * works. See B12.
     */
    it('serialises repeated params as a bare key, not a bracketed one', async () => {
        get.mockResolvedValue(PAGE)
        await channelApi.getThreads({ slug: 'ada', isOwner: false, kind: 'media' })
        expect(get.mock.calls[0][2]).toMatchObject({ paramsSerializer: { indexes: null } })
    })

    it('forwards the abort signal so a tab switch cancels in flight', async () => {
        get.mockResolvedValue(PAGE)
        const signal = new AbortController().signal
        await channelApi.getThreads({ slug: 'ada', isOwner: false, kind: 'posts', signal })
        expect(get.mock.calls[0][2]).toMatchObject({ signal })
    })
})

describe('follow / unfollow / mute', () => {
    /** The same endpoint does all three. There is no separate mute route — see B15. */
    it('posts an empty body to follow and a notification flag to mute', async () => {
        post.mockResolvedValue({})
        await channelApi.follow('ada')
        expect(post).toHaveBeenCalledWith('v3/channel/channels/ada/follow/', {})

        await channelApi.follow('ada', false)
        expect(post).toHaveBeenLastCalledWith('v3/channel/channels/ada/follow/', {
            notification: false,
        })
    })

    it('unfollows on its own route', async () => {
        post.mockResolvedValue({})
        await channelApi.unfollow('ada')
        expect(post).toHaveBeenCalledWith('v3/channel/channels/ada/unfollow/', {})
    })
})

describe('blocks', () => {
    /** Keyed by **user** id (`channel.owner_id`), not channel id. See B11. */
    it('blocks and unblocks by user id', async () => {
        post.mockResolvedValue({})
        del.mockResolvedValue({})
        await channelApi.blockUser('user-9')
        expect(post).toHaveBeenCalledWith('v3/channel/my-channel/blocks/', { user_id: 'user-9' })

        await channelApi.unblockUser('user 9/../x')
        expect(del).toHaveBeenCalledWith('v3/channel/my-channel/blocks/user%209%2F..%2Fx/')
    })
})

describe('updatePrivacy', () => {
    it('posts the visibility to its own route and pins the account', async () => {
        post.mockResolvedValue({ privacy: 'protected' })
        const result = await channelApi.updatePrivacy('protected', 'acc-1')
        expect(post).toHaveBeenCalledWith(
            'v3/channel/my-channel/privacy/',
            { privacy: 'protected' },
            { accountId: 'acc-1' },
        )
        expect(result).toBe('protected')
    })

    /** Legacy `.toLowerCase()`s privacy at six call sites, so the case is not guaranteed (B16). */
    it('tolerates case and padding in the acknowledgement', async () => {
        post.mockResolvedValue({ privacy: ' Unpublished ' })
        await expect(channelApi.updatePrivacy('unpublished')).resolves.toBe('unpublished')
    })

    /**
     * `null`, **not** the read path's fail-closed `'protected'`. On a write the value is being
     * reflected back at the person who just chose it, so an unparseable answer has to mean "we
     * do not know" and send the caller to refetch — telling someone who picked *public* that
     * their space is protected would be a lie in the safe-looking direction.
     */
    it.each([
        ['no body', null],
        ['no privacy key', { ok: true }],
        ['a value outside the enum', { privacy: 'friends-only' }],
        ['a non-string', { privacy: 3 }],
    ])('reports an unusable acknowledgement as null: %s', async (_label, body) => {
        post.mockResolvedValue(body)
        await expect(channelApi.updatePrivacy('public')).resolves.toBeNull()
    })

    it('omits the account config when none is given, rather than sending undefined', async () => {
        post.mockResolvedValue({ privacy: 'public' })
        await channelApi.updatePrivacy('public')
        expect(post).toHaveBeenCalledWith(
            'v3/channel/my-channel/privacy/',
            { privacy: 'public' },
            undefined,
        )
    })
})
