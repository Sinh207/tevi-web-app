// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBillingPortal } from './use-billing-portal'

/**
 * The **order** of a press, which is the only thing that makes this work: a tab is opened while the
 * gesture is still live, and the link is delivered into it afterwards. Nothing about that is visible
 * in the hook's return value, and every one of its failure states leaves a window behind if it is
 * wrong — an orphaned `about:blank` is the reason this pattern is usually done badly.
 *
 * The four cases below are the four windows a reader can end up with.
 */

const getBillingPortal = vi.hoisted(() => vi.fn())
vi.mock('@features/payment', () => ({
    checkoutApi: { getBillingPortal },
    checkoutReturnUrl: (path: string) => `https://tevi.dev${path}`,
}))

vi.mock('@features/auth', () => ({ useAuth: () => ({ activeId: 'acc-1' }) }))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const PORTAL = 'https://billing.stripe.com/p/session?secret=test_abc'

/** A stand-in for the opened window: what was navigated to, and whether it was closed. */
function fakeTab() {
    return { location: { href: '' }, close: vi.fn(), opener: {} as unknown }
}

function probe() {
    const seen: { current: ReturnType<typeof useBillingPortal> | null } = { current: null }
    function Probe() {
        seen.current = useBillingPortal()
        return null
    }
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    render(
        <QueryClientProvider client={client}>
            <Probe />
        </QueryClientProvider>,
    )
    return seen
}

beforeEach(() => {
    getBillingPortal.mockReset()
    toastError.mockReset()
})

describe('useBillingPortal', () => {
    it('opens the tab inside the press, before the link is known', async () => {
        const tab = fakeTab()
        const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
        // A request that never settles: the tab must exist regardless.
        getBillingPortal.mockReturnValue(new Promise(() => {}))
        const seen = probe()

        act(() => seen.current?.open())

        expect(open).toHaveBeenCalledWith('', '_blank')
        expect(tab.location.href).toBe('')
        // `opener` is dropped while the tab is still same-origin, so the portal cannot navigate us.
        expect(tab.opener).toBeNull()
        open.mockRestore()
    })

    it('navigates that tab once the link arrives, and asks for a return to /premium', async () => {
        const tab = fakeTab()
        const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
        getBillingPortal.mockResolvedValue(PORTAL)
        const seen = probe()

        act(() => seen.current?.open())

        await waitFor(() => expect(tab.location.href).toBe(PORTAL))
        expect(tab.close).not.toHaveBeenCalled()
        expect(getBillingPortal).toHaveBeenCalledWith({
            successUrl: 'https://tevi.dev/premium',
            // The account as of the press, not as of the answer.
            accountId: 'acc-1',
        })
        open.mockRestore()
    })

    /** An account with no Stripe customer behind it — bought in an app store, or granted by a code. */
    it('closes the tab and explains when there is no portal', async () => {
        const tab = fakeTab()
        const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
        getBillingPortal.mockResolvedValue(null)
        const seen = probe()

        act(() => seen.current?.open())

        await waitFor(() => expect(tab.close).toHaveBeenCalledTimes(1))
        expect(tab.location.href).toBe('')
        expect(toastError).toHaveBeenCalledTimes(1)
        open.mockRestore()
    })

    it('closes the tab when the request fails', async () => {
        const tab = fakeTab()
        const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
        getBillingPortal.mockRejectedValue(new Error('502'))
        const seen = probe()

        act(() => seen.current?.open())

        await waitFor(() => expect(tab.close).toHaveBeenCalledTimes(1))
        open.mockRestore()
    })

    /**
     * A blocked popup answers `null`, and the press must still do something: this tab, rather than
     * a button that silently fails.
     */
    it('falls back to this tab when the popup was blocked', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        const assign = vi.fn()
        Object.defineProperty(window, 'location', {
            value: { ...window.location, assign },
            writable: true,
        })
        getBillingPortal.mockResolvedValue(PORTAL)
        const seen = probe()

        act(() => seen.current?.open())

        await waitFor(() => expect(assign).toHaveBeenCalledWith(PORTAL))
        open.mockRestore()
    })

    /** One blank tab waiting for one link — never two. */
    it('drops a second press while the first is in flight', async () => {
        const open = vi.spyOn(window, 'open').mockReturnValue(fakeTab() as unknown as Window)
        getBillingPortal.mockReturnValue(new Promise(() => {}))
        const seen = probe()

        act(() => seen.current?.open())
        await waitFor(() => expect(seen.current?.isPending).toBe(true))
        act(() => seen.current?.open())

        expect(open).toHaveBeenCalledTimes(1)
        expect(getBillingPortal).toHaveBeenCalledTimes(1)
        open.mockRestore()
    })
})
