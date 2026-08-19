// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { affiliateKeys } from '../api/affiliate-api'
import type { Program } from '../api/types'
import { useAffiliateActions } from './use-affiliate-actions'

/**
 * Four promises this hook makes that no call site can see:
 *
 * 1. **A switch is a leave and then a join, in that order.** Sequential, not parallel — if the leave
 *    fails the join must not happen, or the creator promotes neither program.
 * 2. **A plain join does not leave anything.** The leave is issued only when a *different* program is
 *    running; a stale `promotingId` equal to the target must not turn a re-join into leave-then-join.
 * 3. **The banner's own copy of `user_joined` is invalidated too.** It lives on a different service
 *    (`dapp-campaign`), so without that the card still says "Join now" after a join.
 * 4. **The account is pinned when the button is pressed**, not read when the response lands.
 */

const joinProgram = vi.hoisted(() => vi.fn())
const leaveProgram = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({ state: { activeId: 'acc-1' as string | null } }))

vi.mock('@features/auth', () => ({ useAuth: () => auth.state }))
vi.mock('@features/campaign', () => ({
    campaignKeys: {
        all: ['campaign'],
        list: (accountId: string | null) => ['campaign', 'list', accountId ?? 'anon'],
    },
}))
vi.mock('../api/affiliate-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/affiliate-api')>('../api/affiliate-api')
    return { ...actual, affiliateApi: { joinProgram, leaveProgram } }
})

const TARGET = { id: 'p2', name: 'Coin Rush' } as Program

function renderActions(promotingId: string | null) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidated: unknown[] = []
    queryClient.invalidateQueries = vi.fn(async (filters?: { queryKey?: unknown }) => {
        invalidated.push(filters?.queryKey)
    }) as unknown as typeof queryClient.invalidateQueries

    const onJoined = vi.fn()
    const onLeft = vi.fn()
    let api: ReturnType<typeof useAffiliateActions> | null = null

    function Probe() {
        api = useAffiliateActions({ promotingId, onJoined, onLeft })
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )

    return {
        invalidated,
        onJoined,
        onLeft,
        get current() {
            if (!api) throw new Error('probe did not render')
            return api
        },
    }
}

beforeEach(() => {
    joinProgram.mockReset()
    leaveProgram.mockReset()
    joinProgram.mockResolvedValue({ program: TARGET, referralUrl: 'https://t.ev/r' })
    leaveProgram.mockResolvedValue(undefined)
    auth.state = { activeId: 'acc-1' }
})

describe('joining', () => {
    it('does not leave anything when nothing is being promoted', async () => {
        const probe = renderActions(null)
        probe.current.join(TARGET)

        await waitFor(() => expect(probe.onJoined).toHaveBeenCalled())
        expect(leaveProgram).not.toHaveBeenCalled()
        expect(joinProgram).toHaveBeenCalledWith('p2', { accountId: 'acc-1' })
    })

    it('does not leave when the program being joined is the one already promoted', async () => {
        const probe = renderActions('p2')
        probe.current.join(TARGET)

        await waitFor(() => expect(probe.onJoined).toHaveBeenCalled())
        expect(leaveProgram).not.toHaveBeenCalled()
    })

    it('leaves the other program first when switching, and waits for it', async () => {
        const order: string[] = []
        leaveProgram.mockImplementation(async () => {
            order.push('leave')
        })
        joinProgram.mockImplementation(async () => {
            order.push('join')
            return { program: TARGET, referralUrl: null }
        })

        const probe = renderActions('p1')
        probe.current.join(TARGET)

        await waitFor(() => expect(probe.onJoined).toHaveBeenCalled())
        expect(order).toEqual(['leave', 'join'])
    })

    it('does not join when the leave fails', async () => {
        leaveProgram.mockRejectedValue(new Error('nope'))

        const probe = renderActions('p1')
        probe.current.join(TARGET)

        await waitFor(() => expect(probe.current.isJoining).toBe(false))
        expect(joinProgram).not.toHaveBeenCalled()
        expect(probe.onJoined).not.toHaveBeenCalled()
    })

    it('keeps the program that was pressed when the write answers without one', async () => {
        joinProgram.mockResolvedValue({ program: null, referralUrl: 'https://t.ev/r' })

        const probe = renderActions(null)
        probe.current.join(TARGET)

        await waitFor(() => expect(probe.onJoined).toHaveBeenCalled())
        expect(probe.onJoined).toHaveBeenCalledWith({
            program: TARGET,
            referralUrl: 'https://t.ev/r',
        })
    })

    it('invalidates its own data and the banner’s copy on the other service', async () => {
        const probe = renderActions(null)
        probe.current.join(TARGET)

        await waitFor(() => expect(probe.onJoined).toHaveBeenCalled())
        expect(probe.invalidated).toEqual([affiliateKeys.all, ['campaign', 'list', 'acc-1']])
    })
})

describe('leaving', () => {
    it('invalidates both roots and reports back', async () => {
        const probe = renderActions('p1')
        probe.current.leave()

        await waitFor(() => expect(probe.onLeft).toHaveBeenCalled())
        expect(leaveProgram).toHaveBeenCalledWith({ accountId: 'acc-1' })
        expect(probe.invalidated).toEqual([affiliateKeys.all, ['campaign', 'list', 'acc-1']])
    })
})

describe('the account', () => {
    it('is the one that was active when the button was pressed', async () => {
        const probe = renderActions(null)
        probe.current.join(TARGET)
        // Switching mid-flight must not refile the write under the other account's key.
        auth.state = { activeId: 'acc-2' }

        await waitFor(() => expect(probe.onJoined).toHaveBeenCalled())
        expect(joinProgram).toHaveBeenCalledWith('p2', { accountId: 'acc-1' })
        expect(probe.invalidated).toContainEqual(['campaign', 'list', 'acc-1'])
    })
})
