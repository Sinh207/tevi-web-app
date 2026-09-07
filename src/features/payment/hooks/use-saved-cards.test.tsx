// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentKeys } from '../api/keys'
import { MAX_SAVED_CARDS } from '../api/payment-methods-api'
import type { SavedCard } from '../api/types'
import { useSavedCards } from './use-saved-cards'

/**
 * What this hook promises that no call site can show, and no comment can pin:
 *
 * 1. **The write is attributed to the account that was active when the row was pressed.** That is a
 *    race, so the only way to state it is to switch accounts while a delete is in flight.
 * 2. **This hook does not refuse the last card.** The refusal lives in the screen, which opens
 *    legacy's "This Card Can't Be Removed" notice; what legacy's *hook* adds on top of that is a
 *    silent `return` (`docs/PAYMENT.md` §1.4 #7), and a hook that swallows a call cannot be told apart
 *    from a broken one.
 *    The assertion is that the request is *attempted*.
 * 3. **The cap is `>=`, not `>`.** Legacy's `allCards?.length > 10` admits an eleventh card (§1.4 #8).
 * 4. **Deleting the default promotes a survivor**, and does nothing when there is none.
 */

const list = vi.hoisted(() => vi.fn())
const remove = vi.hoisted(() => vi.fn())
const setDefault = vi.hoisted(() => vi.fn())

vi.mock('../api/payment-methods-api', async () => {
    const actual = await vi.importActual<typeof import('../api/payment-methods-api')>(
        '../api/payment-methods-api',
    )
    return {
        ...actual,
        paymentMethodsApi: { ...actual.paymentMethodsApi, list, remove, setDefault },
    }
})

/**
 * The auth surface, as a mutable object rather than a spy per test.
 *
 * A plain object on purpose: changing `activeId` does **not** re-render, which is exactly the
 * condition under test — the hook must have pinned the value already. The re-render that picks the
 * new value up is forced explicitly, so the two events are ordered by the test rather than by React.
 */
const auth = vi.hoisted(() => ({ activeId: '1' as string | null, isAuthenticated: true }))
vi.mock('@features/auth', () => ({ useAuth: () => auth }))

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function card(id: string, overrides: Partial<SavedCard> = {}): SavedCard {
    return {
        id,
        default: false,
        type: 'card',
        card: { brand: 'visa', last4: `424${id}`, exp_month: 5, exp_year: 2099, funding: 'credit' },
        ...overrides,
    }
}

function renderHook() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: ReturnType<typeof useSavedCards> | null = null
    function Probe() {
        api = useSavedCards()
        return null
    }
    /*
     * A **new** element every time, and that is load-bearing: React bails out of re-rendering when
     * it is handed the identical element object (old props === new props), so a `rerender` that
     * reuses one would not pick the changed account up — and the test would pass without ever
     * having switched accounts.
     */
    const tree = () => (
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>
    )
    const utils = render(tree())
    return {
        queryClient,
        /* Non-null: assigned by the first render, above. */
        get: () => api!,
        rerender: () => utils.rerender(tree()),
    }
}

beforeEach(() => {
    auth.activeId = '1'
    auth.isAuthenticated = true
    list.mockReset()
    remove.mockReset()
    setDefault.mockReset()
    remove.mockResolvedValue(undefined)
    setDefault.mockResolvedValue(undefined)
})

describe('useSavedCards — the account a write belongs to', () => {
    it('deletes as the account that was active when the row was pressed, not when it landed', async () => {
        list.mockResolvedValue([card('a', { default: true }), card('b')])
        let settle: () => void = () => {}
        remove.mockReturnValue(new Promise<void>(resolve => (settle = () => resolve())))

        const { queryClient, get, rerender } = renderHook()
        await waitFor(() => expect(get().cards).toHaveLength(2))
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        act(() => get().remove(get().cards[1]))

        // The visitor switches accounts mid-flight. The re-render is forced, so the hook's closures
        // now read account 2 — and the in-flight write must not.
        auth.activeId = '2'
        rerender()

        await act(async () => {
            settle()
        })

        await waitFor(() => expect(invalidate).toHaveBeenCalled())
        expect(remove).toHaveBeenCalledWith('b', { accountId: '1' })
        // The refetch lands on the list the delete came out of, not on account 2's.
        expect(invalidate).toHaveBeenCalledWith({ queryKey: paymentKeys.cards('1') })
        expect(invalidate).not.toHaveBeenCalledWith({ queryKey: paymentKeys.cards('2') })
    })

    it('sets a default as the pressing account', async () => {
        list.mockResolvedValue([card('a', { default: true }), card('b')])
        let settle: () => void = () => {}
        setDefault.mockReturnValue(new Promise<void>(resolve => (settle = () => resolve())))

        const { get, rerender } = renderHook()
        await waitFor(() => expect(get().cards).toHaveLength(2))

        act(() => get().setDefault(get().cards[1]))
        auth.activeId = '2'
        rerender()
        await act(async () => {
            settle()
        })

        expect(setDefault).toHaveBeenCalledWith('b', { accountId: '1' })
    })
})

describe('useSavedCards — deleting', () => {
    it('sends the delete even for the only card — the refusal belongs to the screen', async () => {
        list.mockResolvedValue([card('only', { default: true })])

        const { get } = renderHook()
        await waitFor(() => expect(get().cards).toHaveLength(1))

        await act(async () => {
            get().remove(get().cards[0])
        })

        // Legacy's `if (allCards.length <= 1) return` would make this zero calls.
        expect(remove).toHaveBeenCalledWith('only', { accountId: '1' })
        // Nothing to promote: no survivor, so no `set-as-default/` on a card that does not exist.
        expect(setDefault).not.toHaveBeenCalled()
    })

    it('promotes the first survivor when the deleted card was the default', async () => {
        list.mockResolvedValue([card('a', { default: true }), card('b'), card('c')])

        const { get } = renderHook()
        await waitFor(() => expect(get().cards).toHaveLength(3))

        await act(async () => {
            get().remove(get().cards[0])
        })

        await waitFor(() => expect(setDefault).toHaveBeenCalledWith('b', { accountId: '1' }))
    })

    it('does not promote anything when the deleted card was not the default', async () => {
        list.mockResolvedValue([card('a', { default: true }), card('b')])

        const { get } = renderHook()
        await waitFor(() => expect(get().cards).toHaveLength(2))

        await act(async () => {
            get().remove(get().cards[1])
        })

        expect(setDefault).not.toHaveBeenCalled()
    })

    it('is single-flight: a second press while one is running is dropped', async () => {
        list.mockResolvedValue([card('a', { default: true }), card('b')])
        remove.mockReturnValue(new Promise<void>(() => {}))

        const { get } = renderHook()
        await waitFor(() => expect(get().cards).toHaveLength(2))

        act(() => get().remove(get().cards[0]))
        await waitFor(() => expect(get().isMutating).toBe(true))
        act(() => get().remove(get().cards[1]))

        expect(remove).toHaveBeenCalledTimes(1)
        expect(get().pendingId).toBe('a')
    })
})

describe('useSavedCards — the cap', () => {
    it('is reached **at** the limit, not one past it', async () => {
        list.mockResolvedValue(
            Array.from({ length: MAX_SAVED_CARDS }, (_, index) => card(String(index))),
        )

        const { get } = renderHook()
        await waitFor(() => expect(get().cards).toHaveLength(MAX_SAVED_CARDS))

        // Legacy's `allCards?.length > 10` is `false` here, which is how an eleventh card gets in.
        expect(get().isFull).toBe(true)
        expect(get().remaining).toBe(0)
    })

    it('leaves one slot open below the limit', async () => {
        list.mockResolvedValue(
            Array.from({ length: MAX_SAVED_CARDS - 1 }, (_, index) => card(String(index))),
        )

        const { get } = renderHook()
        await waitFor(() => expect(get().cards).toHaveLength(MAX_SAVED_CARDS - 1))

        expect(get().isFull).toBe(false)
        expect(get().remaining).toBe(1)
    })
})

describe('useSavedCards — states', () => {
    it('asks for nothing while the session is anonymous, and reports signed out', async () => {
        auth.isAuthenticated = false
        auth.activeId = null

        const { get } = renderHook()

        await waitFor(() => expect(get().isSignedOut).toBe(true))
        expect(list).not.toHaveBeenCalled()
        // Neither loading nor empty: there is no question to answer, so neither is the honest word.
        expect(get().isLoading).toBe(false)
        expect(get().isEmpty).toBe(false)
    })

    it('reports empty only once the list has actually come back holding nothing', async () => {
        list.mockResolvedValue([])

        const { get } = renderHook()

        expect(get().isEmpty).toBe(false)
        await waitFor(() => expect(get().isEmpty).toBe(true))
        expect(get().isError).toBe(false)
    })

    it('reports an error rather than an empty list when the request fails', async () => {
        list.mockRejectedValue(new Error('502'))

        const { get } = renderHook()

        await waitFor(() => expect(get().isError).toBe(true))
        // The distinction legacy loses: `setAllCards(res)` before the status check (§1.4 #1) makes a
        // failure indistinguishable from "you have no cards".
        expect(get().isEmpty).toBe(false)
    })
})
