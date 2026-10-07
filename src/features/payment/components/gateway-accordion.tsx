'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { type RefObject, useEffect, useId, useRef, useState } from 'react'
import type { Gateway, StarPackage } from '../api/types'
import { formatCharge, gatewayRatePerStar, gatewayTotal, isSymbolFirst } from '../lib/gateway-fee'
import { StarPackageGrid } from './star-package-grid'

/**
 * `/get-star`'s two choices as **one** list — legacy's `getStar/content/accordions`, ported.
 *
 * ```
 *  ┌ [visa][mc] Debit / Credit card     ★ ≈ $0.013 each   ⌃ ┐
 *  │  ┌ ★ 100 ──┐ ┌ ★ 500 ──┐                               │
 *  │  │ $1.32   │ │ $5.43   │   ← what *this* gateway charges │
 *  └───────────────────────────────────────────────────────┘
 *  ┌ [momo] MoMo                        ★ ≈ 260 VND each  ⌄ ┐
 *  └───────────────────────────────────────────────────────┘
 * ```
 *
 * One card per gateway; the **open** card is the selected gateway, and its panel holds the package
 * grid priced in that gateway's currency, fee included. Opening another card selects it. The
 * package selection is shared across panels, so switching method keeps the chosen amount lit and
 * only its price changes — which is the comparison the layout exists to make.
 *
 * ## Deliberate divergences from legacy
 *
 * - **Collapsing the open card does not deselect the gateway.** Legacy's `onChange` sets the method
 *   to `null`, which leaves nothing expanded and nothing payable. Here the gateway stays chosen (the
 *   total bar still names it) and pressing the card again reopens it — `useStarCatalogue` re-seeds a
 *   `null` gateway on its own anyway, so a real deselect could not stick.
 * - **Pressing a tile selects it; it does not open an order-summary dialog.** Legacy's tile press
 *   raises `OrderSummary` with the Pay button; here the total and Pay sit in the page's sticky bar,
 *   so the figure the press commits to is on screen the whole time.
 * - Up to three marks per gateway rather than `images[0]` — see `GatewayList`.
 *
 * ## A disclosure, not a radio
 *
 * The header is a `<button aria-expanded aria-controls>`, as `PayoutMethodOptionRow` does it: a
 * native radio would open and close panels as arrow keys passed over it. The tiles inside **are** a
 * radio group (`StarPackageGrid`), because choosing one changes a selection and nothing else.
 */
export function GatewayAccordion({
    gateways,
    selected,
    onSelect,
    packages,
    selectedPackage,
    onSelectPackage,
    disabled,
}: {
    gateways: Gateway[]
    selected: Gateway | null
    onSelect: (gateway: Gateway) => void
    packages: StarPackage[]
    selectedPackage: StarPackage | null
    onSelectPackage: (pkg: StarPackage) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    /*
     * "Collapsed" rather than "the open id": the open card is the selected gateway by definition, so
     * the only thing this component owns is whether the reader folded it. A state holding an id
     * would need an effect to follow the catalogue's seeded default.
     */
    const [collapsed, setCollapsed] = useState(false)
    const openId = collapsed ? null : (selected?.id ?? null)
    /**
     * Whether a card has been opened yet. The first open is the gateway the page **arrived** on —
     * the catalogue's seeded default, which is card, the last of seven rows on a real catalogue — and
     * it is scrolled to like a press would be: what is active has to be on screen, or the total bar
     * prices a selection the reader cannot see. One ref for the list, so it happens once per page.
     */
    const arrived = useRef(false)

    return (
        <section className="flex flex-col gap-3">
            <h2 className="type-dense-strong m-0 text-(--text-subtitle)">
                {t('payment_method_legend')}
            </h2>
            {gateways.map(gateway => (
                <GatewayPanel
                    key={gateway.id}
                    gateway={gateway}
                    open={openId === gateway.id}
                    onToggle={() => {
                        if (selected?.id === gateway.id) {
                            setCollapsed(value => !value)
                            return
                        }
                        setCollapsed(false)
                        onSelect(gateway)
                    }}
                    packages={packages}
                    selectedPackage={selectedPackage}
                    onSelectPackage={onSelectPackage}
                    disabled={disabled}
                    arrived={arrived}
                />
            ))}
        </section>
    )
}

function GatewayPanel({
    gateway,
    open,
    onToggle,
    packages,
    selectedPackage,
    onSelectPackage,
    disabled,
    arrived,
}: {
    gateway: Gateway
    open: boolean
    onToggle: () => void
    packages: StarPackage[]
    selectedPackage: StarPackage | null
    onSelectPackage: (pkg: StarPackage) => void
    disabled?: boolean
    arrived: RefObject<boolean>
}) {
    const { t } = useTranslation()
    const panelId = useId()
    const cardRef = useRef<HTMLDivElement>(null)
    /** Set by a press; the arrival open is the other reason to reveal (see `arrived`). */
    const revealOnOpen = useRef(false)
    const rate = gatewayRatePerStar(gateway)
    const logos = gateway.images.slice(0, 3)
    const name = gateway.name ?? gateway.id

    /*
     * Opening a card low in the list puts its grid below the fold — and, on a phone, under the
     * sticky total bar. After the panel has laid out, scroll the card the least distance that shows
     * it (`nearest`: a card already in view does not move; one taller than the viewport aligns its
     * header). The scroll margins clear the back bar (60) and the total bar (222 at its tallest,
     * every note showing), both measured.
     *
     * The arrival scroll is instant and waits a frame: smooth motion on a page that just loaded reads
     * as the page moving by itself, and the frame lets the router's own scroll-to-top land first.
     */
    useEffect(() => {
        if (!open) return
        const isArrival = !arrived.current
        if (!revealOnOpen.current && !isArrival) return
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        // The flags flip inside the frame: StrictMode's mount-cleanup-mount would otherwise consume
        // them on a frame that its own cleanup cancels, and the arrival would never scroll.
        const frame = requestAnimationFrame(() => {
            arrived.current = true
            revealOnOpen.current = false
            cardRef.current?.scrollIntoView({
                block: 'nearest',
                behavior: isArrival || reduced ? 'auto' : 'smooth',
            })
        })
        return () => cancelAnimationFrame(frame)
    }, [open, arrived])

    return (
        <div
            ref={cardRef}
            className={cn(
                'scroll-mt-[72px] scroll-mb-[232px] overflow-clip rounded-(--radius-lg) border border-(--separator-default) bg-(--background-surface)',
            )}
        >
            <button
                type="button"
                data-testid="payment-get-star-gateway"
                data-option-value={gateway.id}
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                disabled={disabled}
                onClick={() => {
                    revealOnOpen.current = !open
                    onToggle()
                }}
                className={cn(
                    'flex w-full cursor-pointer items-center gap-2 p-3 text-start transition-colors',
                    'hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:outline-(--focus-ring) focus-visible:-outline-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                )}
            >
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
                    {name}
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
                {/* `rotate`, not `transform`: Tailwind v4 sets the individual property. */}
                <Icon
                    name="angle-down"
                    size={20}
                    className={cn(
                        'flex-none text-(--icon-secondary) transition-[rotate] duration-200',
                        open ? 'rotate-180' : 'rotate-0',
                    )}
                />
            </button>

            {/* Mounted only while open: eight tiles per gateway, hidden, is what legacy pays. */}
            {open && (
                <div id={panelId} className="border-(--separator-default) border-t p-3 pt-4">
                    <StarPackageGrid
                        packages={packages}
                        selected={selectedPackage}
                        onSelect={onSelectPackage}
                        disabled={disabled}
                        priceLabel={pkg => formatCharge(gatewayTotal(pkg.price, gateway))}
                    />
                </div>
            )}
        </div>
    )
}
