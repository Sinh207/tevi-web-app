// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBalanceDisplay } from './use-balance-display'

/**
 * Two decisions live in this hook and neither is visible from a call site:
 *
 * - `—` rather than `0` while the balance is unknown, because a zero is a claim about somebody's money;
 * - `—` rather than an unconverted figure when a **currency** was asked for and no rate is in hand yet.
 *   That second one is the whole reason `rate` is nullable: `1` is the true rate for USD and the
 *   stand-in for "not yet", and printing a USD number under a `₫` symbol is not a rounding error, it is
 *   off by the rate.
 *
 * The Star string is deliberately unaffected by either currency argument — it is not fiat and no rate
 * touches it — which a comment can claim and only a test can hold.
 */
const balance = { star: 1284, usd: 4400.03, isKnown: true }

vi.mock('@shared/i18n/use-translation', () => ({
    useTranslation: () => ({ currentLanguage: 'en' }),
}))
vi.mock('../providers/balance-provider', () => ({ useBalance: () => balance }))

const VND = { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalDigits: 0 }

function read(options?: Parameters<typeof useBalanceDisplay>[0]) {
    let out: ReturnType<typeof useBalanceDisplay> | undefined
    function Probe() {
        out = useBalanceDisplay(options)
        return null
    }
    render(<Probe />)
    // Assigned during the render above — the assertion is the test's, not a claim about the hook.
    return out as ReturnType<typeof useBalanceDisplay>
}

beforeEach(() => {
    balance.star = 1284
    balance.usd = 4400.03
    balance.isKnown = true
})

describe('useBalanceDisplay', () => {
    it('formats USD when no currency is asked for', () => {
        expect(read()).toEqual({ star: '1,284', usd: '$4,400.03', isKnown: true })
    })

    it('converts into the currency it is given', () => {
        const { star, usd } = read({ currency: VND, rate: 25_400 })
        // Dong is written with no decimals — that is `decimalDigits`, not a rounding choice here.
        expect(usd).toBe('₫111,760,762')
        // Star is not fiat: the rate must not reach it.
        expect(star).toBe('1,284')
    })

    it('prints an em dash rather than an unconverted figure when the rate is unknown', () => {
        const { star, usd } = read({ currency: VND, rate: null })
        expect(usd).toBe('—')
        // …and only the fiat line: the Star balance is known and owes nothing to an exchange rate.
        expect(star).toBe('1,284')
    })

    it('reports the balance as known even when the rate is not', () => {
        // `isKnown` is a claim about the balance, which is in hand. `usd` says the rest on its own.
        expect(read({ currency: VND, rate: null }).isKnown).toBe(true)
    })

    it('is an em dash on both lines while the balance itself is unknown', () => {
        balance.isKnown = false
        expect(read({ currency: VND, rate: 25_400 })).toEqual({
            star: '—',
            usd: '—',
            isKnown: false,
        })
    })
})
