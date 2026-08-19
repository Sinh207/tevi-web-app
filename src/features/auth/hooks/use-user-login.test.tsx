// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUserLogin } from './use-user-login'

/**
 * The hook's whole job is to answer "does this account have a password", and the two ways
 * it can get that wrong are both invisible from the call site:
 *
 * - **a 404 is an answer, not a failure.** `/settings/password` picks between the create
 *   flow and the change form from `hasCredentials`; if a 404 surfaced as `isError` the
 *   screen would put a retry button in front of someone whose only problem is that they
 *   have never set a password.
 * - **a guest must not ask.** The app always holds a session, including an anonymous one,
 *   so "signed in" is not the same question as `isAuthenticated` — and the drawer mounts
 *   this hook on every page.
 *
 * The second of those is also why `enabled` exists: being mounted is not the same as being
 * looked at. The drawer parks its screens, so the caller that is only *sometimes* on screen
 * has to be able to say so, and the hook must not report that silence as loading.
 */

const getUserLogin = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({
    value: { activeId: 'acc-1', isAuthenticated: true, isBootstrapping: false } as {
        activeId: string | null
        isAuthenticated: boolean
        isBootstrapping: boolean
    },
}))

vi.mock('../api/auth-api', async () => {
    const actual = await vi.importActual<typeof import('../api/auth-api')>('../api/auth-api')
    return { ...actual, authApi: { ...actual.authApi, getUserLogin } }
})

vi.mock('../providers/auth-provider', () => ({ useAuth: () => auth.value }))

function renderHook(options?: { enabled?: boolean }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api: ReturnType<typeof useUserLogin> | undefined
    function Probe({ enabled }: { enabled?: boolean }) {
        api = useUserLogin({ enabled })
        return null
    }
    const { rerender } = render(
        <QueryClientProvider client={queryClient}>
            <Probe enabled={options?.enabled} />
        </QueryClientProvider>,
    )
    return {
        read: () => api as ReturnType<typeof useUserLogin>,
        /** Flip the gate the way the drawer does when its screen slides in. */
        setEnabled: (enabled: boolean) =>
            rerender(
                <QueryClientProvider client={queryClient}>
                    <Probe enabled={enabled} />
                </QueryClientProvider>,
            ),
    }
}

beforeEach(() => {
    getUserLogin.mockReset()
    auth.value = { activeId: 'acc-1', isAuthenticated: true, isBootstrapping: false }
})

describe('useUserLogin', () => {
    it('reports an account that signs in with an email', async () => {
        getUserLogin.mockResolvedValue({ email: 'sinh@tevi.com' })
        const { read } = renderHook()

        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(read().hasCredentials).toBe(true)
        expect(read().email).toBe('sinh@tevi.com')
        expect(read().isError).toBe(false)
    })

    it('treats a 404 as "no credentials", not as a failed fetch', async () => {
        getUserLogin.mockRejectedValue(new ApiError({ message: 'not found', status: 404 }))
        const { read } = renderHook()

        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(read().isError).toBe(false)
        expect(read().hasCredentials).toBe(false)
        expect(read().email).toBeUndefined()
    })

    it('still fails loudly on anything else — the two screens are not interchangeable', async () => {
        // Falling through to a form on a 500 would ask a social-only account for a current
        // password it does not have, or send an account that has one through an OTP.
        getUserLogin.mockRejectedValue(new ApiError({ message: 'boom', status: 500 }))
        const { read } = renderHook()

        await waitFor(() => expect(read().isError).toBe(true))
        expect(read().hasCredentials).toBe(false)
    })

    it('counts a phone as credentials too', async () => {
        getUserLogin.mockResolvedValue({ phone: '+84900000000' })
        const { read } = renderHook()

        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(read().hasCredentials).toBe(true)
    })

    it('asks nothing on behalf of a guest, and does not sit loading forever', async () => {
        // A disabled query is `isPending` for ever; reporting that as loading is how a
        // signed-out visitor gets a skeleton that never resolves.
        auth.value = { activeId: null, isAuthenticated: false, isBootstrapping: false }
        const { read } = renderHook()

        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(getUserLogin).not.toHaveBeenCalled()
        expect(read().hasCredentials).toBe(false)
    })

    it('asks nothing for a caller that is mounted but not on screen', async () => {
        // The drawer parks this screen on every page. Ungated, that is a request at bootstrap
        // for every signed-in visitor, to answer a question nobody has asked yet.
        getUserLogin.mockResolvedValue({ email: 'sinh@tevi.com' })
        const { read } = renderHook({ enabled: false })

        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(getUserLogin).not.toHaveBeenCalled()
    })

    it('asks once the caller comes on screen, and claims nothing before the answer lands', async () => {
        getUserLogin.mockResolvedValue({ email: 'sinh@tevi.com' })
        const { read, setEnabled } = renderHook({ enabled: false })

        setEnabled(true)
        /*
         * The frame the gate flips: a query that was disabled is not `isLoading` yet, so a
         * caller keying its label off the loading flag would render "no password here" for
         * an account that has one — as the panel slides in. `userLogin` is the honest test,
         * and it is undefined until there is something to report.
         */
        expect(read().userLogin).toBeUndefined()

        await waitFor(() => expect(read().hasCredentials).toBe(true))
        expect(getUserLogin).toHaveBeenCalledTimes(1)
    })

    it('holds the answer back until the session bootstrap has finished', () => {
        // Otherwise an account that *has* a password renders the create-password flow for
        // the length of the bootstrap and then replaces it.
        auth.value = { activeId: null, isAuthenticated: false, isBootstrapping: true }
        const { read } = renderHook()

        expect(read().isLoading).toBe(true)
    })
})
