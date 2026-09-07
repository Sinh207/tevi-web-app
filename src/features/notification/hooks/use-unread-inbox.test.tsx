// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUnreadInbox } from './use-unread-inbox'

/**
 * `isKnown`, and the three states `count: 0` collapses.
 *
 * This is here because collapsing them shipped a bug that no comment would have caught. The page
 * bar's "Mark all as read" was rendered on `hasUnread`, which is `count > 0` — so the row was
 * missing while the count was in flight, missing after a 502, and missing for good in a session with
 * no account, where the query never runs at all. The control looked like a feature that had not been
 * built.
 *
 * `count` is *right* to collapse them, because all four outcomes draw the same bare bell.
 * `isKnown` is what lets a caller that must tell them apart do so, and only a rendered hook can
 * state it: `query.isSuccess` versus `!isLoading && !isError` is precisely the distinction a
 * **disabled** query falls through, and it reads identically in both spellings.
 */

const authed = vi.hoisted(() => ({ value: true }))
const getUnreadCount = vi.hoisted(() => vi.fn())

vi.mock('@features/auth', () => ({
    useAuth: () => ({ activeId: 'acc-1', isAuthenticated: authed.value }),
}))

/** The socket is a separate concern; the room never opens in a test. */
vi.mock('@features/realtime', () => ({ useSocketEvent: () => undefined }))

vi.mock('../api/notification-api', () => ({
    notificationApi: { getUnreadCount: (...a: unknown[]) => getUnreadCount(...a) },
    notificationKeys: {
        unread: (accountId: string | null) => ['notification', 'unread', accountId ?? 'anon'],
    },
}))

function renderHook() {
    let api!: ReturnType<typeof useUnreadInbox>
    function Probe() {
        api = useUnreadInbox()
        return null
    }
    // `retry: false`, or an error case waits out the client's retries before it settles.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
    render(
        <Wrapper>
            <Probe />
        </Wrapper>,
    )
    return () => api
}

beforeEach(() => {
    authed.value = true
    getUnreadCount.mockReset()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useUnreadInbox', () => {
    it('is not known while the first request is in flight, and the bell stays bare', () => {
        getUnreadCount.mockReturnValue(new Promise(() => {}))
        const read = renderHook()
        expect(read().isLoading).toBe(true)
        expect(read().count).toBe(0)
        expect(read().hasUnread).toBe(false)
        // The state that hid the menu row: nothing unread *yet as far as we know*.
        expect(read().isKnown).toBe(false)
    })

    it('is known once the server answers, even when the answer is zero', async () => {
        getUnreadCount.mockResolvedValue(0)
        const read = renderHook()
        await waitFor(() => expect(read().isKnown).toBe(true))
        expect(read().count).toBe(0)
        expect(read().hasUnread).toBe(false)
    })

    it('reports the count and lights the dot', async () => {
        getUnreadCount.mockResolvedValue(7)
        const read = renderHook()
        await waitFor(() => expect(read().count).toBe(7))
        expect(read().hasUnread).toBe(true)
        expect(read().isKnown).toBe(true)
    })

    /**
     * A failure must read as "we do not know", never as "nothing unread". `count` still falls back
     * to 0 — a dot that means "we could not find out" is indistinguishable from one that means "you
     * have mail" — but `isKnown` keeps the control that acts on the number available.
     */
    it('is not known after a failure, and shows no dot', async () => {
        getUnreadCount.mockRejectedValue(new Error('502'))
        const read = renderHook()
        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(read().count).toBe(0)
        expect(read().hasUnread).toBe(false)
        expect(read().isKnown).toBe(false)
    })

    /**
     * The case `!isLoading && !isError` gets wrong, and the reason the implementation reads
     * `query.isSuccess`: a **disabled** query is neither loading nor errored, so the negative
     * spelling would claim the server had answered a request that was never sent.
     */
    it('never runs and is never known for a session with no real account', async () => {
        authed.value = false
        const read = renderHook()
        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(getUnreadCount).not.toHaveBeenCalled()
        expect(read().count).toBe(0)
        expect(read().isKnown).toBe(false)
    })
})
