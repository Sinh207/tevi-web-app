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

    /**
     * `blocksAll` is only useful as long as it is a **prefix** of `blocks` — that is what makes
     * one `invalidateQueries` reach every search term's list. Reorder the key and invalidation
     * silently matches nothing, leaving an unblocked account listed under the other terms.
     */
    it('keeps every search term’s blocked list under one invalidation prefix', () => {
        expect(channelKeys.blocks('acc-1')).toEqual(['channel', 'blocks', 'acc-1', ''])
        expect(channelKeys.blocks('acc-1', 'ada')).not.toEqual(channelKeys.blocks('acc-1'))
        const scope = channelKeys.blocksAll('acc-1')
        expect(channelKeys.blocks('acc-1', 'ada').slice(0, scope.length)).toEqual([...scope])
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

    /*
     * The repeated-key serialisation this used to assert here (`media_type=image&media_type=video`
     * rather than `media_type[]=…`, B12) is `apiClient`'s, set once on the instance — so it is
     * pinned in `shared/lib/api/client.test.ts` against the built URI, which is the bytes that
     * actually leave. Asserting the flag again here only pinned that this model remembered to pass
     * something it no longer passes. What is still this model's own is the test above: the cursor
     * reaches axios with its values as arrays.
     */

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
        expect(post).toHaveBeenCalledWith('v3/channel/channels/ada/follow/', {}, undefined)

        await channelApi.follow('ada', false)
        expect(post).toHaveBeenLastCalledWith(
            'v3/channel/channels/ada/follow/',
            { notification: false },
            undefined,
        )
    })

    it('unfollows on its own route', async () => {
        post.mockResolvedValue({})
        await channelApi.unfollow('ada')
        expect(post).toHaveBeenCalledWith('v3/channel/channels/ada/unfollow/', {}, undefined)
    })

    /**
     * The four writes `/following` makes carry the account **explicitly**, and only that screen
     * needs them to: it defers the unfollow by five seconds so an Undo can cancel it, which is long
     * enough to use the account switcher. An un-scoped request would then be signed as whoever is
     * active when the timer fires and unfollow the space on the wrong account. See
     * `channelApi.unfollow` and `use-followed-channels.test.tsx`.
     *
     * Absent `accountId` stays `undefined` rather than becoming `{ accountId: null }` — the
     * interceptor reads the active session in that case, which is right for every other caller.
     */
    it('scopes follow, unfollow and the pin routes to an account when given one', async () => {
        post.mockResolvedValue({})

        await channelApi.unfollow('ada', 'acc-1')
        expect(post).toHaveBeenLastCalledWith(
            'v3/channel/channels/ada/unfollow/',
            {},
            {
                accountId: 'acc-1',
            },
        )

        await channelApi.follow('ada', true, 'acc-1')
        expect(post).toHaveBeenLastCalledWith(
            'v3/channel/channels/ada/follow/',
            { notification: true },
            { accountId: 'acc-1' },
        )

        await channelApi.pinChannel('ada', 'acc-1')
        expect(post).toHaveBeenLastCalledWith('v3/channel/channels/ada/pin/', undefined, {
            accountId: 'acc-1',
        })

        await channelApi.unpinChannel('ada', 'acc-1')
        expect(post).toHaveBeenLastCalledWith('v3/channel/channels/ada/unpin/', undefined, {
            accountId: 'acc-1',
        })
    })

    /** The slug comes off the URL, so it is encoded at every use (DoD §8) — pin included. */
    it('encodes the slug in the pin routes', async () => {
        post.mockResolvedValue({})
        await channelApi.pinChannel('a b/c')
        expect(post).toHaveBeenLastCalledWith(
            'v3/channel/channels/a%20b%2Fc/pin/',
            undefined,
            undefined,
        )
    })
})

/*
 * The block/unblock writes themselves are `@shared/lib/api/blocks-api`'s and are tested there. What
 * stays here is the **list**, which is this feature's.
 */
describe('blocks', () => {
    it('sends the first page unfiltered, and omits `q` rather than sending an empty one', async () => {
        get.mockResolvedValue({ results: [], count: 0, next: null })
        await channelApi.getBlockedAccounts({})
        expect(get).toHaveBeenCalledWith(
            'v3/channel/my-channel/blocks/',
            { page: ['1'], page_size: ['20'] },
            { signal: undefined },
        )
    })

    /**
     * The one that would fail silently: page two's params come from the `next` URL, and a `q`
     * dropped there widens the list mid-scroll — filtered rows above, the whole list below,
     * and nothing in the UI to say so.
     */
    it('carries `q` onto a cursor page without disturbing the cursor', async () => {
        get.mockResolvedValue({ results: [], count: 0, next: null })
        await channelApi.getBlockedAccounts({
            cursor: { page: ['3'], page_size: ['20'] },
            q: 'ada',
            accountId: 'acc-1',
        })
        expect(get).toHaveBeenCalledWith(
            'v3/channel/my-channel/blocks/',
            { page: ['3'], page_size: ['20'], q: 'ada' },
            { signal: undefined, accountId: 'acc-1' },
        )
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
