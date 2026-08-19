// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdentityStatus } from './use-identity-status'

/**
 * The hook answers one question — is this account verified — and the ways it can be wrong
 * are all about the *absence* of an answer rather than the answer itself:
 *
 * - **`unverified` is the fold for "unknown".** That is right for the page, whose intro is
 *   the screen offering a way forward, and wrong for the drawer row, which prints the value:
 *   "None" about someone who is verified is a claim. `isKnown` is what separates the two,
 *   and every case below is really a case about it.
 * - **being mounted is not being looked at.** The drawer sits in the shell on every page, so
 *   the caller that is only sometimes on screen has to be able to say so — and the frame the
 *   gate opens must not read as a settled answer.
 */

const getSubmissions = vi.hoisted(() => vi.fn())
const auth = vi.hoisted(() => ({
    value: {
        activeId: 'acc-1',
        isAuthenticated: true,
        isAnonymous: false,
        isBootstrapping: false,
    } as {
        activeId: string | null
        isAuthenticated: boolean
        isAnonymous: boolean
        isBootstrapping: boolean
    },
}))

vi.mock('../api/identification-api', async () => {
    const actual = await vi.importActual<typeof import('../api/identification-api')>(
        '../api/identification-api',
    )
    return { ...actual, identificationApi: { ...actual.identificationApi, getSubmissions } }
})

vi.mock('@features/auth', () => ({ useAuth: () => auth.value }))

const APPROVED_LEVEL_2 = { results: [{ level: 'LEVEL_2', status: 'APPROVED' }] }

function renderHook(options?: { enabled?: boolean }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api: ReturnType<typeof useIdentityStatus> | undefined
    function Probe({ enabled }: { enabled?: boolean }) {
        api = useIdentityStatus({ enabled })
        return null
    }
    const { rerender } = render(
        <QueryClientProvider client={queryClient}>
            <Probe enabled={options?.enabled} />
        </QueryClientProvider>,
    )
    return {
        read: () => api as ReturnType<typeof useIdentityStatus>,
        /** Flip the gate the way the drawer does when it opens. */
        setEnabled: (enabled: boolean) =>
            rerender(
                <QueryClientProvider client={queryClient}>
                    <Probe enabled={enabled} />
                </QueryClientProvider>,
            ),
    }
}

beforeEach(() => {
    getSubmissions.mockReset()
    auth.value = {
        activeId: 'acc-1',
        isAuthenticated: true,
        isAnonymous: false,
        isBootstrapping: false,
    }
})

describe('useIdentityStatus', () => {
    it('reports an approved LEVEL_2 submission as verified', async () => {
        getSubmissions.mockResolvedValue(APPROVED_LEVEL_2)
        const { read } = renderHook()

        await waitFor(() => expect(read().state).toBe('verified'))
        expect(read().isKnown).toBe(true)
    })

    it('asks nothing for a caller that is mounted but not on screen', async () => {
        // The drawer is in the shell on every page. Ungated, this is a request at bootstrap
        // for every signed-in visitor, to fill in a row most sessions never look at.
        getSubmissions.mockResolvedValue(APPROVED_LEVEL_2)
        const { read } = renderHook({ enabled: false })

        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(getSubmissions).not.toHaveBeenCalled()
        // And nothing may be printed from it: `state` is the fold, not an answer.
        expect(read().isKnown).toBe(false)
    })

    it('asks once the caller comes on screen, and claims nothing before the answer lands', async () => {
        getSubmissions.mockResolvedValue(APPROVED_LEVEL_2)
        const { read, setEnabled } = renderHook({ enabled: false })

        setEnabled(true)
        /*
         * The frame the gate opens. `state` already reads `unverified` here — it always does
         * without data — so a row printing it unconditionally would tell a verified account
         * it has submitted nothing, as the drawer slides in.
         */
        expect(read().state).toBe('unverified')
        expect(read().isKnown).toBe(false)

        await waitFor(() => expect(read().state).toBe('verified'))
        expect(getSubmissions).toHaveBeenCalledTimes(1)
    })

    it('counts a guest as known: an account that cannot submit cannot be verified', async () => {
        auth.value = {
            activeId: null,
            isAuthenticated: false,
            isAnonymous: false,
            isBootstrapping: false,
        }
        const { read } = renderHook()

        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(getSubmissions).not.toHaveBeenCalled()
        // Not a blank row for a signed-out visitor — "None" is the true answer, not a default.
        expect(read().isKnown).toBe(true)
        expect(read().state).toBe('unverified')
    })

    it('asks nothing for an anonymous session either', async () => {
        auth.value = {
            activeId: 'anon-1',
            isAuthenticated: true,
            isAnonymous: true,
            isBootstrapping: false,
        }
        const { read } = renderHook()

        await waitFor(() => expect(read().isLoading).toBe(false))
        expect(getSubmissions).not.toHaveBeenCalled()
        expect(read().isKnown).toBe(true)
    })

    it('knows nothing during the bootstrap, signed in or not', () => {
        // `isAuthenticated` is not meaningful yet; without this clause every visitor counts
        // as a settled guest for a moment and the row prints "None" before the session that
        // contradicts it exists.
        auth.value = {
            activeId: null,
            isAuthenticated: false,
            isAnonymous: false,
            isBootstrapping: true,
        }
        const { read } = renderHook()

        expect(read().isKnown).toBe(false)
        expect(read().isLoading).toBe(true)
    })

    it('treats a failed fetch as known, so nothing hangs on a skeleton', async () => {
        // `unverified` is the safe fold and the page has `isError` for the retry. Reporting
        // "still unknown" here would leave a caller waiting on an answer that is not coming.
        getSubmissions.mockRejectedValue(new ApiError({ message: 'boom', status: 500 }))
        const { read } = renderHook()

        await waitFor(() => expect(read().isError).toBe(true))
        expect(read().isKnown).toBe(true)
        expect(read().state).toBe('unverified')
    })
})
