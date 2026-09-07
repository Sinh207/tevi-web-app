// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSingleTransfer } from './use-single-transfer'

/**
 * What this flow promises, none of which is visible from a call site: the write carries the **resolved
 * receiver's id** rather than what was typed, the amount is parsed once and by one rule, the request
 * lands on the account that was active when the button was pressed, the two guards block at their own
 * steps, and going back from the review screen does not discard the form.
 *
 * Those are statements about *ordering* and *identity*, which is why they are tested here rather than
 * as more cases in `transfer-rules.test.ts`: "a shortfall does not post" and "an unresolved ID cannot be
 * reviewed" cannot be pinned by a comment. Same reasoning, and the same harness, as
 * `use-donate-flow.test.tsx`.
 */

const getRecipient = vi.hoisted(() => vi.fn())
const transferStars = vi.hoisted(() => vi.fn())
const refreshBalance = vi.hoisted(() => vi.fn())
const authed = vi.hoisted(() => ({ value: true }))
const affordable = vi.hoisted(() => ({ value: true }))
const activeId = vi.hoisted(() => ({ value: 'acct-1' }))

vi.mock('../api/transfer-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/transfer-api')>('../api/transfer-api')
    return { ...actual, transferApi: { getRecipient, transferStars } }
})

vi.mock('@features/auth', () => ({
    useAuth: () => ({ activeId: activeId.value, currentUser: { id: 'me-9' } }),
}))

vi.mock('@features/balance', () => ({
    /*
     * `balanceKeys` has to be here even though nothing in the test reads it: `transferKeys` nests
     * under it (that nesting is the agreement the three wallet features share), so the api module
     * fails to evaluate without it and the whole mock fails with it.
     */
    balanceKeys: { all: ['balance'] },
    useBalance: () => ({ star: 1000, isKnown: true, refresh: refreshBalance }),
    // The real hook runs the callback or diverts to a toast / the top-up flow.
    useRequireStars:
        () =>
        (_cost: number, cb: (...a: unknown[]) => void) =>
        (...a: unknown[]) => {
            if (authed.value && affordable.value) cb(...a)
        },
}))

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}))

const ADA = { id: '1002884', name: 'Ada', avatarUrl: null }

function renderFlow() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api!: ReturnType<typeof useSingleTransfer>
    function Probe() {
        api = useSingleTransfer()
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return {
        read: () => api,
        run: (fn: (a: typeof api) => void) => act(() => fn(api)),
    }
}

/** Fill the form the way a reader would, and wait for the debounced lookup to land. */
async function fill(
    flow: ReturnType<typeof renderFlow>,
    { id = ADA.id, amount = '250', message = '' } = {},
) {
    flow.run(a => a.open())
    flow.run(a => a.setReceiverId(id))
    await waitFor(() => expect(flow.read().lookup.status).not.toBe('checking'), { timeout: 3000 })
    flow.run(a => a.setAmount(amount))
    if (message) flow.run(a => a.setMessage(message))
}

beforeEach(() => {
    vi.clearAllMocks()
    authed.value = true
    affordable.value = true
    activeId.value = 'acct-1'
    getRecipient.mockResolvedValue(ADA)
    transferStars.mockResolvedValue([
        { id: 'TR-1', stars: 250, fee: 0, description: '', createdAt: 1, party: ADA },
    ])
})

describe('useSingleTransfer', () => {
    it('starts closed and opens onto the form', () => {
        const flow = renderFlow()
        expect(flow.read().step).toBe('closed')
        flow.run(a => a.open())
        expect(flow.read().step).toBe('form')
    })

    it('seeds the receiver from a Retransfer press, and nothing else', async () => {
        const flow = renderFlow()
        flow.run(a => a.open('1002884'))
        expect(flow.read().receiverId).toBe('1002884')
        // Not the amount and not the note: a repeat transfer is a new decision about how much.
        expect(flow.read().amount).toBe('')
        expect(flow.read().message).toBe('')
    })

    it('cannot be reviewed until the ID has resolved, even with a valid amount', async () => {
        getRecipient.mockResolvedValue(null)
        const flow = renderFlow()
        await fill(flow)
        expect(flow.read().lookup.status).toBe('invalid')
        expect(flow.read().canReview).toBe(false)
    })

    it('refuses the reader’s own account', async () => {
        getRecipient.mockResolvedValue({ id: 'me-9', name: 'Me', avatarUrl: null })
        const flow = renderFlow()
        await fill(flow)
        expect(flow.read().lookup.status).toBe('invalid')
        expect(flow.read().canReview).toBe(false)
    })

    it('does not accuse the reader when the lookup itself failed', async () => {
        getRecipient.mockRejectedValue(new Error('502'))
        const flow = renderFlow()
        await fill(flow)
        // `error`, not `invalid` — the ID may be perfectly good. This is the fold legacy gets wrong.
        expect(flow.read().lookup.status).toBe('error')
    })

    it('sends the resolved id and the parsed amount, on the account that was active', async () => {
        const flow = renderFlow()
        await fill(flow, { amount: '250', message: '  thanks  ' })
        expect(flow.read().canReview).toBe(true)

        flow.run(a => a.review())
        expect(flow.read().step).toBe('review')
        flow.run(a => a.confirm())

        await waitFor(() => expect(transferStars).toHaveBeenCalled())
        expect(transferStars).toHaveBeenCalledWith(
            [{ user_id: ADA.id, amount: 250, description: 'thanks' }],
            'acct-1',
        )
    })

    /*
     * This case asserted `toBeUndefined()` and so **pinned the bug in place**: an omitted key is a
     * 400 from billy (`errors: [{ input: 'description', code: 'required' }]`), which failed every
     * transfer sent without a note. The field is required and accepts `''`.
     */
    it('sends an empty description, not an absent one, when the note is blank', async () => {
        const flow = renderFlow()
        await fill(flow, { message: '   ' })
        flow.run(a => a.review())
        flow.run(a => a.confirm())
        await waitFor(() => expect(transferStars).toHaveBeenCalled())
        const row = transferStars.mock.calls[0][0][0]
        expect(row.description).toBe('')
        expect('description' in row).toBe(true)
    })

    it('refuses a fractional amount rather than rounding somebody’s Star', async () => {
        const flow = renderFlow()
        await fill(flow, { amount: '3.5' })
        expect(flow.read().amountProblem).toBe('invalid')
        expect(flow.read().canReview).toBe(false)
    })

    it('states a shortfall on the field and still does not post it', async () => {
        affordable.value = false
        const flow = renderFlow()
        await fill(flow, { amount: '5000' })
        expect(flow.read().amountProblem).toBe('insufficient')
        flow.run(a => a.confirm())
        expect(transferStars).not.toHaveBeenCalled()
    })

    /*
     * The write answers with the records it created but **without `user`**, so the receipt used to
     * name nobody — `PartyCard` fell back to printing the transfer ID as the Tevi ID. The receiver is
     * the one thing on that screen the client already knows.
     */
    it('names the receiver on the receipt even when the response omits it', async () => {
        transferStars.mockResolvedValue([
            { id: 'TR-99', stars: 250, fee: 0, description: '', createdAt: 1, party: null },
        ])
        const flow = renderFlow()
        await fill(flow, { amount: '250' })
        flow.run(a => a.review())
        flow.run(a => a.confirm())
        await waitFor(() => expect(flow.read().step).toBe('receipt'))
        expect(flow.read().receipt[0].party).toEqual(ADA)
    })

    it('shows the receipt from the response, not from the form', async () => {
        transferStars.mockResolvedValue([
            { id: 'TR-99', stars: 200, fee: 50, description: '', createdAt: 1, party: ADA },
        ])
        const flow = renderFlow()
        await fill(flow, { amount: '250' })
        flow.run(a => a.review())
        flow.run(a => a.confirm())
        await waitFor(() => expect(flow.read().step).toBe('receipt'))
        // 200 and a fee of 50, which is what the server said — not the 250 that was typed.
        expect(flow.read().receipt).toEqual([
            { id: 'TR-99', stars: 200, fee: 50, description: '', createdAt: 1, party: ADA },
        ])
        expect(refreshBalance).toHaveBeenCalled()
    })

    it('keeps the form when the reader goes back from the review screen', async () => {
        const flow = renderFlow()
        await fill(flow, { amount: '250', message: 'hello' })
        flow.run(a => a.review())
        flow.run(a => a.back())
        expect(flow.read().step).toBe('form')
        expect(flow.read().receiverId).toBe(ADA.id)
        expect(flow.read().amount).toBe('250')
        expect(flow.read().message).toBe('hello')
    })

    it('clears everything on close, and on "send more"', async () => {
        const flow = renderFlow()
        await fill(flow, { amount: '250', message: 'hello' })
        flow.run(a => a.close())
        expect(flow.read().step).toBe('closed')
        expect(flow.read().receiverId).toBe('')

        await fill(flow, { amount: '250', message: 'hello' })
        flow.run(a => a.sendMore())
        expect(flow.read().step).toBe('form')
        expect(flow.read().amount).toBe('')
        expect(flow.read().message).toBe('')
    })

    it('caps the note at the length its counter counts against', () => {
        const flow = renderFlow()
        flow.run(a => a.open())
        flow.run(a => a.setMessage('x'.repeat(400)))
        expect(flow.read().message).toHaveLength(128)
    })
})
