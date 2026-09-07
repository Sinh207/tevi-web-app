import { describe, expect, it } from 'vitest'
import type { PayoutConfigRow } from '../api/config-types'
import { payoutMethodSummary } from './payout-method-summary'

function row(overrides: Partial<PayoutConfigRow> = {}): PayoutConfigRow {
    return {
        id: 'pc_1',
        status: 'active',
        createdAt: 1_780_000_000_000,
        contactName: 'Ada Lovelace',
        contactEmail: 'ada@tevi.com',
        dailyLimitRemainder: 1000,
        methodName: 'Bank Transfer 24/7',
        methodSlug: 'bank_transfer',
        methodLogo: '',
        methodCurrency: 'VND',
        methodMinimumAmount: null,
        methodExchangeRate: null,
        countryName: 'Viet Nam',
        detail: {},
        ...overrides,
    }
}

describe('payoutMethodSummary', () => {
    it('identifies a USDT method by its wallet and network', () => {
        expect(
            payoutMethodSummary(
                row({
                    methodSlug: 'usdt',
                    detail: { wallet_address: '0xabc', network: 'ERC20' },
                }),
            ),
        ).toEqual({ title: '0xabc', subtitle: 'ERC20' })
    })

    it('identifies a bank transfer by the contact over the account number', () => {
        expect(payoutMethodSummary(row({ detail: { account_number: '1234567' } }))).toEqual({
            title: 'Ada Lovelace',
            subtitle: '1234567',
        })
    })

    it('uses Stripe’s holder and last four', () => {
        expect(
            payoutMethodSummary(
                row({ methodSlug: 'stripe', detail: { holder_name: 'Ada', last4: '4242' } }),
            ),
        ).toEqual({ title: 'Ada', subtitle: '4242' })
    })

    it('reads Payoneer’s email and Zelle’s contact', () => {
        expect(
            payoutMethodSummary(row({ methodSlug: 'payoneer', detail: { email: 'a@b.c' } }))
                .subtitle,
        ).toBe('a@b.c')
        expect(
            payoutMethodSummary(
                row({ methodSlug: 'zelle', detail: { email_phone_number: '+1555' } }),
            ).subtitle,
        ).toBe('+1555')
    })

    it('never renders a blank row', () => {
        // Legacy's `default` title is the contact name, so a config without one is a pressable row
        // with no text in it at all.
        expect(payoutMethodSummary(row({ contactName: '', detail: {} }))).toEqual({
            title: 'Bank Transfer 24/7',
            subtitle: '',
        })
    })

    it('does not print the same value twice', () => {
        // A VAI wallet's fallback subtitle is `wallet_address`, which for a config with no contact
        // name is also its title.
        expect(
            payoutMethodSummary(
                row({
                    methodSlug: 'vai_wallet',
                    contactName: '',
                    detail: { wallet_address: 'vai-1' },
                }),
            ),
        ).toEqual({ title: 'vai-1', subtitle: '' })
    })
})
