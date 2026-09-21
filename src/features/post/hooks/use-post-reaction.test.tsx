// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePost, type Post } from '../api/types'

const react = vi.fn()
const unreact = vi.fn()
const chargeInteraction = vi.fn()
vi.mock('../api/post-api', () => ({
    postApi: {
        react: (...args: unknown[]) => react(...args),
        unreact: (...args: unknown[]) => unreact(...args),
        chargeInteraction: (...args: unknown[]) => chargeInteraction(...args),
    },
    postKeys: { all: ['post'] },
    INSUFFICIENT_STARS_CODE: 'EC0001',
}))

/**
 * The balance gate, stubbed as the real one behaves rather than as a pass-through.
 *
 * `affordable` is what lets the tests state the thing that matters: a press the reader cannot pay
 * for must send **nothing at all** — not the charge and not the reaction. A stub that always ran the
 * callback would make that assertion impossible to write, which is how the paid path would go back
 * to being free without a test noticing.
 */
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

const { usePostReaction } = await import('./use-post-reaction')

function fixture(overrides: Record<string, unknown> = {}): Post {
    const parsed = normalizePost({ id: 'p1', reaction_count: 10, ...overrides })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

/** One component that assigns the hook's return value out — the repo's `Probe` pattern. */
function mount(post: Post, cost: number | null = null) {
    const out = { current: null as ReturnType<typeof usePostReaction> | null }
    function Probe({ post }: { post: Post }) {
        out.current = usePostReaction(post, { cost })
        return null
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const utils = render(
        <QueryClientProvider client={client}>
            <Probe post={post} />
        </QueryClientProvider>,
    )
    const rerender = (next: Post) =>
        utils.rerender(
            <QueryClientProvider client={client}>
                <Probe post={next} />
            </QueryClientProvider>,
        )
    return { out, rerender }
}

beforeEach(() => {
    react.mockReset().mockResolvedValue({})
    unreact.mockReset().mockResolvedValue({})
    chargeInteraction.mockReset().mockResolvedValue({})
    openLoginDialog.mockReset()
    offerStars.mockReset()
    auth.isAuthenticated = true
    auth.activeId = 'acc-1'
    balance.affordable = true
})

describe('usePostReaction', () => {
    it('seeds from the post', () => {
        const { out } = mount(fixture({ user_reaction: { type: 'LIKE' } }))
        expect(out.current?.reacted).toBe(true)
        expect(out.current?.count).toBe(10)
    })

    /**
     * The flip has to land before the request resolves: the star plays a burst on press, and an
     * animation that waits for a round trip reads as a dropped tap.
     */
    it('flips the state and the count before the request resolves', async () => {
        let settle: (v: unknown) => void = () => {}
        react.mockReturnValue(new Promise(resolve => (settle = resolve)))

        const { out } = mount(fixture())
        act(() => out.current?.toggle())

        expect(out.current?.reacted).toBe(true)
        expect(out.current?.count).toBe(11)
        await act(async () => settle({}))
        expect(out.current?.reacted).toBe(true)
    })

    it('sends the reaction on the account that was active at the press', async () => {
        const { out } = mount(fixture())
        act(() => out.current?.toggle())
        await waitFor(() => expect(react).toHaveBeenCalledWith('p1', 'acc-1'))
    })

    it('calls the delete endpoint when taking a reaction back', async () => {
        const { out } = mount(fixture({ user_reaction: { type: 'LIKE' } }))
        act(() => out.current?.toggle())
        await waitFor(() => expect(unreact).toHaveBeenCalledWith('p1', 'acc-1'))
        expect(out.current?.count).toBe(9)
    })

    /** A count left standing is the visible half of a write that did not land. */
    it('puts both the state and the count back when the write fails', async () => {
        react.mockRejectedValue(new Error('nope'))
        const { out } = mount(fixture())

        act(() => out.current?.toggle())
        expect(out.current?.count).toBe(11)

        await waitFor(() => expect(out.current?.reacted).toBe(false))
        expect(out.current?.count).toBe(10)
    })

    it('never lets the count go below zero', async () => {
        const { out } = mount(fixture({ reaction_count: 0, user_reaction: { type: 'LIKE' } }))
        act(() => out.current?.toggle())
        expect(out.current?.count).toBe(0)
    })

    /**
     * A guest may see the tally and is asked to sign in only on the press — the action is gated,
     * never the surface.
     */
    it('raises the sign-in dialog for a guest and sends nothing', () => {
        auth.isAuthenticated = false
        const { out } = mount(fixture())
        act(() => out.current?.toggle())
        expect(openLoginDialog).toHaveBeenCalledOnce()
        expect(react).not.toHaveBeenCalled()
        expect(out.current?.reacted).toBe(false)
    })

    /**
     * A reused component must not carry one post's reaction onto the next — the re-seed is keyed on
     * the post's identity, not only on its values.
     */
    it('re-seeds when a different post arrives in the same component', () => {
        const { out, rerender } = mount(fixture())
        act(() => out.current?.toggle())
        expect(out.current?.reacted).toBe(true)

        rerender(fixture({ id: 'p2', reaction_count: 3 }))
        expect(out.current?.reacted).toBe(false)
        expect(out.current?.count).toBe(3)
    })

    /**
     * The guard is a ref rather than `isPending`, which only turns true after a render — so two
     * presses in the same tick would otherwise both fire and the tally would move by two.
     */
    it('ignores a second press while one is in flight', async () => {
        react.mockReturnValue(new Promise(() => {}))
        const { out } = mount(fixture())
        act(() => out.current?.toggle())
        act(() => out.current?.toggle())
        await waitFor(() => expect(react).toHaveBeenCalledOnce())
        expect(out.current?.count).toBe(11)
    })
})

/**
 * Paid interaction — the half that made the price chip honest.
 *
 * The card drew a Star price on the react glyph long before this hook charged anything, so a reader
 * on a paid-interaction space reacted for **free** and neither side surfaced it. These four pin the
 * ordering that closes it, and each one fails differently if the ordering slips.
 */
describe('usePostReaction — paid interaction', () => {
    const paid = () =>
        fixture({
            channel: { id: 'ch-1', paid_interaction_enabled: true, paid_interaction_cost: 5 },
        })

    it('charges the channel before the reaction, and sends both', async () => {
        const { out } = mount(paid(), 5)
        act(() => out.current?.toggle())

        await waitFor(() => expect(react).toHaveBeenCalled())
        expect(chargeInteraction).toHaveBeenCalledWith(
            { product: 'react', channelId: 'ch-1', cost: 5 },
            'acc-1',
        )
        // The charge is awaited first — `mutationFn` is sequential, so a reaction that ran anyway
        // would mean the `await` had been dropped.
        expect(chargeInteraction.mock.invocationCallOrder[0]).toBeLessThan(
            react.mock.invocationCallOrder[0],
        )
    })

    /**
     * The failure this whole arrangement exists to prevent: a charge that fails must take the
     * reaction with it. Legacy bails out of `handleReaction` entirely, and so must this.
     */
    it('does not react when the charge fails, and rolls the count back', async () => {
        chargeInteraction.mockRejectedValue(new Error('nope'))
        const { out } = mount(paid(), 5)

        act(() => out.current?.toggle())
        // Optimistic first — the star has already flipped by the time the charge is refused.
        expect(out.current?.reacted).toBe(true)

        await waitFor(() => expect(out.current?.reacted).toBe(false))
        expect(react).not.toHaveBeenCalled()
        expect(out.current?.count).toBe(10)
    })

    /** A reader who cannot afford it is offered Star and **nothing is sent**. */
    it('sends neither request when the reader cannot afford the reaction', () => {
        balance.affordable = false
        const { out } = mount(paid(), 5)

        act(() => out.current?.toggle())

        expect(offerStars).toHaveBeenCalled()
        expect(chargeInteraction).not.toHaveBeenCalled()
        expect(react).not.toHaveBeenCalled()
        // Not even optimistically: the press never ran, so the star must not have moved.
        expect(out.current?.reacted).toBe(false)
    })

    /**
     * Taking a reaction back is free, and it is **not** behind the balance gate — otherwise an
     * empty wallet would strand somebody on a reaction they no longer want.
     */
    it('does not charge when taking a reaction back, even with no balance', async () => {
        balance.affordable = false
        const { out } = mount(
            fixture({
                user_reaction: { type: 'LIKE' },
                channel: { id: 'ch-1', paid_interaction_enabled: true, paid_interaction_cost: 5 },
            }),
            5,
        )

        act(() => out.current?.toggle())

        await waitFor(() => expect(unreact).toHaveBeenCalled())
        expect(chargeInteraction).not.toHaveBeenCalled()
        expect(offerStars).not.toHaveBeenCalled()
    })

    /**
     * A cost with no channel id cannot name a beneficiary, so there is no charge that can be made —
     * and reacting for free would be the exact hole this closes. Nothing is sent.
     */
    it('sends nothing when the cost has no channel to credit', async () => {
        const { out } = mount(fixture({ channel: null }), 5)
        act(() => out.current?.toggle())

        /*
         * Awaited, not asserted synchronously. `mutate` dispatches into a microtask, so a synchronous
         * `not.toHaveBeenCalled()` passes even when the request is on its way — which is exactly how
         * this test passed against a build that *did* react for free. A flush is what makes it real.
         */
        await Promise.resolve()
        expect(chargeInteraction).not.toHaveBeenCalled()
        expect(react).not.toHaveBeenCalled()
        // The optimistic flip must not have happened either — the press was refused outright.
        expect(out.current?.reacted).toBe(false)
        expect(out.current?.count).toBe(10)
    })
})
