// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeReply, type Reply } from '../api/reply-types'

/** Every call, in order — the same recorder `use-create-reply.test.tsx` uses and for the same reason. */
const calls: string[] = []

const reactToReply = vi.fn((id: string, _accountId: string | null) => {
    calls.push(`react:${id}`)
    return Promise.resolve({})
})
const unreactFromReply = vi.fn((id: string, _accountId: string | null) => {
    calls.push(`unreact:${id}`)
    return Promise.resolve({})
})
const chargeInteraction = vi.fn(
    (charge: { product: string; channelId: string }, _accountId: string | null) => {
        calls.push(`charge:${charge.product}:${charge.channelId}`)
        return Promise.resolve({})
    },
)
vi.mock('../api/post-api', () => ({
    postApi: {
        reactToReply: (id: string, accountId: string | null) => reactToReply(id, accountId),
        unreactFromReply: (id: string, accountId: string | null) => unreactFromReply(id, accountId),
        chargeInteraction: (
            charge: { product: string; channelId: string },
            accountId: string | null,
        ) => chargeInteraction(charge, accountId),
    },
    postKeys: { all: ['post'] },
}))

const balance = { affordable: true }
const offerStars = vi.fn()
vi.mock('@features/balance', () => ({
    balanceKeys: { all: ['balance'] },
    useRequireStars:
        () =>
        <A extends unknown[]>(_cost: number, cb: (...args: A) => void) =>
        (...args: A) => {
            if (!auth.isAuthenticated) {
                openLoginDialog()
                return
            }
            if (!balance.affordable) {
                offerStars()
                return
            }
            cb(...args)
        },
}))

const auth = { isAuthenticated: true, activeId: 'acc-1' as string | null }
const openLoginDialog = vi.fn()
vi.mock('@features/auth', () => ({
    useAuth: () => auth,
    useRequireAuth:
        () =>
        <A extends unknown[]>(cb: (...args: A) => void) =>
        (...args: A) => {
            if (!auth.isAuthenticated) {
                openLoginDialog()
                return
            }
            cb(...args)
        },
}))

const { useReplyReaction } = await import('./use-reply-reaction')

function fixture(overrides: Record<string, unknown> = {}): Reply {
    const parsed = normalizeReply({
        id: 'r1',
        post_channel: { id: 'ch-1', paid_interaction_enabled: true, paid_interaction_cost: 5 },
        owner_channel: { id: 'author-ch' },
        reaction_count: 4,
        ...overrides,
    })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

function mount(reply: Reply, cost: number | null = null) {
    const out = { current: null as ReturnType<typeof useReplyReaction> | null }
    function Probe() {
        out.current = useReplyReaction(reply, { cost })
        return null
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>,
    )
    return out
}

beforeEach(() => {
    calls.length = 0
    vi.clearAllMocks()
    auth.isAuthenticated = true
    balance.affordable = true
})

describe('the endpoints', () => {
    /**
     * The regression this hook exists for. The detail page drew replies as post cards, so a press
     * went to `v1/posts/{replyId}/reaction/` — a post path holding a reply's id, which is a 404.
     */
    it('reacts on the reply path, addressed by the reply id', async () => {
        const out = mount(fixture())
        act(() => out.current?.toggle())

        await waitFor(() => expect(reactToReply).toHaveBeenCalled())
        expect(calls).toEqual(['react:r1'])
        expect(reactToReply).toHaveBeenCalledWith('r1', 'acc-1')
    })

    it('un-reacts on the reply path too, and free', async () => {
        const out = mount(fixture({ user_reaction: { type: 'LIKE' } }), 5)
        act(() => out.current?.toggle())

        await waitFor(() => expect(unreactFromReply).toHaveBeenCalled())
        expect(calls).toEqual(['unreact:r1'])
    })
})

describe('the charge', () => {
    /** Charge first, react second — reversed, a space that sells reactions gets them for free. */
    it('lands before the reaction', async () => {
        const out = mount(fixture(), 5)
        act(() => out.current?.toggle())

        await waitFor(() => expect(reactToReply).toHaveBeenCalled())
        expect(calls).toEqual(['charge:react:ch-1', 'react:r1'])
    })

    /**
     * The space the **post** lives in is credited, never the reply author's own channel — the
     * reply's `owner_channel` is a different id and paying it would move a reader's Star to whoever
     * happened to write the comment.
     */
    it('credits post_channel, not owner_channel', async () => {
        const out = mount(fixture(), 5)
        act(() => out.current?.toggle())

        await waitFor(() => expect(chargeInteraction).toHaveBeenCalled())
        expect(chargeInteraction.mock.calls[0]?.[0]).toMatchObject({
            product: 'react',
            channelId: 'ch-1',
        })
    })

    it('sends nothing when the reader is short of Star', () => {
        balance.affordable = false
        const out = mount(fixture(), 5)
        act(() => out.current?.toggle())

        expect(offerStars).toHaveBeenCalled()
        expect(calls).toEqual([])
    })

    /** A price with no space to credit: the free half is the hole, so the press does nothing. */
    it('refuses a priced press with no post_channel', () => {
        const out = mount(fixture({ post_channel: null }), 5)
        act(() => out.current?.toggle())
        expect(calls).toEqual([])
    })

    it('rolls the tally back when the charge fails', async () => {
        chargeInteraction.mockImplementationOnce(() => {
            calls.push('charge')
            return Promise.reject(new Error('refused'))
        })
        const out = mount(fixture(), 5)
        act(() => out.current?.toggle())

        // Optimistic: the star is on and the tally up before anything resolves.
        expect(out.current?.reacted).toBe(true)
        expect(out.current?.count).toBe(5)

        await waitFor(() => expect(out.current?.reacted).toBe(false))
        expect(out.current?.count).toBe(4)
        expect(reactToReply).not.toHaveBeenCalled()
    })
})

describe('a guest', () => {
    it('is asked to sign in on a free reply, and nothing is sent', () => {
        auth.isAuthenticated = false
        const out = mount(fixture())
        act(() => out.current?.toggle())

        expect(openLoginDialog).toHaveBeenCalled()
        expect(calls).toEqual([])
    })
})
