// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentKeys } from '../api/keys'
import { useAddCard, useCardSetupForm } from './use-add-card'

/**
 * The four things this pair promises that are invisible from the dialog:
 *
 * 1. **A `null` SetupIntent is an error state, not an empty form.** Legacy renders `<Elements>` over a
 *    response with no client secret and the reader gets a header above blank space.
 * 2. **One intent per open**, not one per effect run — React's StrictMode double-invokes effects, and
 *    each extra run is a Stripe object created in our account.
 * 3. **Stripe's message reaches the reader only when Stripe wrote it for them** — `card_error` and
 *    `validation_error`. Everything else is our own key, per the `signInErrorText` rule.
 * 4. **The card is attributed to the account the intent was minted for**, which is not necessarily
 *    the one active when Save is pressed: the intent is bound to a Stripe customer server-side.
 *
 * A confirmation that does **not** redirect is also exercised, because reading `error.type` off a
 * successful result is `docs/PAYMENT.md` §1.4 #4 — a `TypeError` on the happy path.
 */

const createSetupIntent = vi.hoisted(() => vi.fn())
const setDefault = vi.hoisted(() => vi.fn())

vi.mock('../api/payment-methods-api', async () => {
    const actual = await vi.importActual<typeof import('../api/payment-methods-api')>(
        '../api/payment-methods-api',
    )
    return {
        ...actual,
        paymentMethodsApi: { ...actual.paymentMethodsApi, createSetupIntent, setDefault },
    }
})

const confirmSetup = vi.hoisted(() => vi.fn())
/**
 * The Stripe seam, at the React level.
 *
 * `useStripe`/`useElements` read a context `<Elements>` provides, and `<Elements>` loads a script from
 * another origin — there is no version of that a unit test can run. So the two hooks are the injection
 * point here, the same way `setStripeLoader` is for anything calling `getStripe` directly.
 */
vi.mock('@stripe/react-stripe-js', () => ({
    useStripe: () => ({ confirmSetup }),
    useElements: () => ({ elements: true }),
}))

const auth = vi.hoisted(() => ({ activeId: '1' as string | null, isAuthenticated: true }))
vi.mock('@features/auth', () => ({ useAuth: () => auth }))

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderProbe<T>(useHook: () => T) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: T | null = null
    function Probe() {
        api = useHook()
        return null
    }
    /*
     * A **new** element every time. React bails out of re-rendering when handed the identical
     * element object (old props === new props), so a `rerender` reusing one would never pick up a
     * changed account — and the re-mint test below would pass without testing anything.
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
    createSetupIntent.mockReset()
    setDefault.mockReset()
    confirmSetup.mockReset()
    setDefault.mockResolvedValue(undefined)
})

describe('useAddCard — minting the intent', () => {
    it('surfaces a response with no client secret as unavailable, not as an empty form', async () => {
        createSetupIntent.mockResolvedValue(null)

        const { get } = renderProbe(() => useAddCard({ open: true }))

        await waitFor(() => expect(get().isUnavailable).toBe(true))
        expect(get().clientSecret).toBeNull()
        expect(get().isPreparing).toBe(false)
    })

    it('surfaces a failed request as unavailable too', async () => {
        createSetupIntent.mockRejectedValue(new Error('500'))

        const { get } = renderProbe(() => useAddCard({ open: true }))

        await waitFor(() => expect(get().isUnavailable).toBe(true))
    })

    it('holds the secret and the account it was minted for', async () => {
        createSetupIntent.mockResolvedValue({ id: 'seti_1', clientSecret: 'seti_1_secret' })

        const { get } = renderProbe(() => useAddCard({ open: true }))

        await waitFor(() => expect(get().clientSecret).toBe('seti_1_secret'))
        expect(get().accountId).toBe('1')
        expect(get().isUnavailable).toBe(false)
        expect(createSetupIntent).toHaveBeenCalledWith({ accountId: '1' })
    })

    it('retry sends a second request — nothing else in the effect can change', async () => {
        /*
         * The bug this pins: `retry()` cleared the guard and reset the mutation, but every dependency
         * of the minting effect is referentially stable (`mutate`/`reset` are bound once by TanStack),
         * so the effect never re-ran. The dialog swapped its error for a spinner and sent **zero**
         * requests — a worse state than the error it replaced, recoverable only by reopening.
         */
        createSetupIntent.mockRejectedValueOnce(new Error('500'))
        createSetupIntent.mockResolvedValue({ id: 'seti_2', clientSecret: 'seti_2_secret' })

        const { get } = renderProbe(() => useAddCard({ open: true }))
        await waitFor(() => expect(get().isUnavailable).toBe(true))
        expect(createSetupIntent).toHaveBeenCalledTimes(1)

        await act(async () => get().retry())

        await waitFor(() => expect(get().clientSecret).toBe('seti_2_secret'))
        expect(createSetupIntent).toHaveBeenCalledTimes(2)
        expect(get().isUnavailable).toBe(false)
    })

    it('mints once per open, however many times the effect runs', async () => {
        createSetupIntent.mockResolvedValue({ id: 'seti_1', clientSecret: 'seti_1_secret' })

        const { get, rerender } = renderProbe(() => useAddCard({ open: true }))
        await waitFor(() => expect(get().clientSecret).toBe('seti_1_secret'))

        rerender()
        rerender()

        expect(createSetupIntent).toHaveBeenCalledTimes(1)
    })

    it('mints nothing while the dialog is closed', async () => {
        createSetupIntent.mockResolvedValue({ id: 'seti_1', clientSecret: 'seti_1_secret' })

        const { get } = renderProbe(() => useAddCard({ open: false }))

        expect(createSetupIntent).not.toHaveBeenCalled()
        expect(get().isPreparing).toBe(false)
    })

    it('re-mints when the account changes under an open dialog', async () => {
        createSetupIntent.mockImplementation(({ accountId }: { accountId: string | null }) =>
            Promise.resolve({ id: `seti_${accountId}`, clientSecret: `secret_${accountId}` }),
        )

        const { get, rerender } = renderProbe(() => useAddCard({ open: true }))
        await waitFor(() => expect(get().clientSecret).toBe('secret_1'))

        auth.activeId = '2'
        rerender()

        // An intent belongs to one Stripe customer, so confirming account 1's after switching to 2
        // would attach the card to the wrong account.
        await waitFor(() => expect(get().clientSecret).toBe('secret_2'))
        expect(get().accountId).toBe('2')
        expect(createSetupIntent).toHaveBeenCalledTimes(2)
    })
})

describe('useCardSetupForm — confirming', () => {
    const form = (accountId: string | null, onSaved = () => {}) =>
        useCardSetupForm({ accountId, returnPath: '/card-management', onSaved })

    it('confirms with a return URL built from the app’s own origin', async () => {
        confirmSetup.mockResolvedValue({ setupIntent: { payment_method: 'pm_1' } })

        const { get } = renderProbe(() => form('1'))
        await act(async () => {
            get().confirm(false)
        })

        expect(confirmSetup).toHaveBeenCalledWith({
            elements: { elements: true },
            confirmParams: { return_url: 'https://tevi.dev/card-management' },
            redirect: 'if_required',
        })
        // No error read off a successful, non-redirecting result — §1.4 #4.
        expect(get().errorText).toBeNull()
        expect(get().errorKey).toBeNull()
    })

    it('flags the new card as default under the account the intent was minted for', async () => {
        confirmSetup.mockResolvedValue({ setupIntent: { payment_method: 'pm_1' } })
        auth.activeId = '2' // the reader switched; the intent is still account 1's

        const { queryClient, get } = renderProbe(() => form('1'))
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

        await act(async () => {
            get().confirm(true)
        })

        await waitFor(() => expect(setDefault).toHaveBeenCalledWith('pm_1', { accountId: '1' }))
        expect(invalidate).toHaveBeenCalledWith({ queryKey: paymentKeys.cards('1') })
    })

    it('reads the payment method id whether it arrives expanded or as a string', async () => {
        confirmSetup.mockResolvedValue({ setupIntent: { payment_method: { id: 'pm_expanded' } } })

        const { get } = renderProbe(() => form('1'))
        await act(async () => {
            get().confirm(true)
        })

        // `'pm_expanded'.id` is `undefined`, which would have sent `set-as-default/undefined/`.
        await waitFor(() =>
            expect(setDefault).toHaveBeenCalledWith('pm_expanded', { accountId: '1' }),
        )
    })

    it('still counts the card as saved when flagging it default fails', async () => {
        confirmSetup.mockResolvedValue({ setupIntent: { payment_method: 'pm_1' } })
        setDefault.mockRejectedValue(new Error('502'))
        const onSaved = vi.fn()

        const { get } = renderProbe(() => form('1', onSaved))
        await act(async () => {
            get().confirm(true)
        })

        // The card exists. Failing the whole dialog here would invite a second card.
        await waitFor(() => expect(onSaved).toHaveBeenCalled())
        expect(get().errorKey).toBeNull()
    })

    it('shows Stripe’s own sentence for a decline', async () => {
        confirmSetup.mockResolvedValue({
            error: {
                type: 'card_error',
                code: 'card_declined',
                message: 'Your card was declined.',
            },
        })

        const { get } = renderProbe(() => form('1'))
        await act(async () => {
            get().confirm(false)
        })

        await waitFor(() => expect(get().errorText).toBe('Your card was declined.'))
        // One message, never both — see the hook's note.
        expect(get().errorKey).toBeNull()
    })

    it('shows Stripe’s own sentence for a validation error', async () => {
        confirmSetup.mockResolvedValue({
            error: { type: 'validation_error', message: 'Your card number is incomplete.' },
        })

        const { get } = renderProbe(() => form('1'))
        await act(async () => {
            get().confirm(false)
        })

        await waitFor(() => expect(get().errorText).toBe('Your card number is incomplete.'))
    })

    it('uses our own key for an infrastructure failure', async () => {
        confirmSetup.mockResolvedValue({
            error: { type: 'api_error', message: 'An unexpected error occurred at api.stripe.com' },
        })

        const { get } = renderProbe(() => form('1'))
        await act(async () => {
            get().confirm(false)
        })

        await waitFor(() => expect(get().errorKey).toBe('payment_card_add_failed'))
        expect(get().errorText).toBeNull()
    })

    it('does not save, and does not announce, when the confirmation failed', async () => {
        confirmSetup.mockResolvedValue({ error: { type: 'card_error', message: 'Declined.' } })
        const onSaved = vi.fn()

        const { get } = renderProbe(() => form('1', onSaved))
        await act(async () => {
            get().confirm(true)
        })

        await waitFor(() => expect(get().errorText).toBe('Declined.'))
        expect(setDefault).not.toHaveBeenCalled()
        expect(onSaved).not.toHaveBeenCalled()
    })

    it('drops a second press while the first is in flight', async () => {
        confirmSetup.mockReturnValue(new Promise(() => {}))

        const { get } = renderProbe(() => form('1'))
        act(() => get().confirm(false))
        await waitFor(() => expect(get().isConfirming).toBe(true))
        act(() => get().confirm(false))

        expect(confirmSetup).toHaveBeenCalledTimes(1)
    })
})
