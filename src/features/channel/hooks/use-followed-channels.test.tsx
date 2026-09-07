// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOLLOWING_WARN_AT, type FollowedChannelsPage } from '../lib/following-page'
import { useFollowedChannels } from './use-followed-channels'

/**
 * What a comment cannot pin about this hook, all of it *timing*, none of it visible as a failure in
 * a browser:
 *
 * 1. **The unfollow is deferred, not undone.** The press hides the row and schedules the POST five
 *    seconds later; Undo cancels the timer, so nothing is ever sent. Getting this wrong the obvious
 *    way — POST now, re-follow on Undo — silently downgrades an established follow on a *protected*
 *    space into a pending request, and the reader loses access by pressing the button that promised
 *    to give it back.
 * 2. **Leaving mid-window sends it.** Legacy's cleanup is `clearTimeout` alone, so navigating away
 *    inside those five seconds loses the unfollow entirely: the row is gone from the screen and the
 *    space is still followed the next time the list loads. Nothing about that looks broken.
 * 3. **Two windows can be open at once**, each with its own Undo — legacy commits the first when the
 *    second is pressed.
 * 4. **The ordering is in the query key**, so switching sort is a different list rather than the
 *    same one overwritten.
 */

const getFollowedChannels = vi.hoisted(() => vi.fn())
const unfollow = vi.hoisted(() => vi.fn())
const follow = vi.hoisted(() => vi.fn())
const pinChannel = vi.hoisted(() => vi.fn())
const unpinChannel = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ state: { activeId: 'acc-1', isAuthenticated: true } }))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))
vi.mock('../api/channel-api', async () => {
    const actual = await vi.importActual<typeof import('../api/channel-api')>('../api/channel-api')
    return {
        ...actual,
        channelApi: {
            ...actual.channelApi,
            getFollowedChannels,
            unfollow,
            follow,
            pinChannel,
            unpinChannel,
        },
    }
})

/**
 * Rows with slugs only — nothing here reads anything else off them. `next: null` is the API saying
 * "last page", so nothing built by this asks for a second one.
 */
function page(slugs: string[]): FollowedChannelsPage {
    return {
        results: slugs.map(slug => ({
            id: `id-${slug}`,
            slug,
            name: slug,
            images: { thumb: null, cover: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
            last_activity_at: null,
            pin: false,
            notification_settings: null,
        })) as FollowedChannelsPage['results'],
        count: slugs.length,
        next: null,
    }
}

/**
 * A full page whose payload carries **no `next` key at all** — the case the short-page rule exists
 * for, and the only way to get `hasNextPage` true out of these helpers.
 *
 * Its own function rather than a `next` parameter on `page`, and that is not style: `next` is
 * `string | null | undefined` and all three mean different things (`paged-list.ts` is written at
 * length about it), so a **default parameter cannot express it** — `page(slugs, undefined)` takes
 * the default, which is exactly the `null` that stops paging. Cost me a debugging round; hence the
 * two functions.
 */
function pageWithMore(slugs: string[]): FollowedChannelsPage {
    return { ...page(slugs), next: undefined }
}

function mount() {
    /* `staleTime` mirrors the app's own client (`shared/lib/api/query-client.ts`). */
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    })
    let api!: ReturnType<typeof useFollowedChannels>
    function Probe() {
        api = useFollowedChannels()
        return null
    }
    const view = render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return {
        /** Always the latest render's value — the callbacks close over the pending state. */
        read: () => api,
        slugs: () => api.entries.map(entry => entry.slug),
        /** Slugs the reader can still see: a row inside its undo window is not one of them. */
        visible: () =>
            api.entries.filter(entry => !api.exitingSlugs.has(entry.slug)).map(e => e.slug),
        /**
         * Let pending promises resolve and React re-render. `waitFor` is not usable here — it polls
         * on timers this file has faked, so it would spin until the test times out. Every request
         * resolves immediately, so advancing by zero flushes the microtask queue.
         */
        flush: async () => {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0)
            })
        },
        /** Past the undo window, which is when the request actually goes out. */
        settle: async () => {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000)
            })
        },
        unmount: view.unmount,
    }
}

/**
 * The `action.onClick` sonner was handed for a given slug's toast — i.e. what pressing Undo runs.
 *
 * It throws rather than returning a no-op when there is no such toast: a missing Undo is the failure
 * these tests exist to catch, and a silently absent one would make every assertion below pass.
 */
function undoFor(slug: string): () => void {
    const call = toastSuccess.mock.calls.findLast(
        ([, options]) => (options as { id?: string })?.id === `following-undo-${slug}`,
    )
    const action = (call?.[1] as { action?: { onClick: () => void } } | undefined)?.action
    if (!action) throw new Error(`no undo toast for ${slug}`)
    return action.onClick
}

beforeEach(() => {
    vi.useFakeTimers()
    auth.state = { activeId: 'acc-1', isAuthenticated: true }
    getFollowedChannels.mockReset().mockResolvedValue(page(['ada', 'grace', 'lin']))
    unfollow.mockReset().mockResolvedValue({})
    follow.mockReset().mockResolvedValue({})
    pinChannel.mockReset().mockResolvedValue({})
    unpinChannel.mockReset().mockResolvedValue({})
    toastSuccess.mockReset()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('useFollowedChannels — the deferred unfollow', () => {
    it('hides the row at once and sends nothing yet', async () => {
        const probe = mount()
        await probe.flush()

        act(() => probe.read().unfollow(probe.read().entries[0]))
        expect(probe.visible()).toEqual(['grace', 'lin'])
        // The row is still in the cache — that is what makes Undo a state change, not a re-insert.
        expect(probe.slugs()).toEqual(['ada', 'grace', 'lin'])
        expect(unfollow).not.toHaveBeenCalled()
    })

    /**
     * **The account is carried with the request, not read when it fires.** Five seconds is long
     * enough to use the account switcher, and an un-scoped POST would unfollow the space on
     * whichever account happens to be active by then — see `channelApi.unfollow`.
     */
    it('sends it once the window closes, scoped to the account that pressed it', async () => {
        const probe = mount()
        await probe.flush()

        act(() => probe.read().unfollow(probe.read().entries[0]))
        await probe.settle()

        expect(unfollow).toHaveBeenCalledWith('ada', 'acc-1')
        expect(probe.slugs()).toEqual(['grace', 'lin'])
    })

    /**
     * The point of the whole design: an Undo inside the window means **no request was ever made**,
     * so a protected space's follow is untouched rather than re-requested.
     */
    it('sends nothing at all when Undo is pressed', async () => {
        const probe = mount()
        await probe.flush()

        act(() => probe.read().unfollow(probe.read().entries[0]))
        act(() => undoFor('ada')())

        expect(probe.visible()).toEqual(['ada', 'grace', 'lin'])
        await probe.settle()
        expect(unfollow).not.toHaveBeenCalled()
        expect(follow).not.toHaveBeenCalled()
    })

    /** Legacy's bug: `clearTimeout` on unmount, so the unfollow is lost and the space stays followed. */
    it('flushes on unmount rather than cancelling', async () => {
        const probe = mount()
        await probe.flush()

        act(() => probe.read().unfollow(probe.read().entries[0]))
        act(() => probe.unmount())

        expect(unfollow).toHaveBeenCalledWith('ada', 'acc-1')
    })

    /** Legacy commits the first window when the second row is pressed; both run here. */
    it('keeps a separate window per row', async () => {
        const probe = mount()
        await probe.flush()

        act(() => probe.read().unfollow(probe.read().entries[0]))
        act(() => probe.read().unfollow(probe.read().entries[1]))
        expect(probe.visible()).toEqual(['lin'])
        expect(unfollow).not.toHaveBeenCalled()

        // Undo the second; the first still commits on its own timer.
        act(() => undoFor('grace')())
        await probe.settle()
        expect(unfollow.mock.calls).toEqual([['ada', 'acc-1']])
    })

    it('ignores a second press inside the window instead of stacking a timer', async () => {
        const probe = mount()
        await probe.flush()

        const row = probe.read().entries[0]
        act(() => probe.read().unfollow(row))
        act(() => probe.read().unfollow(row))
        await probe.settle()

        expect(unfollow.mock.calls).toEqual([['ada', 'acc-1']])
    })

    /** Unfollowing the last row has to land on the empty state, not on an empty list. */
    it('reads as empty once every row is inside its window', async () => {
        getFollowedChannels.mockResolvedValue(page(['ada']))
        const probe = mount()
        await probe.flush()

        act(() => probe.read().unfollow(probe.read().entries[0]))
        expect(probe.read().isEmpty).toBe(true)
    })
})

describe('useFollowedChannels — pin and mute', () => {
    /**
     * The bug this replaced, and the reason the reorder is the client's:
     *
     * `POST .../pin/` returns before `GET followed-channels/` can see the write, so the invalidation
     * that used to follow it refetched the **pre-pin** order — the row un-pinned itself a beat after
     * the press. The test that stood here even encoded the symptom, holding the request in flight
     * because "a test that flushed fully would be asserting the server's answer".
     *
     * So this flushes fully on purpose. The mock's page still says `pin: false` and the row must be
     * pinned anyway, because nothing refetches.
     */
    it('pins optimistically and the state survives the request resolving', async () => {
        const probe = mount()
        await probe.flush()

        act(() => probe.read().togglePin(probe.read().entries[0]))
        await probe.flush()

        expect(pinChannel).toHaveBeenCalledWith('ada', 'acc-1')
        expect(unpinChannel).not.toHaveBeenCalled()
        expect(probe.read().entries[0]?.pin).toBe(true)
        // One request, and no second read of the list behind it.
        expect(getFollowedChannels).toHaveBeenCalledTimes(1)
    })

    /** The move, not just the flag: pressing Pin on the last row puts it first. */
    it('moves the pinned row to the top of the list', async () => {
        const probe = mount()
        await probe.flush()
        expect(probe.slugs()).toEqual(['ada', 'grace', 'lin'])

        act(() => probe.read().togglePin(probe.read().entries[2]))
        await probe.flush()

        expect(probe.slugs()).toEqual(['lin', 'ada', 'grace'])
        expect(probe.read().entries[0]?.pin).toBe(true)
    })

    /**
     * Both cache entries, because the two sort orders are two of them and a 60s `staleTime` is long
     * enough for a reader to pin something, flip the sort, and find it unpinned.
     */
    it('applies the pin to the other ordering too', async () => {
        const probe = mount()
        await probe.flush()
        // Load the second ordering, then come back and pin from the first.
        act(() => probe.read().setOrdering('-follows__created_at'))
        await probe.flush()
        act(() => probe.read().setOrdering('-last_activity_at'))
        await probe.flush()

        act(() => probe.read().togglePin(probe.read().entries[2]))
        await probe.flush()

        act(() => probe.read().setOrdering('-follows__created_at'))
        await probe.flush()
        expect(probe.slugs()).toEqual(['lin', 'ada', 'grace'])
        expect(probe.read().entries[0]?.pin).toBe(true)
    })

    /** Optimistic, so a failure has to put the row back exactly as it was. */
    it('rolls the pin back when the write fails', async () => {
        pinChannel.mockRejectedValue(new Error('nope'))
        const probe = mount()
        await probe.flush()

        act(() => probe.read().togglePin(probe.read().entries[0]))
        await probe.flush()

        expect(probe.read().entries[0]?.pin).toBe(false)
    })

    /**
     * Mute is the **`follow/` endpoint with the flag**, not a route of its own — the trap
     * `channelApi.follow` is written at length about. `notification` is the value being written, so
     * muting an unmuted row sends `false`.
     */
    it('mutes through follow() with notification false', async () => {
        const probe = mount()
        await probe.flush()

        act(() => probe.read().toggleMute(probe.read().entries[0]))
        await probe.flush()
        expect(follow).toHaveBeenCalledWith('ada', false, 'acc-1')
    })

    it('unmutes a muted row with notification true', async () => {
        getFollowedChannels.mockResolvedValue({
            ...page(['ada']),
            results: page(['ada']).results.map(row => ({
                ...row,
                notification_settings: { notification: false },
            })),
        })
        const probe = mount()
        await probe.flush()

        act(() => probe.read().toggleMute(probe.read().entries[0]))
        await probe.flush()
        expect(follow).toHaveBeenCalledWith('ada', true, 'acc-1')
    })

    /** The list is single-flight: `isPending` describes the most recent run only. */
    it('refuses a second write while one is in flight', async () => {
        let release!: () => void
        pinChannel.mockReturnValue(
            new Promise(resolve => {
                release = () => resolve({})
            }),
        )
        const probe = mount()
        await probe.flush()

        act(() => probe.read().togglePin(probe.read().entries[0]))
        await probe.flush()
        expect(probe.read().pendingSlug).toBe('ada')

        act(() => probe.read().toggleMute(probe.read().entries[1]))
        await probe.flush()
        expect(follow).not.toHaveBeenCalled()

        await act(async () => {
            release()
            await vi.advanceTimersByTimeAsync(0)
        })
    })
})

describe('useFollowedChannels — ordering', () => {
    it('asks with the default ordering first', async () => {
        const probe = mount()
        await probe.flush()
        expect(getFollowedChannels).toHaveBeenCalledWith(
            expect.objectContaining({ ordering: '-last_activity_at' }),
        )
    })

    /**
     * The ordering is in the query key, so the second sort is its own cache entry — which is what
     * makes switching back instant instead of a request, and stops one list overwriting the other.
     */
    it('re-requests with the new ordering and keeps both lists', async () => {
        const probe = mount()
        await probe.flush()

        act(() => probe.read().setOrdering('-follows__created_at'))
        await probe.flush()

        expect(getFollowedChannels).toHaveBeenLastCalledWith(
            expect.objectContaining({ ordering: '-follows__created_at' }),
        )
        expect(getFollowedChannels).toHaveBeenCalledTimes(2)

        // Back to the first: served from cache inside the `staleTime`, so no third request.
        act(() => probe.read().setOrdering('-last_activity_at'))
        await probe.flush()
        expect(getFollowedChannels).toHaveBeenCalledTimes(2)
    })
})

describe('useFollowedChannels — re-sorting keeps the rows on screen', () => {
    /**
     * The failure this catches: the ordering is part of the query key, so without
     * `placeholderData: keepPreviousData` the second sort is a **cold** query — `isLoading` goes
     * true and the rows the reader is looking at are replaced by the skeleton, for an operation they
     * think of as re-arranging what is in front of them.
     */
    it('does not empty the list or re-enter loading while the new ordering is in flight', async () => {
        let release!: () => void
        const probe = mount()
        await probe.flush()
        expect(probe.slugs()).toEqual(['ada', 'grace', 'lin'])

        getFollowedChannels.mockReturnValue(
            new Promise(resolve => {
                release = () => resolve(page(['lin', 'ada', 'grace']))
            }),
        )
        act(() => probe.read().setOrdering('-follows__created_at'))
        await probe.flush()

        // The previous ordering's rows are still there, and the screen says it is working.
        expect(probe.slugs()).toEqual(['ada', 'grace', 'lin'])
        expect(probe.read().isLoading).toBe(false)
        expect(probe.read().isReordering).toBe(true)

        await act(async () => {
            release()
            await vi.advanceTimersByTimeAsync(0)
        })
        expect(probe.slugs()).toEqual(['lin', 'ada', 'grace'])
        expect(probe.read().isReordering).toBe(false)
    })

    /**
     * `hasNextPage` describes the *previous* ordering while its rows are standing in, so a sentinel
     * scrolled into view would ask the new query for a page counted off the old one's cursor.
     */
    it('refuses to paginate while the standing-in rows are the old ordering', async () => {
        getFollowedChannels
            .mockReset()
            .mockResolvedValue(pageWithMore(Array.from({ length: 20 }, (_, i) => `s${i}`)))
        const probe = mount()
        await probe.flush()
        expect(probe.read().hasNextPage).toBe(true)

        getFollowedChannels.mockReturnValue(new Promise(() => {}))
        act(() => probe.read().setOrdering('-follows__created_at'))
        await probe.flush()

        const before = getFollowedChannels.mock.calls.length
        act(() => probe.read().loadMore())
        await probe.flush()
        expect(getFollowedChannels.mock.calls.length).toBe(before)
    })
})

describe('useFollowedChannels — the account', () => {
    it('asks nothing at all for an anonymous session', async () => {
        auth.state = { activeId: null as unknown as string, isAuthenticated: false }
        const probe = mount()
        await probe.flush()

        expect(getFollowedChannels).not.toHaveBeenCalled()
        expect(probe.read().isSignedOut).toBe(true)
    })
})

/**
 * The follow-limit notice. It reads `count` off the **envelope**, not the number of rows loaded —
 * page one carries a total of 901 while holding three — and it is a *notice*: nothing here stops a
 * follow, because the Follow button is on the channel page and this screen cannot refuse anything.
 *
 * Worth a test because the state needs an account following 901 spaces to reach, so nothing else
 * exercises it. `FOLLOWING_WARN_AT` is the threshold; the numbers in the sentence come from the same
 * module, which is what stops the copy and the trigger drifting apart.
 */
describe('useFollowedChannels — the follow limit', () => {
    const withCount = (count: number) => ({ ...page(['ada', 'grace', 'lin']), count })

    it('warns past the threshold, on the envelope total rather than the rows loaded', async () => {
        getFollowedChannels.mockResolvedValue(withCount(FOLLOWING_WARN_AT + 1))
        const probe = mount()
        await probe.flush()

        expect(probe.read().total).toBe(FOLLOWING_WARN_AT + 1)
        expect(probe.read().entries).toHaveLength(3)
        expect(probe.read().isOverLimit).toBe(true)
    })

    it('says nothing at the threshold itself', async () => {
        getFollowedChannels.mockResolvedValue(withCount(FOLLOWING_WARN_AT))
        const probe = mount()
        await probe.flush()
        expect(probe.read().isOverLimit).toBe(false)
    })

    it('says nothing for an ordinary account', async () => {
        const probe = mount()
        await probe.flush()
        expect(probe.read().isOverLimit).toBe(false)
    })
})
