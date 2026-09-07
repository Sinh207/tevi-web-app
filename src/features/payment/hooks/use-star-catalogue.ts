'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Gateway, StarPackage } from '../api/types'
import { STRIPE_GATEWAY_ID } from '../api/types'
import { type GatewayCharge, gatewayAccepts, gatewayTotal } from '../lib/gateway-fee'
import { defaultPackage, packageStars, pickPackageForShortfall } from '../lib/star-packages'
import { useGateways } from './use-gateways'
import { useStarPackages } from './use-star-packages'

/**
 * **What is being bought, and through which gateway** — the one answer both Star surfaces need.
 *
 * Two surfaces ask it: the sheet (`useStarPurchase`, opened over whatever the reader was doing) and
 * the page (`useGetStar`, `/get-star`, navigated to deliberately). They differ in *chrome and in when
 * they are alive*, and in nothing else: the same two catalogues, the same pre-selection rule, the same
 * arithmetic, the same band check. Written twice, the two would disagree about which package a
 * shortfall lands on — and the one that disagreed would be the one nobody tested.
 *
 * So this hook holds the selection, and each surface holds only what is genuinely its own: the sheet
 * its three steps, the page its auth gate and its sticky total.
 *
 * ## What it deliberately does **not** hold
 *
 * The checkout. The moment Pay is pressed, `PaymentProvider`'s machine owns what happens — which is
 * why a settle can outlive the sheet, why a 3DS hop can come back to a document where neither surface
 * ever existed, and why closing either one cannot cancel a charge.
 *
 * ## Seeding happens once per *session*, and `enabled` is what defines a session
 *
 * A selection seeded before the catalogue arrives sticks at `null`; one re-seeded on every render
 * overwrites a choice the reader already made — the bug `edit-profile-view.tsx` documents at length.
 * So the seed is guarded by a ref that resets when `enabled` goes false, which for the sheet is each
 * close and for the page is never (it is `true` from mount). A surface that needs to re-seed while
 * staying enabled calls `reseed()`.
 */
export interface StarCatalogue {
    packages: StarPackage[]
    gateways: Gateway[]
    isLoading: boolean
    isError: boolean
    /** The catalogue answered and holds nothing — Star cannot be bought here. */
    isEmpty: boolean
    retry: () => void
    selected: StarPackage | null
    select: (pkg: StarPackage) => void
    gateway: Gateway | null
    selectGateway: (gateway: Gateway) => void
    /** What the reader is asked to pay, in the gateway's currency. `null` until both are chosen. */
    charge: GatewayCharge | null
    /**
     * Whether the chosen gateway will accept the chosen package's price — its declared band
     * (`min_payment_amount` / `max_payment_amount`). `false` disables Pay and says why, instead of
     * letting the press become a 400 the reader cannot read.
     */
    isAccepted: boolean
    /** Star received, bonus included — what the summary promises. */
    stars: number
    /** Drop the selection and let the seed run again, against the `shortfall` passed in next. */
    reseed: () => void
}

export function useStarCatalogue({
    enabled,
    shortfall = 0,
}: {
    /**
     * Whether this surface is on screen. Gates **both** catalogue requests: a reader who never opens
     * the sheet never pays for either, the same reason `useDonationFee` is `enabled`-gated. It also
     * defines a seeding session — see the hook's own doc.
     */
    enabled: boolean
    /** Star the reader was short of, or `0` when they are topping up deliberately. */
    shortfall?: number
}): StarCatalogue {
    const [selected, setSelected] = useState<StarPackage | null>(null)
    const [gateway, setGateway] = useState<Gateway | null>(null)

    const packagesQuery = useStarPackages({ enabled })
    const gatewaysQuery = useGateways({ enabled })

    /** Seeded once per session — see the note on the hook. */
    const seeded = useRef(false)

    useEffect(() => {
        if (!enabled) {
            seeded.current = false
            return
        }
        if (seeded.current || packagesQuery.packages.length === 0) return
        seeded.current = true
        setSelected(
            pickPackageForShortfall(packagesQuery.packages, shortfall) ??
                defaultPackage(packagesQuery.packages),
        )
    }, [enabled, packagesQuery.packages, shortfall])

    /*
     * The gateway defaults to Stripe when the list carries it, else to the first row. Card is the one
     * method every country has and the only one this client can complete in-page; a surface that
     * opened on a wallet the reader has never used would ask them to make a decision before showing
     * them a price.
     *
     * Unlike the package, it survives `reseed()`: a shortfall changes *how much* to buy, never *how*
     * to pay for it, and re-picking a method somebody chose is the more annoying of the two.
     */
    useEffect(() => {
        if (!enabled || gateway !== null || gatewaysQuery.gateways.length === 0) return
        const stripe = gatewaysQuery.gateways.find(row => row.id === STRIPE_GATEWAY_ID)
        setGateway(stripe ?? gatewaysQuery.gateways[0] ?? null)
    }, [enabled, gateway, gatewaysQuery.gateways])

    const charge = selected && gateway ? gatewayTotal(selected.price, gateway) : null
    /*
     * Both chosen and the gateway takes this amount. Checked here rather than in each surface because
     * the same answer gates the button *and* the sentence under it, and two derivations of one rule is
     * how they end up disagreeing.
     */
    const isAccepted = Boolean(selected && gateway && gatewayAccepts(selected.price, gateway))

    return {
        packages: packagesQuery.packages,
        gateways: gatewaysQuery.gateways,
        isLoading: packagesQuery.isLoading || gatewaysQuery.isLoading,
        isError: packagesQuery.isError || gatewaysQuery.isError,
        /*
         * Either list being empty makes the surface unusable, and they fail for different reasons — no
         * catalogue, or no gateway in this country. The copy does not distinguish them because the
         * reader cannot act on the difference.
         */
        isEmpty: packagesQuery.isEmpty || gatewaysQuery.isEmpty,
        retry: useCallback(() => {
            packagesQuery.refetch()
            gatewaysQuery.refetch()
        }, [packagesQuery, gatewaysQuery]),
        selected,
        select: useCallback((pkg: StarPackage) => setSelected(pkg), []),
        gateway,
        selectGateway: useCallback((row: Gateway) => setGateway(row), []),
        charge,
        isAccepted,
        stars: selected ? packageStars(selected) : 0,
        reseed: useCallback(() => {
            seeded.current = false
            setSelected(null)
        }, []),
    }
}
