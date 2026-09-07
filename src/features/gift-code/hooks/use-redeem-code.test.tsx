// @vitest-environment jsdom
import { ApiError } from '@shared/lib/api/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRedeemCode } from './use-redeem-code'

/**
 * What this hook promises, none of which is visible from its call site: a refused code is **not** an
 * error, a failed request **is** one, the press is withheld from a guest, the redemption is credited
 * to the account that was active when it was pressed, and whatever the redemption moved is
 * invalidated rather than guessed at.
 *
 * The first two are the reason the hook exists in this shape — legacy prints one sentence for both,
 * so a billing outage tells somebody with a valid gift card that their card is worthless.
 */

const redeem = vi.hoisted(() => vi.fn())
const refreshMyChannel = vi.hoisted(() => vi.fn(() => Promise.resolve()))
const openLoginDialog = vi.hoisted(() => vi.fn())

let authenticated = true

vi.mock('../api/gift-code-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/gift-code-api')>('../api/gift-code-api')
    return { ...actual, giftCodeApi: { ...actual.giftCodeApi, redeem } }
})

vi.mock('@features/auth', () => ({
    useAuth: () => ({ activeId: 'acc-1' }),
    // The real hook's contract, reproduced: the callback is withheld and a prompt is raised instead.
    useRequireAuth:
        () =>
        <A extends unknown[]>(cb: (...args: A) => void) =>
        (...args: A) => {
            if (!authenticated) {
                openLoginDialog()
                return
            }
            cb(...args)
        },
}))

vi.mock('@features/balance', () => ({ balanceKeys: { all: ['balance'] } }))
vi.mock('@features/channel', () => ({ useMyChannel: () => ({ refresh: refreshMyChannel }) }))
vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

function renderFlow() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let api = {} as ReturnType<typeof useRedeemCode>
    function Probe() {
        api = useRedeemCode()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return {
        queryClient,
        /** Every `queryKey` the hook invalidated, in order. */
        invalidated: () => invalidate.mock.calls.map(([filters]) => filters?.queryKey),
        read: () => api,
        type: (code: string) => act(() => api.changeCode(code)),
        press: () => act(() => api.submit()),
    }
}

beforeEach(() => {
    authenticated = true
    redeem.mockReset()
    refreshMyChannel.mockReset()
    openLoginDialog.mockReset()
})

describe('useRedeemCode', () => {
    it('opens the result and refreshes the balance for a Star gift', async () => {
        redeem.mockResolvedValue({ kind: 'star', stars: 500 })
        const flow = renderFlow()

        flow.type('GIFT-500')
        flow.press()

        await waitFor(() => expect(flow.read().result).toEqual({ kind: 'star', stars: 500 }))
        expect(flow.read().errorKey).toBeNull()
        /*
         * The **prefix**, not the active account's key: after a mid-flight account switch the helper
         * would refresh the one account the gift did not land in. See the hook's own note.
         */
        expect(flow.invalidated()).toContainEqual(['balance'])
        // The trimmed code, and the account that was active at the press — threaded through as the
        // mutation's variable rather than read out of state later.
        expect(redeem).toHaveBeenCalledWith('GIFT-500', 'acc-1')
    })

    /** Pasted out of an email, which is the usual way a code arrives. */
    it('sends the code trimmed', async () => {
        redeem.mockResolvedValue({ kind: 'other' })
        const flow = renderFlow()

        flow.type('  GIFT-500  ')
        flow.press()

        await waitFor(() => expect(flow.read().result).toEqual({ kind: 'other' }))
        expect(redeem).toHaveBeenCalledWith('GIFT-500', 'acc-1')
    })

    it('refreshes the account for a Premium grant, and invalidates the grant it will read', async () => {
        redeem.mockResolvedValue({ kind: 'premium' })
        const flow = renderFlow()
        const invalidate = vi.spyOn(flow.queryClient, 'invalidateQueries')

        flow.type('PREM-12M')
        flow.press()

        await waitFor(() => expect(flow.read().result).toEqual({ kind: 'premium' }))
        expect(refreshMyChannel).toHaveBeenCalled()
        /*
         * **`features/premium`'s key**, since that feature owns `user/info/` — and the account is
         * the one the code was redeemed *into*, not whichever is active when the answer lands.
         *
         * Awaited, because the stored ETag is evicted first: the invalidation is chained off
         * `forgetPremiumInfoCache` so the refetch cannot carry an `If-None-Match` and be answered
         * `304` with the body from before the code was spent (**B72**).
         */
        await waitFor(() =>
            expect(invalidate).toHaveBeenCalledWith({
                queryKey: ['premium', 'info', 'acc-1'],
            }),
        )
    })

    /** The whole point of `{ kind: 'invalid' }` resolving rather than throwing. */
    it('reports a refused code as one line under the field, not as a failure', async () => {
        redeem.mockResolvedValue({ kind: 'invalid' })
        const flow = renderFlow()

        flow.type('NOPE-01')
        flow.press()

        await waitFor(() => expect(flow.read().errorKey).toBe('giftcode_error_invalid'))
        // No panel: nothing was redeemed.
        expect(flow.read().result).toBeNull()
    })

    /**
     * The race the verdict-pinning exists for: the field stays editable while the request is in
     * flight, so a verdict about `NOPE-01` must not appear under `NOPE-01-EXTRA`. Nothing has
     * checked that string.
     */
    it('does not put a verdict under a code it did not judge', async () => {
        let settle: (value: { kind: 'invalid' }) => void = () => {}
        redeem.mockReturnValue(new Promise(r => (settle = r)))
        const flow = renderFlow()

        flow.type('NOPE-01')
        flow.press()
        // Still typing when the answer about the earlier string arrives.
        flow.type('NOPE-01-EXTRA')
        await act(async () => settle({ kind: 'invalid' }))

        expect(flow.read().errorKey).toBeNull()

        // Type the judged string back and the answer is there again — without a second request.
        redeem.mockClear()
        flow.type('NOPE-01')
        expect(flow.read().errorKey).toBe('giftcode_error_invalid')
        expect(redeem).not.toHaveBeenCalled()
    })

    it('clears the verdict the moment the field changes', async () => {
        redeem.mockResolvedValue({ kind: 'invalid' })
        const flow = renderFlow()

        flow.type('NOPE-01')
        flow.press()
        await waitFor(() => expect(flow.read().errorKey).toBe('giftcode_error_invalid'))

        flow.type('NOPE-012')
        expect(flow.read().errorKey).toBeNull()
    })

    /**
     * A failure must not mark the code wrong — the field keeps its value and its silence, and the
     * toast is `query-client.ts`'s business.
     */
    it('leaves the field alone when the request failed', async () => {
        redeem.mockRejectedValue(new ApiError({ message: 'boom', status: 502 }))
        const flow = renderFlow()

        flow.type('GIFT-500')
        flow.press()

        await waitFor(() => expect(flow.read().isRedeeming).toBe(false))
        expect(flow.read().errorKey).toBeNull()
        expect(flow.read().result).toBeNull()
        expect(flow.read().code).toBe('GIFT-500')
    })

    it('withholds the press from a guest and asks them to sign in', () => {
        authenticated = false
        const flow = renderFlow()

        flow.type('GIFT-500')
        flow.press()

        expect(redeem).not.toHaveBeenCalled()
        expect(openLoginDialog).toHaveBeenCalled()
    })

    it('does not send a code too short to be one', () => {
        const flow = renderFlow()

        flow.type('ABC')
        flow.press()

        expect(redeem).not.toHaveBeenCalled()
        expect(flow.read().canSubmit).toBe(false)
    })

    it('empties the field when the result is dismissed — the code has been spent', async () => {
        redeem.mockResolvedValue({ kind: 'other' })
        const flow = renderFlow()

        flow.type('GIFT-500')
        flow.press()
        await waitFor(() => expect(flow.read().result).toEqual({ kind: 'other' }))

        act(() => flow.read().closeResult())
        expect(flow.read().result).toBeNull()
        expect(flow.read().code).toBe('')
    })
})
