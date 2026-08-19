// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { addOrUpdateAccount, clearTokens } from '@shared/lib/api/token'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { channelKeys } from '../api/channel-api'
import type { Channel, ChannelPrivacy } from '../api/types'
import { useUpdatePrivacy } from './use-update-privacy'

/**
 * What this hook promises, none of which is visible from its call site: the radio moves
 * before the server answers, it moves *back* if the server refuses, the write lands on the
 * account that was active when it was pressed, and the value written is the one the server
 * **acknowledged** rather than the one that was asked for.
 *
 * The 429 case is here because it is the only failure in the app that gets its own sentence,
 * and the reason is a product rule (one visibility change per 24 hours) rather than anything
 * a reader could infer from the code — see B24.
 */

const updatePrivacy = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())

vi.mock('../api/channel-api', async () => {
    const actual = await vi.importActual<typeof import('../api/channel-api')>('../api/channel-api')
    return { ...actual, channelApi: { ...actual.channelApi, updatePrivacy } }
})

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

const SLUG = 'ada'

function renderHook(slug: string | null | undefined = SLUG) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: ReturnType<typeof useUpdatePrivacy> = {
        update: () => {},
        isPending: false,
        writing: null,
    }
    function Probe() {
        api = useUpdatePrivacy(slug)
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return {
        queryClient,
        update: (privacy: ChannelPrivacy) => act(() => api.update(privacy)),
        read: () => api,
    }
}

/** Enough of a `Channel` to prove the patch is shallow rather than a replacement. */
function seedChannel(queryClient: QueryClient, accountId: string, privacy: ChannelPrivacy) {
    const channel = { id: 'c1', slug: SLUG, name: 'Ada', privacy } as unknown as Channel
    queryClient.setQueryData(channelKeys.myChannel(accountId), channel)
    return channel
}

/** The profile page's own copy — `/@{slug}`, and the key the publish banner renders from. */
function seedDetail(queryClient: QueryClient, accountId: string, privacy: ChannelPrivacy) {
    const channel = { id: 'c1', slug: SLUG, name: 'Ada', privacy } as unknown as Channel
    queryClient.setQueryData(channelKeys.detail(SLUG, accountId), channel)
    return channel
}

function seedAccount(id: string) {
    addOrUpdateAccount({
        id,
        access_token: `token-${id}`,
        refresh_token: `refresh-${id}`,
        expires_in: 3600,
        user: { id },
    })
}

beforeEach(() => {
    localStorage.clear()
    clearTokens()
    updatePrivacy.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
})

describe('useUpdatePrivacy', () => {
    it('moves the selection before the request settles, and patches only `privacy`', async () => {
        seedAccount('1')
        let resolve: (value: ChannelPrivacy | null) => void = () => {}
        updatePrivacy.mockReturnValue(new Promise(r => (resolve = r)))

        const { queryClient, update, read } = renderHook()
        seedChannel(queryClient, '1', 'public')
        const key = channelKeys.myChannel('1')

        // `await act`: `onMutate` awaits `cancelQueries`, so the optimistic write lands a
        // microtask later.
        await act(async () => {
            update('protected')
        })

        expect(queryClient.getQueryData<Channel>(key)).toMatchObject({ privacy: 'protected' })
        // Shallow — the acknowledgement is `{ privacy }`, and folding a whole body over the
        // cache would blank the account's own slug and name from a settings change.
        expect(queryClient.getQueryData<Channel>(key)).toMatchObject({ slug: SLUG, name: 'Ada' })
        // And the card knows which option it is waiting on. `waitFor`, because the mutation's
        // own pending state lands on a later render than the optimistic cache write does.
        await waitFor(() => expect(read().writing).toBe('protected'))

        await act(async () => {
            resolve('protected')
        })
        await waitFor(() => expect(read().writing).toBeNull())
        expect(toastSuccess).toHaveBeenCalledWith('space_visibility_updated')
    })

    it('rolls the selection back when the write fails, and says why', async () => {
        seedAccount('1')
        updatePrivacy.mockRejectedValue(new ApiError({ message: 'nope', status: 500 }))

        const { queryClient, update } = renderHook()
        seedChannel(queryClient, '1', 'public')
        const key = channelKeys.myChannel('1')

        await act(async () => {
            update('unpublished')
        })

        await waitFor(() =>
            expect(queryClient.getQueryData<Channel>(key)).toMatchObject({ privacy: 'public' }),
        )
        expect(toastError).toHaveBeenCalledWith('settings_update_failed')
    })

    /**
     * The one failure in this app that does not get the generic line. "Try again" is actively
     * wrong advice for a limit that lasts a day, and the sentence is still ours — the backend's
     * own message never reaches the screen.
     */
    it('names the 24-hour limit on a 429 instead of telling them to try again', async () => {
        seedAccount('1')
        updatePrivacy.mockRejectedValue(new ApiError({ message: 'slow down', status: 429 }))

        const { queryClient, update } = renderHook()
        seedChannel(queryClient, '1', 'public')

        await act(async () => {
            update('protected')
        })

        await waitFor(() =>
            expect(toastError).toHaveBeenCalledWith('space_visibility_rate_limited'),
        )
        expect(toastError).not.toHaveBeenCalledWith('settings_update_failed')
    })

    /** The app's own abort is not news to anyone. */
    it('stays quiet when the request was cancelled', async () => {
        seedAccount('1')
        updatePrivacy.mockRejectedValue(new ApiError({ message: 'aborted', isCanceled: true }))

        const { queryClient, update } = renderHook()
        seedChannel(queryClient, '1', 'public')

        await act(async () => {
            update('protected')
        })

        await waitFor(() =>
            expect(queryClient.getQueryData<Channel>(channelKeys.myChannel('1'))).toMatchObject({
                privacy: 'public',
            }),
        )
        expect(toastError).not.toHaveBeenCalled()
    })

    it('writes to the account that was active when it was pressed, not when it landed', async () => {
        seedAccount('1')
        let resolve: (value: ChannelPrivacy | null) => void = () => {}
        updatePrivacy.mockReturnValue(new Promise(r => (resolve = r)))

        const { queryClient, update } = renderHook()
        seedChannel(queryClient, '1', 'public')

        await act(async () => {
            update('protected')
        })

        // The visitor switches accounts mid-flight; `addOrUpdateAccount` makes the new one
        // active, so anything reading "the active account" now answers 2.
        seedAccount('2')
        seedChannel(queryClient, '2', 'public')

        await act(async () => {
            resolve('protected')
        })

        await waitFor(() =>
            expect(queryClient.getQueryData<Channel>(channelKeys.myChannel('1'))).toMatchObject({
                privacy: 'protected',
            }),
        )
        // Account 2 never asked for this.
        expect(queryClient.getQueryData<Channel>(channelKeys.myChannel('2'))).toMatchObject({
            privacy: 'public',
        })
        expect(updatePrivacy).toHaveBeenCalledWith('protected', '1')
    })

    /**
     * `parseAckPrivacy` answers `null` for a body this client cannot read — deliberately not
     * the read path's fail-closed `'protected'`, which would tell someone who picked *public*
     * that their space is now protected. The hook's half of that contract is to keep what is on
     * screen and go and ask.
     */
    it('keeps the optimistic value and refetches when the acknowledgement is unreadable', async () => {
        seedAccount('1')
        updatePrivacy.mockResolvedValue(null)

        const { queryClient, update } = renderHook()
        seedChannel(queryClient, '1', 'public')
        const key = channelKeys.myChannel('1')
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await act(async () => {
            update('protected')
        })

        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: key }))
        expect(queryClient.getQueryData<Channel>(key)).toMatchObject({ privacy: 'protected' })
    })

    /**
     * If the backend ever clamps a transition, the screen has to show what happened rather than
     * what was asked for. The hook writes the acknowledgement, not the request.
     */
    it('writes the acknowledged value when it differs from the requested one', async () => {
        seedAccount('1')
        updatePrivacy.mockResolvedValue('protected')

        const { queryClient, update } = renderHook()
        seedChannel(queryClient, '1', 'public')

        await act(async () => {
            update('unpublished')
        })

        await waitFor(() =>
            expect(queryClient.getQueryData<Channel>(channelKeys.myChannel('1'))).toMatchObject({
                privacy: 'protected',
            }),
        )
    })

    /**
     * `channelKeys.detail` is a second copy of the same channel — the one `/@{slug}` renders,
     * and the one whose visibility decides the owner's publish banner. Leaving it stale means
     * changing the setting here and finding the profile page still insisting otherwise.
     */
    it('invalidates the public copy of the channel too', async () => {
        seedAccount('1')
        updatePrivacy.mockResolvedValue('protected')

        const { queryClient, update } = renderHook()
        seedChannel(queryClient, '1', 'public')
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await act(async () => {
            update('protected')
        })

        await waitFor(() =>
            expect(invalidate).toHaveBeenCalledWith({
                queryKey: channelKeys.detail(SLUG, '1'),
            }),
        )
    })

    /**
     * The optimistic half of the same point, and the one that was missing.
     *
     * The publish banner is rendered from `detail(slug)`, not from `my-channel`. With only the
     * invalidation, pressing Publish left it on screen for the whole round trip still saying
     * "Unpublished" — and `isPending` goes false when the mutation settles rather than when the
     * refetch lands, so the button re-armed over a change that had already succeeded. The
     * second press is what the backend answers with the 24-hour limit.
     */
    it('moves the profile page too, not just `my-channel`', async () => {
        seedAccount('1')
        let resolve: (value: ChannelPrivacy | null) => void = () => {}
        updatePrivacy.mockReturnValue(new Promise(r => (resolve = r)))

        const { queryClient, update } = renderHook()
        seedChannel(queryClient, '1', 'unpublished')
        seedDetail(queryClient, '1', 'unpublished')

        await act(async () => {
            update('public')
        })

        // Before the server has answered — this is the banner disappearing on the press.
        expect(queryClient.getQueryData<Channel>(channelKeys.detail(SLUG, '1'))).toMatchObject({
            privacy: 'public',
            slug: SLUG,
            name: 'Ada',
        })

        await act(async () => {
            resolve('public')
        })
    })

    /**
     * The rollback half. Written against a *deferred* rejection rather than an immediate one
     * so it asserts the optimistic value first: with `mockRejectedValue` the entry is already
     * back to `unpublished` by the time the assertion runs, and the test would pass just as
     * happily against a version that never patched `detail` at all.
     */
    it('puts the profile page back when the write fails', async () => {
        seedAccount('1')
        let reject: (error: unknown) => void = () => {}
        updatePrivacy.mockReturnValue(new Promise((_, r) => (reject = r)))

        const { queryClient, update } = renderHook()
        seedChannel(queryClient, '1', 'unpublished')
        seedDetail(queryClient, '1', 'unpublished')

        await act(async () => {
            update('public')
        })

        expect(queryClient.getQueryData<Channel>(channelKeys.detail(SLUG, '1'))).toMatchObject({
            privacy: 'public',
        })

        await act(async () => {
            reject(new ApiError({ message: 'nope', status: 500 }))
        })

        await waitFor(() =>
            expect(queryClient.getQueryData<Channel>(channelKeys.detail(SLUG, '1'))).toMatchObject({
                privacy: 'unpublished',
            }),
        )
    })

    it('skips that invalidation when the slug is not known yet', async () => {
        seedAccount('1')
        updatePrivacy.mockResolvedValue('protected')

        const { queryClient, update } = renderHook(null)
        seedChannel(queryClient, '1', 'public')
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await act(async () => {
            update('protected')
        })

        await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
        expect(invalidate).not.toHaveBeenCalled()
    })
})
