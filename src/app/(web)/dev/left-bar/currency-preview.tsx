'use client'

import { CurrencyList } from '@shared/components/currency-list'
import type { Currency } from '@shared/lib/money'
import { AppBar, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'

/**
 * The Change-currency list, previewed against a real-length list.
 *
 * The two props are the drawer's own, verbatim — `top-[60px]` for the App Bar above it and `-mt-4` to
 * cancel this frame's column gap. A preview that does not pass what the real host passes measures
 * something nobody ships.
 *
 * The same component `/my-wallet`'s dialog renders (`shared/components/currency-list.tsx`); these two
 * frames are the drawer's host — an App Bar sticky at 0 with the field sticky under it.
 *
 * The screen itself is unreachable in dev: the currency list comes off the exchange service and that
 * query is gated on a real account, so an anonymous visitor sees one row — which is exactly the state
 * that hides everything worth looking at (the search field, the ranking, the skeleton, the row a long
 * list scrolls to). Hence a fixture, for the reason `/dev/my-wallet` has one. The symbols are kept in
 * it even though no row prints one: they are what the fixture is *for* — the screen's own note on why
 * the mark column is gone can be checked against real values here rather than taken on trust.
 *
 * Two frames rather than a toggle: the loading and loaded states are both worth seeing at once, and a
 * checkbox is a control to explain in a page that is meant to be read at a glance.
 */

/** A slice of the real endpoint's answer — enough rows to scroll, and the symbols that actually vary. */
const CURRENCIES: Currency[] = [
    { code: 'AED', name: 'United Arab Emirates Dirham', symbol: 'د.إ', decimalDigits: 2 },
    { code: 'AUD', name: 'Australian Dollar', symbol: '$', decimalDigits: 2 },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', decimalDigits: 2 },
    { code: 'BWP', name: 'Botswanan Pula', symbol: 'P', decimalDigits: 2 },
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
    // `name` equal to the code: the record `useCurrency` synthesises for a code the service no longer
    // lists, and the one row that exercises the dropped subtitle.
    { code: 'XAF', name: 'XAF', symbol: '', decimalDigits: 0 },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R', decimalDigits: 2 },
]

/** The drawer's own frame: 342 wide, its own scroll container, screens absolutely placed inside. */
function Frame({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-2">
            <span className="type-caption-meta text-text-body">{label}</span>
            <div className="relative h-[560px] w-[342px] overflow-hidden outline outline-(--separator-default)">
                {/* `data-slot` and the scroll are the layer's, so the screen's scroll-to-selection
                    finds the same box it does in the drawer. */}
                <div
                    data-slot="drawer-screen"
                    className="absolute inset-0 flex flex-col gap-4 overflow-y-auto bg-(--background-surface) px-4"
                >
                    <AppBar className="sticky top-0 z-10 -mx-4 w-auto bg-(--background-surface)">
                        <Button variant="ghost" size="large" iconOnly aria-label="Back">
                            <Icon name="arrow-left" size={20} className="rtl:-scale-x-100" />
                        </Button>
                        <AppBarTitle size="large">
                            <AppBarTitleText as="h2" size="large">
                                Change currency
                            </AppBarTitleText>
                        </AppBarTitle>
                    </AppBar>
                    {children}
                </div>
            </div>
        </div>
    )
}

export function CurrencyScreenPreview() {
    const [code, setCode] = useState('VND')
    const selected = CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]

    return (
        <div className="flex flex-wrap gap-6">
            <Frame label="Loaded — search, ranking, and the selection scrolled into view">
                <CurrencyList
                    active
                    currencies={CURRENCIES}
                    selected={selected}
                    isLoading={false}
                    onSelect={setCode}
                    stickyClassName="top-[60px]"
                    className="-mt-4"
                />
            </Frame>
            <Frame label="Loading — the list is in flight">
                <CurrencyList
                    active
                    currencies={[selected]}
                    selected={selected}
                    isLoading
                    onSelect={setCode}
                    stickyClassName="top-[60px]"
                    className="-mt-4"
                />
            </Frame>
        </div>
    )
}
