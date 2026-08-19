// @vitest-environment jsdom
import { addOrUpdateAccount, clearTokens, setActiveAccount } from '@shared/lib/api/token'
import { DEFAULT_CURRENCY } from '@shared/lib/money'
import { STORAGE_KEYS } from '@shared/lib/storage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCurrency } from './use-currency'

/**
 * What this hook promises, none of which is visible from its call site:
 *
 * - the choice is remembered **per account**, so two creators signed in side by side are not relabelling
 *   each other's money;
 * - switching accounts switches currency **on the same render**, with no frame showing the previous
 *   account's symbol on this account's figures;
 * - the picker's list always contains the current selection, even when the exchange service has never
 *   answered or no longer lists it;
 * - a failed rate degrades to `1`, which shows USD, rather than to `0` or to an error.
 *
 * The account-switch case is the one a comment cannot pin down: "the currency follows the account with no
 * intermediate frame" is a claim about *when*, and only a test can state it.
 */

const getCurrencies = vi.hoisted(() => vi.fn())
const getExchangeRate = vi.hoisted(() => vi.fn())

vi.mock('../api/exchange-api', async () => {
    const actual =
        await vi.importActual<typeof import('../api/exchange-api')>('../api/exchange-api')
    return { ...actual, exchangeApi: { getCurrencies, getExchangeRate } }
})

function seedAccount(id: string) {
    addOrUpdateAccount({
        id,
        access_token: `token-${id}`,
        refresh_token: `refresh-${id}`,
        expires_in: 3600,
        user: { id },
    })
}

/**
 * `useCurrency` reads `useAuth`, which needs the whole `AuthProvider`. The only parts of it this hook
 * consults are `activeId` and `isAuthenticated`, so it is stubbed to those — which keeps the test about
 * currency rather than about session bootstrap.
 */
const authState = { activeId: null as string | null, isAuthenticated: false }

vi.mock('@features/auth', () => ({ useAuth: () => authState }))

function renderCurrency() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let api: ReturnType<typeof useCurrency> | null = null
    function Probe() {
        api = useCurrency()
        return null
    }
    // Built fresh each call: React bails out of a re-render handed a referentially identical element, so a
    // hoisted tree would make `rerender()` a no-op and the account-switch test pass against stale data.
    const tree = () => (
        <QueryClientProvider client={queryClient}>
            <Probe />
        </QueryClientProvider>
    )
    const view = render(tree())
    return {
        read: () => api as ReturnType<typeof useCurrency>,
        select: (code: string) =>
            act(() => (api as ReturnType<typeof useCurrency>).selectCurrency(code)),
        rerender: () => view.rerender(tree()),
    }
}

function storedMap(): Record<string, string> {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.walletCurrency) ?? '{}')
}

beforeEach(() => {
    localStorage.clear()
    clearTokens()
    getCurrencies.mockReset()
    getExchangeRate.mockReset()
    getCurrencies.mockResolvedValue([
        { code: 'USD', name: 'US Dollar', symbol: '$', decimalDigits: 2 },
        { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalDigits: 0 },
    ])
    getExchangeRate.mockResolvedValue(25_400)
    authState.activeId = null
    authState.isAuthenticated = false
})

/** Every test but the anonymous one needs a signed-in account. */
function signIn(id = '1') {
    seedAccount(id)
    setActiveAccount(id)
    authState.activeId = id
    authState.isAuthenticated = true
}

describe('useCurrency', () => {
    it('defaults to USD before anything has been chosen', () => {
        signIn()
        expect(renderCurrency().read().currency).toEqual(DEFAULT_CURRENCY)
    })

    it('applies a choice on the same render and persists it under the account id', async () => {
        signIn()
        const { read, select } = renderCurrency()
        await waitFor(() => expect(read().currencies).toHaveLength(2))

        select('VND')

        expect(read().currency.code).toBe('VND')
        expect(read().currency.decimalDigits).toBe(0)
        // Keyed by account, not a bare string — see `STORAGE_KEYS.walletCurrency`.
        expect(storedMap()).toEqual({ '1': 'VND' })
    })

    /*
     * The bug this pins: a currency held in state and seeded once would leave account B looking at account
     * A's unit, so B's figures would be relabelled `₫` while the numbers stayed B's. There must be no frame
     * in which that is true, which is why the assertion is synchronous.
     */
    it('follows an account switch immediately, with no intermediate frame', async () => {
        signIn('1')
        seedAccount('2')
        const { read, select, rerender } = renderCurrency()
        await waitFor(() => expect(read().currencies).toHaveLength(2))
        select('VND')
        expect(read().currency.code).toBe('VND')

        // The switch: account 2 has chosen nothing, so it is USD.
        authState.activeId = '2'
        act(() => rerender())
        expect(read().currency.code).toBe('USD')

        // …and switching back restores account 1's choice from storage, not from stale state.
        authState.activeId = '1'
        act(() => rerender())
        expect(read().currency.code).toBe('VND')
    })

    /*
     * The write merges rather than replaces, so one account's choice never clears the other nine's. Both
     * accounts pick something other than USD, because picking the value already selected is a no-op by
     * design (see the last test) and would prove nothing here.
     */
    it('keeps each account choice separate rather than overwriting the map', async () => {
        signIn('1')
        seedAccount('2')
        const { read, select, rerender } = renderCurrency()
        await waitFor(() => expect(read().currencies).toHaveLength(2))
        select('VND')

        authState.activeId = '2'
        act(() => rerender())
        select('KRW')

        expect(storedMap()).toEqual({ '1': 'VND', '2': 'KRW' })
        expect(read().currency.code).toBe('KRW')
    })

    /*
     * A picker whose current value is absent from its own list shows nothing selected, which reads as "no
     * currency chosen" on a screen whose figures are visibly in one. Both ways it can happen are covered:
     * the list has not loaded, and the list loaded without the persisted code.
     */
    it('guarantees the selection is in the list before the list has loaded', () => {
        signIn()
        localStorage.setItem(STORAGE_KEYS.walletCurrency, JSON.stringify({ '1': 'VND' }))

        const { read } = renderCurrency()
        expect(read().currencies.map(c => c.code)).toContain('VND')
        expect(read().currency.code).toBe('VND')
    })

    it('guarantees the selection is in the list when the service no longer lists it', async () => {
        signIn()
        localStorage.setItem(STORAGE_KEYS.walletCurrency, JSON.stringify({ '1': 'XAF' }))
        getCurrencies.mockResolvedValue([
            { code: 'USD', name: 'US Dollar', symbol: '$', decimalDigits: 2 },
        ])

        const { read } = renderCurrency()
        await waitFor(() => expect(read().currencies.length).toBeGreaterThan(1))

        expect(read().currency.code).toBe('XAF')
        // No record, so no symbol — `formatFiatAmount` then prints the code, which beats silently switching
        // the reader to dollars.
        expect(read().currency.symbol).toBe('')
        expect(read().currencies[0].code).toBe('XAF')
    })

    it('reads a persisted lower-case code', () => {
        signIn()
        localStorage.setItem(STORAGE_KEYS.walletCurrency, JSON.stringify({ '1': 'vnd' }))
        expect(renderCurrency().read().currency.code).toBe('VND')
    })

    it('exposes the rate, and falls back to 1 while it is unknown', async () => {
        signIn()
        const { read } = renderCurrency()
        // Before the query settles: 1, which renders the underlying USD rather than a wrong figure.
        expect(read().rate).toBe(1)
        await waitFor(() => expect(read().rate).toBe(25_400))
    })

    /*
     * A dead exchange service must degrade to "shows USD", not to an error and not to zero — which is why
     * `normalizeExchangeRate` makes 1 the failure value and why nothing here throws.
     */
    it('falls back to 1 when the rate request fails', async () => {
        signIn()
        getExchangeRate.mockRejectedValue(new Error('gateway'))

        const { read } = renderCurrency()
        await waitFor(() => expect(getExchangeRate).toHaveBeenCalled())
        expect(read().rate).toBe(1)
    })

    it('asks for nothing at all for an anonymous session', () => {
        const { read } = renderCurrency()
        expect(getCurrencies).not.toHaveBeenCalled()
        expect(getExchangeRate).not.toHaveBeenCalled()
        expect(read().currency).toEqual(DEFAULT_CURRENCY)
    })

    it('ignores a no-op selection', async () => {
        signIn()
        const { read, select } = renderCurrency()
        await waitFor(() => expect(read().currencies).toHaveLength(2))

        select('USD')
        // Nothing written: the default is not a choice until it differs from one.
        expect(storedMap()).toEqual({})
        select('  ')
        expect(storedMap()).toEqual({})
    })
})
