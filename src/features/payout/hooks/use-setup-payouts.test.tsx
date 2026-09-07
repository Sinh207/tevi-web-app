// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSetupPayouts } from './use-setup-payouts'

/**
 * The billing country's **preselect**, which is the one part of this screen a call site cannot see.
 *
 * It has three conditions and each one fails quietly if it is wrong: no detection means a form
 * prefilled with a country the creator does not bank in (legacy defaults to `US`), a code billy does
 * not pay into means a dead end, and a late detection overriding a manual pick means the country
 * moves under somebody who has already answered.
 */

const getCountries = vi.hoisted(() => vi.fn())
const getMethods = vi.hoisted(() => vi.fn())
const createConfig = vi.hoisted(() => vi.fn())

vi.mock('../api/payout-api', async () => {
    const actual = await vi.importActual<typeof import('../api/payout-api')>('../api/payout-api')
    return {
        ...actual,
        payoutApi: { ...actual.payoutApi, getCountries, getMethods, createConfig },
    }
})

const auth = vi.hoisted(() => ({
    state: {
        activeId: 'acc-1' as string | null,
        currentUser: { id: 'acc-1', email: 'ada@tevi.com', display_name: 'Ada' },
        isAuthenticated: true,
        isBootstrapping: false,
    },
}))
vi.mock('@features/auth', () => ({
    useAuth: () => auth.state,
    accountEmail: (user: { email?: string } | null) => user?.email ?? null,
    accountDisplayName: (user: { display_name?: string } | null) => user?.display_name ?? null,
}))

/** The detected country, swappable mid-test — that is how a *late* detection is stated. */
const geo = vi.hoisted(() => ({ state: { country: null as string | null, isKnown: true } }))
vi.mock('@shared/lib/geo-provider', () => ({ useCountry: () => geo.state }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const COUNTRIES = [
    { code: 'ID', name: 'Indonesia' },
    { code: 'US', name: 'United States' },
    { code: 'VN', name: 'Viet Nam' },
]

function renderHook() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    let api: ReturnType<typeof useSetupPayouts> | undefined
    function Probe() {
        api = useSetupPayouts()
        return null
    }
    const view = render(
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>,
    )
    return { read: () => api as ReturnType<typeof useSetupPayouts>, rerender: () => view.rerender }
}

/** One method with one field, so a valid form is three `setValue` calls. */
const VAI = {
    id: 'pm_vai',
    name: 'VAI Wallet',
    slug: 'vai_wallet',
    logo: '',
    currency: 'USDT',
    countryName: 'Viet Nam',
    processingTimeNote: '',
    dailyLimit: null,
    minimumAmount: null,
    form: [{ field: 'wallet_address', displayName: 'Address', choices: [] }],
}

beforeEach(() => {
    vi.clearAllMocks()
    geo.state = { country: null, isKnown: true }
    getCountries.mockResolvedValue(COUNTRIES)
    getMethods.mockResolvedValue([])
    createConfig.mockResolvedValue(undefined)
})

/** A hook with `VAI` selected and a valid form — the state a submit needs. */
async function readyToSubmit() {
    getMethods.mockResolvedValue([VAI])
    geo.state = { country: 'VN', isKnown: true }
    const { read } = renderHook()

    await waitFor(() => expect(read().methods).toHaveLength(1))
    await act(async () => {
        read().select(read().methods[0])
    })
    await act(async () => {
        read().setValue('wallet_address', 'vai-123')
    })
    await waitFor(() => expect(read().canSubmit).toBe(true))
    return read
}

describe('useSetupPayouts — the country preselect', () => {
    it('preselects where the visitor is calling from, and loads that country’s methods', async () => {
        geo.state = { country: 'VN', isKnown: true }
        const { read } = renderHook()

        await waitFor(() => expect(read().country?.code).toBe('VN'))
        // The methods request is the proof it actually took effect: the screen is one step ahead.
        await waitFor(() =>
            expect(getMethods).toHaveBeenCalledWith(
                expect.objectContaining({ countryCode: 'VN', accountId: 'acc-1' }),
            ),
        )
    })

    it('asks when nothing could say, rather than guessing a country', async () => {
        const { read } = renderHook()

        await waitFor(() => expect(read().countries).toHaveLength(3))
        expect(read().country).toBeNull()
        // No country, no method request — the screen says which answer it is waiting for.
        expect(getMethods).not.toHaveBeenCalled()
    })

    it('ignores a country billy does not pay into', async () => {
        // `payout/countries/` is already `allow_payout` only, so "not in the list" means exactly that.
        geo.state = { country: 'FR', isKnown: true }
        const { read } = renderHook()

        await waitFor(() => expect(read().countries).toHaveLength(3))
        expect(read().country).toBeNull()
        expect(getMethods).not.toHaveBeenCalled()
    })

    it('never moves a country the creator has already chosen', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(read().countries).toHaveLength(3))

        await act(async () => {
            read().selectCountry('US')
        })
        expect(read().country?.code).toBe('US')

        /*
         * The fallback request lands *after* the pick — the case the `countryCode` guard exists for.
         * The re-render is triggered by something unrelated to the country (`setVariant`), so the
         * effect is the only thing that could move it.
         */
        geo.state = { country: 'VN', isKnown: true }
        await act(async () => {
            read().setVariant('corporation')
        })

        await waitFor(() => expect(read().variant).toBe('corporation'))
        expect(read().country?.code).toBe('US')
    })

    it('applies a detection that arrives late while nothing is chosen', async () => {
        const { read } = renderHook()
        await waitFor(() => expect(read().countries).toHaveLength(3))
        expect(read().country).toBeNull()

        geo.state = { country: 'ID', isKnown: true }
        // Any state change re-renders the hook; the picker being untouched is the point.
        await act(async () => {
            read().setVariant('individual')
        })

        await waitFor(() => expect(read().country?.code).toBe('ID'))
    })
})

describe('useSetupPayouts — the write', () => {
    it('posts once when the form is submitted twice in a tick', async () => {
        /*
         * The money case. `isPending` is last render's and so is the button's `disabled`, so a
         * double-tap — or Enter in a field followed by a click — dispatched **two** POSTs before this
         * had a ref latch: two identical payout destinations saved against one intent, which the
         * client cannot tell apart afterwards (same method, same detail, two ids).
         */
        const read = await readyToSubmit()

        await act(async () => {
            read().submit()
            read().submit()
        })

        expect(createConfig).toHaveBeenCalledTimes(1)
    })

    it('posts the body the method asked for, pinned to the account', async () => {
        const read = await readyToSubmit()

        await act(async () => {
            read().submit()
        })

        expect(createConfig).toHaveBeenCalledWith({
            accountId: 'acc-1',
            body: {
                payout_method_id: 'pm_vai',
                payout_detail: { wallet_address: 'vai-123' },
                contact_name: 'Ada',
                contact_email: 'ada@tevi.com',
            },
        })
    })

    it('leaves the form pressable after a rejected press', async () => {
        // An invalid form must not latch: the reader fixes the field and presses again.
        getMethods.mockResolvedValue([VAI])
        geo.state = { country: 'VN', isKnown: true }
        const { read } = renderHook()
        await waitFor(() => expect(read().methods).toHaveLength(1))
        await act(async () => {
            read().select(read().methods[0])
        })

        // Nothing typed: the validator answers, nothing is posted.
        await act(async () => {
            read().submit()
        })
        expect(createConfig).not.toHaveBeenCalled()
        expect(read().errors.wallet_address).toBe('required')

        await act(async () => {
            read().setValue('wallet_address', 'vai-123')
        })
        await act(async () => {
            read().submit()
        })
        expect(createConfig).toHaveBeenCalledTimes(1)
    })
})
