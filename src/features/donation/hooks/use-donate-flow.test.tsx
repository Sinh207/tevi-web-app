// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDonateFlow } from './use-donate-flow'

/**
 * What this hook promises, none of which is visible from a call site: the form starts at the
 * creator's own unit price, the two fields move each other in only one lossy direction, the write
 * carries the **total** rather than the count, it lands on the account that was active when the
 * button was pressed, and each of the two guards blocks at its own step.
 *
 * The guards are the reason this is a hook test rather than four more cases in
 * `donation-amount.test.ts`. "Signed out cannot reach the form" and "a shortfall does not post" are
 * statements about *ordering*, and a comment cannot pin an ordering.
 */

const getOffer = vi.hoisted(() => vi.fn())
const donateStars = vi.hoisted(() => vi.fn())
const authed = vi.hoisted(() => ({ value: true }))
const affordable = vi.hoisted(() => ({ value: true }))
const activeId = vi.hoisted(() => ({ value: 'acct-1' }))

vi.mock('../api/donation-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/donation-api')>('../api/donation-api')
    return { ...actual, donationApi: { getOffer, donateStars } }
})

vi.mock('@features/auth', () => ({
    useAuth: () => ({ activeId: activeId.value }),
    // The real hook returns a wrapper that either runs the callback or opens the login dialog.
    useRequireAuth:
        () =>
        (cb: (...a: unknown[]) => void) =>
        (...a: unknown[]) => {
            if (authed.value) cb(...a)
        },
}))

vi.mock('@features/balance', () => ({
    STAR_CURRENCY: 'TVS',
    balanceKeys: { all: ['balance'] },
    useRequireStars:
        () =>
        (_cost: number, cb: (...a: unknown[]) => void) =>
        (...a: unknown[]) => {
            if (affordable.value) cb(...a)
        },
}))

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

const OFFER = {
    name: 'Coffee',
    icon: 'coffee' as const,
    button_text: null,
    thank_you_msg: null,
    display_supporter_count: true,
    donation_count: 3,
    prices: [
        { id: 'usd', amount: 1, amount_currency: 'USD' },
        { id: 'tvs', amount: 250, amount_currency: 'TVS' },
    ],
}

const TARGET = { id: 'ch_1', slug: 'ada', name: 'Ada' }

/**
 * The checkout, stubbed. `hasProvider` is what a `/app/*` webview looks like from in here — no
 * provider above the dialog, so the cash tab is offered but cannot be completed.
 */
const checkout = vi.hoisted(() => vi.fn())
const hasProvider = vi.hoisted(() => ({ value: true }))

vi.mock('@features/payment', () => ({
    DEFAULT_GATEWAY_ID: 'gw.stripe',
    usePaymentOptional: () => (hasProvider.value ? { checkout } : null),
}))

function renderFlow() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    let api!: ReturnType<typeof useDonateFlow>
    function Probe() {
        api = useDonateFlow(TARGET)
        return null
    }
    render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return {
        queryClient,
        /** Every `queryKey` the flow invalidated, in order. */
        invalidated: () => invalidate.mock.calls.map(([filters]) => filters?.queryKey),
        read: () => api,
        run: (fn: (a: typeof api) => void) => act(() => fn(api)),
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    hasProvider.value = true
    authed.value = true
    affordable.value = true
    activeId.value = 'acct-1'
    getOffer.mockResolvedValue(OFFER)
    donateStars.mockResolvedValue({})
})

describe('opening the form', () => {
    it('seeds the amount from the creator’s own Star price, not from a constant', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())

        flow.run(f => f.open())

        expect(flow.read().step).toBe('details')
        expect(flow.read().amount).toBe('250')
        expect(flow.read().quantity).toBe('1')
    })

    it('does not reach the form when signed out — the login dialog comes first', async () => {
        authed.value = false
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())

        flow.run(f => f.open())

        // Legacy lets a signed-out visitor fill the whole form and only bounces them at the end.
        expect(flow.read().step).toBe('closed')
    })
})

describe('the two fields', () => {
    it('multiplies the amount up from the stepper', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())

        flow.run(f => f.stepBy(1))

        expect(flow.read().quantity).toBe('2')
        expect(flow.read().amount).toBe('500')
    })

    it('never steps below one', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())

        flow.run(f => f.stepBy(-1))
        flow.run(f => f.stepBy(-1))

        expect(flow.read().quantity).toBe('1')
    })

    it('floors the counter to a typed amount and leaves the amount alone', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())

        flow.run(f => f.changeAmount('300'))

        // 300 buys one whole 250 coffee. The amount is what is charged; the counter lags.
        expect(flow.read().quantity).toBe('1')
        expect(flow.read().amount).toBe('300')
    })

    it('keeps a half-typed value in the field rather than coercing it', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())

        flow.run(f => f.changeAmount(''))

        expect(flow.read().amount).toBe('')
        expect(flow.read().canSubmit).toBe(false)
    })
})

describe('the write', () => {
    it('sends the total Star, not the number of units', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.stepBy(1))
        flow.run(f => f.setMessage('  thanks  '))

        flow.run(f => f.confirm())

        await waitFor(() => expect(donateStars).toHaveBeenCalled())
        // 2 × 250, not 2 — sending the count would undercharge by the unit price.
        expect(donateStars).toHaveBeenCalledWith(
            'ada',
            { amount: 500, message: '  thanks  ' },
            'acct-1',
        )
    })

    it('lands on the account that was active when it was pressed', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())

        flow.run(f => f.confirm())

        await waitFor(() => expect(donateStars).toHaveBeenCalled())
        expect(donateStars.mock.calls[0][2]).toBe('acct-1')
    })

    it('shows the thank-you and refreshes the balance only after it lands', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.review())
        expect(flow.read().step).toBe('confirm')

        flow.run(f => f.confirm())

        await waitFor(() => expect(flow.read().step).toBe('success'))
        /*
         * The balance **prefix**, not the active account's key: after a mid-flight account switch the
         * `useBalance().refresh()` helper would refresh the one account the debit did not touch.
         */
        expect(flow.invalidated()).toContainEqual(['balance'])
    })

    it('does not post when the balance is short, and leaves the form standing', async () => {
        affordable.value = false
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.review())

        flow.run(f => f.confirm())

        expect(donateStars).not.toHaveBeenCalled()
        // The shortfall is a toast over the dialog; legacy closes it and discards the form.
        expect(flow.read().step).toBe('confirm')
    })

    it('does not post an empty amount even if the press gets through', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.changeAmount(''))

        flow.run(f => f.confirm())

        expect(donateStars).not.toHaveBeenCalled()
    })

    it('stays on the confirm step when the write fails', async () => {
        donateStars.mockRejectedValue(new Error('nope'))
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.review())

        flow.run(f => f.confirm())

        await waitFor(() => expect(donateStars).toHaveBeenCalled())
        expect(flow.read().step).toBe('confirm')
        expect(flow.invalidated()).not.toContainEqual(['balance'])
    })
})

describe('choosing how to pay', () => {
    it('offers the cash tab only when the creator priced it', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())

        expect(flow.read().offersCash).toBe(true)
    })

    it('re-prices the same quantity rather than converting the amount', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.stepBy(2)) // 3 × 250 Star

        flow.run(f => f.changeCurrency('cash'))

        // Three coffees stay three coffees. `750` must not become `$750`.
        expect(flow.read().quantity).toBe('3')
        expect(flow.read().amount).toBe('3')

        flow.run(f => f.changeCurrency('star'))
        expect(flow.read().amount).toBe('750')
    })

    it('hands a cash donation to the checkout, and closes', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.changeCurrency('cash'))
        flow.run(f => f.changeAmount('5'))
        flow.run(f => f.setMessage('  thanks  '))

        expect(flow.read().isCashAvailable).toBe(true)
        flow.run(f => f.confirm())

        expect(checkout).toHaveBeenCalledWith({
            kind: 'donation',
            gatewayId: 'gw.stripe',
            channelId: 'ch_1',
            amountUsd: 5,
            message: 'thanks',
            // The **donation**, not the total: a button naming a bigger figure than the reader typed
            // reads as a bait-and-switch. The fee row above it already showed the difference.
            amountLabel: '$5.00',
        })
        // The checkout owns the screen from here; two stacked dialogs is the alternative.
        expect(flow.read().step).toBe('closed')
        // Star was never touched.
        expect(donateStars).not.toHaveBeenCalled()
    })

    it('does not offer cash where there is no provider — a webview, by design', async () => {
        hasProvider.value = false
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.changeCurrency('cash'))

        expect(flow.read().isCashAvailable).toBe(false)
        expect(flow.read().canSubmit).toBe(false)

        flow.run(f => f.confirm())
        expect(checkout).not.toHaveBeenCalled()
        expect(donateStars).not.toHaveBeenCalled()
    })

    it('does not weigh a cash figure against the Star balance', async () => {
        // The unit mix-up this guards: refusing a card payment for being short of Star.
        affordable.value = false
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.changeCurrency('cash'))

        flow.run(f => f.confirm())

        /*
         * The card path ran — `useRequireStars` is not in front of it. The guard this pins is the unit
         * mix-up: refusing a **card** payment because a **Star** balance is short.
         */
        expect(checkout).toHaveBeenCalled()
        expect(donateStars).not.toHaveBeenCalled()
    })

    it('always reopens on Star, the option that can be completed', async () => {
        const flow = renderFlow()
        await waitFor(() => expect(flow.read().offer).not.toBeNull())
        flow.run(f => f.open())
        flow.run(f => f.changeCurrency('cash'))
        flow.run(f => f.close())

        flow.run(f => f.open())

        expect(flow.read().currency).toBe('star')
        expect(flow.read().amount).toBe('250')
    })
})
