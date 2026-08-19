// @vitest-environment jsdom
import { addOrUpdateAccount, clearTokens, getAccount } from '@shared/lib/api/token'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authKeys } from '../api/auth-api'
import { useUpdateMe } from './use-update-me'

/**
 * The three things this hook promises, none of which are visible from reading the call
 * site: the switch moves before the server answers, it moves *back* if the server
 * refuses, and the account it writes to is the one that was active when it was pressed.
 *
 * The last one is the reason for the test rather than a comment — it is a race, so the
 * only way to state it is to switch accounts while a write is in flight.
 */

const updateMe = vi.hoisted(() => vi.fn())

vi.mock('../api/auth-api', async () => {
    const actual = await vi.importActual<typeof import('../api/auth-api')>('../api/auth-api')
    return { ...actual, authApi: { ...actual.authApi, updateMe } }
})

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

function renderHook() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: ReturnType<typeof useUpdateMe> = { update: () => {}, isPending: false }
    function Probe() {
        api = useUpdateMe()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { queryClient, update: (patch: Record<string, unknown>) => act(() => api.update(patch)) }
}

/** An account that is signed in and cached, which is the only state this hook runs in. */
function seedAccount(id: string, user: Record<string, unknown>) {
    addOrUpdateAccount({
        id,
        access_token: `token-${id}`,
        refresh_token: `refresh-${id}`,
        expires_in: 3600,
        user: { id, ...user },
    })
}

beforeEach(() => {
    localStorage.clear()
    clearTokens()
    updateMe.mockReset()
})

describe('useUpdateMe', () => {
    it('patches the cache before the request settles, then takes the server’s answer', async () => {
        seedAccount('1', { auto_follow: false, display_name: 'Ada' })
        let resolve: (user: Record<string, unknown>) => void = () => {}
        updateMe.mockReturnValue(new Promise(r => (resolve = r)))

        const { queryClient, update } = renderHook()
        const key = authKeys.me('1')
        queryClient.setQueryData(key, { id: '1', auto_follow: false, display_name: 'Ada' })

        // `await act` rather than a bare call: `onMutate` awaits `cancelQueries`, so the
        // optimistic write lands a microtask later — the same frame, but not the same tick.
        await act(async () => {
            update({ auto_follow: true })
        })

        // Optimistic: on, before anything has been answered.
        expect(queryClient.getQueryData(key)).toMatchObject({ auto_follow: true })
        // And shallow — the patch must not drop the fields it did not mention.
        expect(queryClient.getQueryData(key)).toMatchObject({ display_name: 'Ada' })

        // The response is the whole profile, and it wins: here the backend also
        // normalised the name, which a refetch-free optimistic write would have missed.
        await act(async () => {
            resolve({ id: '1', auto_follow: true, display_name: 'Ada Lovelace' })
        })

        await waitFor(() =>
            expect(queryClient.getQueryData(key)).toMatchObject({
                auto_follow: true,
                display_name: 'Ada Lovelace',
            }),
        )
        // Folded into the token store too, or the account switcher would still show the
        // stale name until the next `/me`.
        expect(getAccount('1')?.user).toMatchObject({ display_name: 'Ada Lovelace' })
    })

    it('rolls the change back when the write fails', async () => {
        seedAccount('1', { auto_follow: false })
        updateMe.mockRejectedValue(new Error('nope'))

        const { queryClient, update } = renderHook()
        const key = authKeys.me('1')
        queryClient.setQueryData(key, { id: '1', auto_follow: false })

        await act(async () => {
            update({ auto_follow: true })
        })

        await waitFor(() =>
            expect(queryClient.getQueryData(key)).toMatchObject({ auto_follow: false }),
        )
    })

    it('writes to the account that was active when it was pressed, not when it landed', async () => {
        seedAccount('1', { auto_follow: false })
        let resolve: (user: Record<string, unknown>) => void = () => {}
        updateMe.mockReturnValue(new Promise(r => (resolve = r)))

        const { queryClient, update } = renderHook()
        queryClient.setQueryData(authKeys.me('1'), { id: '1', auto_follow: false })

        update({ auto_follow: true })

        // The visitor switches accounts mid-flight. `addOrUpdateAccount` makes the new
        // one active, so anything reading "the active account" now answers 2.
        seedAccount('2', { auto_follow: false })
        queryClient.setQueryData(authKeys.me('2'), { id: '2', auto_follow: false })

        await act(async () => {
            resolve({ id: '1', auto_follow: true })
        })

        await waitFor(() =>
            expect(queryClient.getQueryData(authKeys.me('1'))).toMatchObject({ auto_follow: true }),
        )
        // Account 2 never asked for this.
        expect(queryClient.getQueryData(authKeys.me('2'))).toMatchObject({ auto_follow: false })
        // And the request itself was pinned to account 1.
        expect(updateMe).toHaveBeenCalledWith({ auto_follow: true }, '1')
    })
})

describe('useUpdateMe — a response that is not a profile', () => {
    /**
     * The endpoint is *documented* to answer with the whole user. If it ever answers with
     * an acknowledgement instead, folding that over the cache would blank the signed-in
     * account's name, avatar and id — from a settings toggle.
     */
    it('keeps the optimistic value and refetches instead of blanking the user', async () => {
        seedAccount('1', { auto_follow: false, display_name: 'Ada' })
        updateMe.mockResolvedValue({})

        const { queryClient, update } = renderHook()
        const key = authKeys.me('1')
        queryClient.setQueryData(key, { id: '1', auto_follow: false, display_name: 'Ada' })
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await act(async () => {
            update({ auto_follow: true })
        })

        await waitFor(() =>
            expect(queryClient.getQueryData(key)).toMatchObject({
                id: '1',
                auto_follow: true,
                display_name: 'Ada',
            }),
        )
        expect(invalidate).toHaveBeenCalledWith({ queryKey: key })
    })
})
