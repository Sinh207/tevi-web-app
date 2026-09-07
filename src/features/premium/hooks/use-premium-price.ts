'use client'

import { useCurrency } from '@features/balance'
import { useTranslation } from '@shared/i18n/use-translation'
import {
    type Currency,
    convertFromUsd,
    DEFAULT_CURRENCY,
    formatFiatAmount,
} from '@shared/lib/money'
import { useCallback } from 'react'

/**
 * Format a package price for the screen — **honouring the currency the payload states**.
 *
 * ## Two behaviours, and the payload picks which
 *
 * - **Priced in USD** (every package seen, and what the checkout charges): the figure is multiplied
 *   by the rate for whichever currency the reader picked in the wallet, exactly as legacy's Premium
 *   screen does (`formatCurrency(price * exchangeRate, …)`).
 * - **Priced in anything else**: printed in *that* currency, unconverted. A figure already localised
 *   by the service and then put through a USD→display rate is converted **twice**, and the failure
 *   is invisible — the result is still a plausible number with a plausible symbol in front of it.
 *
 * The second branch is unreachable today. It exists because `currency` is a real field on the wire
 * (and `country` sits beside it, so per-market pricing is clearly on the backend's mind); reading it
 * costs one comparison, and the alternative is a screen that silently multiplies dong by 25,400.
 *
 * ⚠ **Worth knowing: Stripe charges in the package's currency, not the reader's display one.** So a
 * reader who has set their wallet to dong reads `₫1,979,168` here and is charged `$77.92` on the
 * checkout page. That is legacy's behaviour, it is what every other figure in this app does
 * (`useCurrency`'s doc calls this the *display* unit), and diverging on one screen would be worse
 * than either choice made consistently — the confirmation dialog would then disagree with the card
 * beside it. Flagged rather than fixed here: making it right means either charging in the reader's
 * currency or labelling the conversion, and both are product decisions rather than this screen's.
 *
 * Until the rate lands, `useCurrency` reports `1` and the figures render as USD, then convert. That
 * is its documented behaviour and the right one for a price: a number that is briefly unconverted
 * beats no number at all on the one element the section exists to show.
 */
export function usePremiumPrice(): (amount: number, currency?: string | null) => string {
    const { format } = usePremiumPriceFormats()
    return format
}

/**
 * The same two figures, both named — for the one screen that needs to print **what will actually be
 * charged** rather than what the reader has asked to read money in.
 *
 * `format` converts a USD price into the reader's display currency (see above). `charge` prints it
 * in the currency the package states, unconverted, which is what Stripe will take. They are the same
 * string for the overwhelming majority of readers, because `DEFAULT_CURRENCY` is USD and only the
 * wallet's switcher changes it — and they are one function apart on purpose, so a call site has to
 * say which of the two questions it is answering.
 */
export function usePremiumPriceFormats(): {
    /** The reader's display unit. Every price *on* the page. */
    format: (amount: number, currency?: string | null) => string
    /** The package's own unit — the amount the card will be debited. */
    charge: (amount: number, currency?: string | null) => string
} {
    const { currency: display, currencies, rate } = useCurrency()
    const { currentLanguage } = useTranslation()

    const inOwnCurrency = useCallback(
        (amount: number, code: string) => {
            /*
             * The exchange service's own record for that code, so the symbol and the minor unit are
             * right (VND has **no** decimals). Missing ⇒ a code-only record, which
             * `formatFiatAmount` prints as `VND 1,979,168`: naming the unit it cannot draw is the
             * honest floor, and inventing a symbol is the one guess money must not make.
             */
            const own: Currency = currencies.find(c => c.code === code) ?? {
                code,
                name: code,
                symbol: '',
                decimalDigits: 2,
            }
            return formatFiatAmount(amount, own, currentLanguage)
        },
        [currencies, currentLanguage],
    )

    const format = useCallback(
        (amount: number, source?: string | null) => {
            const code = (source ?? DEFAULT_CURRENCY.code).trim().toUpperCase()

            if (code === '' || code === DEFAULT_CURRENCY.code) {
                return formatFiatAmount(convertFromUsd(amount, rate), display, currentLanguage)
            }
            return inOwnCurrency(amount, code)
        },
        [currentLanguage, display, inOwnCurrency, rate],
    )

    const charge = useCallback(
        (amount: number, source?: string | null) =>
            inOwnCurrency(
                amount,
                (source ?? DEFAULT_CURRENCY.code).trim().toUpperCase() || DEFAULT_CURRENCY.code,
            ),
        [inOwnCurrency],
    )

    return { format, charge }
}
