'use client'

import { BalanceHelpButton, CurrencyPicker, TotalBalanceCard } from '@features/my-wallet'
import type { Currency } from '@shared/lib/money'
import { formatFiatAmount } from '@shared/lib/money'
import { useState } from 'react'

/**
 * The card's currency control, live — press the chip and the real dialog opens over this page.
 *
 * The only place it can be opened in dev: on the real screen the list comes off the exchange service
 * behind a signed-in account, so an anonymous visitor gets a one-row stand-in and never sees the search,
 * the ranking or the skeleton. Same fixture reasoning as `/dev/left-bar`'s Change-currency frames — and
 * deliberately the same *component* underneath both, which is the thing worth checking here.
 */

/** A slice of the endpoint's answer: enough rows to scroll, and the codes people actually pick. */
const CURRENCIES: Currency[] = [
    { code: 'AED', name: 'United Arab Emirates Dirham', symbol: 'د.إ', decimalDigits: 2 },
    { code: 'AUD', name: 'Australian Dollar', symbol: '$', decimalDigits: 2 },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimalDigits: 2 },
    { code: 'CAD', name: 'Canadian Dollar', symbol: '$', decimalDigits: 2 },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimalDigits: 2 },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalDigits: 2 },
    { code: 'EUR', name: 'Euro', symbol: '€', decimalDigits: 2 },
    { code: 'GBP', name: 'British Pound', symbol: '£', decimalDigits: 2 },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: '$', decimalDigits: 2 },
    { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimalDigits: 2 },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalDigits: 2 },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalDigits: 0 },
    { code: 'KRW', name: 'South Korean Won', symbol: '₩', decimalDigits: 0 },
    { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimalDigits: 2 },
    { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimalDigits: 2 },
    { code: 'SGD', name: 'Singapore Dollar', symbol: '$', decimalDigits: 2 },
    { code: 'THB', name: 'Thai Baht', symbol: '฿', decimalDigits: 2 },
    { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$', decimalDigits: 2 },
    { code: 'USD', name: 'US Dollar', symbol: '$', decimalDigits: 2 },
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', decimalDigits: 0 },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimalDigits: 2 },
]

/** `$4,400.03` of earnings, converted at a plausible rate so picking a row visibly changes the card. */
const USD = 4400.03
const RATES: Record<string, number> = { VND: 25400, KRW: 1370, JPY: 157, IDR: 16300, INR: 84 }
const USD_RECORD = CURRENCIES.find(c => c.code === 'USD') as Currency

export function CurrencyDialogPreview() {
    const [code, setCode] = useState('VND')
    const selected = CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]
    const rate = RATES[selected.code] ?? 1

    return (
        <TotalBalanceCard
            label="Total balance"
            value={formatFiatAmount(USD * rate, selected, 'en')}
            /* Dropped when nothing was converted — the real screen drops it for USD for the same
               reason, and this fixture only carries rates for a handful of codes. */
            subValue={rate === 1 ? undefined : formatFiatAmount(USD, USD_RECORD, 'en')}
            help={<BalanceHelpButton />}
            currencyControl={
                <CurrencyPicker
                    currencies={CURRENCIES}
                    selected={selected}
                    isLoading={false}
                    onSelect={setCode}
                    triggerLabel="Change currency"
                />
            }
        />
    )
}
