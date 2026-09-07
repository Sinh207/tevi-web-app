'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import type { Gateway } from '../api/types'
import { gatewayRatePerStar, isSymbolFirst } from '../lib/gateway-fee'

/**
 * The ways to pay, one row each — legacy's accordion list, flattened.
 *
 * Legacy makes each gateway an `Accordion` whose panel holds the whole package grid, so choosing a
 * method and choosing an amount are the same gesture and the grid is rendered once per gateway. Here
 * the amount is already chosen by the time this list appears, so a row is a row.
 *
 * ## The "≈ per Star" line is an estimate and says so
 *
 * `gatewayRatePerStar` prices one Star through a hundred of them (a cent rounded to a 1,000-dong unit
 * would print the flat fee as the price of a single Star), so the flat component is amortised. That is
 * why the row reads `≈` — it is the one figure on this screen that is not exact, and the total below is.
 */
export function GatewayList({
    gateways,
    selected,
    onSelect,
    disabled,
}: {
    gateways: Gateway[]
    selected: Gateway | null
    onSelect: (gateway: Gateway) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()

    return (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="type-dense-strong mb-1 text-(--text-subtitle)">
                {t('payment_method_legend')}
            </legend>
            {gateways.map(gateway => {
                const isSelected = selected?.id === gateway.id
                const rate = gatewayRatePerStar(gateway)
                const logos = gateway.images.slice(0, 3)
                return (
                    <label
                        key={gateway.id}
                        className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-(--radius-md) p-3 transition-colors',
                            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus-ring)',
                            /*
                             * Same ring as the package tile — one chosen-state treatment across the
                             * two things this screen asks the reader to choose. Both states are 2px,
                             * so selecting a row does not resize it and the list does not reflow.
                             */
                            isSelected
                                ? 'gradient-ring'
                                : 'border-2 border-(--separator-default) bg-(--background-surface) hover:bg-(--background-segment)',
                            disabled && 'cursor-not-allowed opacity-60',
                        )}
                    >
                        <input
                            data-testid="payment-gateway"
                            data-option-value={gateway.id}
                            type="radio"
                            name="payment-gateway"
                            className="sr-only"
                            checked={isSelected}
                            disabled={disabled}
                            onChange={() => onSelect(gateway)}
                        />
                        {/*
                         * **All** the marks the row carries, up to three. A real `gw.stripe` row ships
                         * two (Mastercard *and* Visa) and legacy renders `images[0]` only, so a card
                         * gateway advertises one scheme — the reader looking for their own card is told
                         * half the answer. Capped so a gateway that ships eight cannot push the name
                         * out of the row.
                         */}
                        {logos.length > 0 && (
                            <span className="flex flex-none items-center gap-1">
                                {logos.map(src => (
                                    <Image
                                        key={src}
                                        src={src}
                                        alt=""
                                        aria-hidden
                                        width={28}
                                        height={28}
                                        className="h-7 w-7 rounded-(--radius-sm) object-contain"
                                    />
                                ))}
                            </span>
                        )}
                        <span className="type-dense-strong min-w-0 flex-1 truncate text-(--text-title)">
                            {gateway.name ?? gateway.id}
                        </span>
                        {rate && (
                            <span className="type-caption-meta flex flex-none items-center gap-1 text-(--text-subtitle)">
                                <StarMark size={12} />
                                {t('payment_rate_per_star', {
                                    amount: isSymbolFirst(rate)
                                        ? `${rate.currencyId || '$'}${rate.amount}`
                                        : `${rate.amount} ${rate.currencyId}`,
                                })}
                            </span>
                        )}
                    </label>
                )
            })}
            {/* The empty case is the sheet's to explain (`useStarPurchase.isEmpty`), so this renders
                nothing rather than a second, quieter version of the same message. */}
        </fieldset>
    )
}
