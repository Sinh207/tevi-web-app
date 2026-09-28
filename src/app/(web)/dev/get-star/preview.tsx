'use client'

import {
    type Gateway,
    GatewayAccordion,
    GatewayList,
    GetStarSkeleton,
    StarCatalogueUnavailable,
    type StarPackage,
    StarPackageGrid,
    type StarTransaction,
    TransactionList,
    TransactionSkeleton,
} from '@features/payment/dev'
import { useState } from 'react'

/**
 * Legacy's own catalogue shape: a bonus tier in the middle, a big one at the end.
 *
 * The `labels` on row 3 is the real payload's — the backoffice tags exactly one package, and it is
 * **not** the first. That is what the badge follows now (`recommendedIndex`), so a harness whose rows
 * all carried empty labels would preview the fallback and hide the behaviour worth looking at.
 */
const PACKAGES = [
    { id: '1', amount: 100, bonus_amount: 0, price: 0.99, labels: [] },
    { id: '2', amount: 500, bonus_amount: 0, price: 4.99, labels: [] },
    { id: '3', amount: 900, bonus_amount: 100, price: 8.99, labels: ['Most popular'] },
    { id: '4', amount: 2000, bonus_amount: 300, price: 19.99, labels: [] },
    { id: '5', amount: 5000, bonus_amount: 1000, price: 49.99, labels: [] },
    { id: '6', amount: 10_000, bonus_amount: 2500, price: 99.99, labels: [] },
] as StarPackage[]

const GATEWAYS = [
    {
        id: 'gw.stripe',
        name: 'Debit / Credit card',
        images: [],
        fee_percent_rate: 2.9,
        fee_flat_amount: 0.3,
        currency: { id: '$', usd_conversion_rate: 1, min_unit: 0.01 },
        min_payment_amount: 0,
        max_payment_amount: null,
    },
    {
        id: 'gw.momo',
        name: 'MoMo',
        images: [],
        fee_percent_rate: 1.5,
        fee_flat_amount: 0,
        currency: { id: 'VND', usd_conversion_rate: 25_413, min_unit: 1000 },
        // A real floor, so the "below this gateway's minimum" state can be looked at.
        min_payment_amount: 5,
        max_payment_amount: null,
    },
    {
        /*
         * No conversion rate, so `gatewayTotal` keeps the figure in **USD** and says so
         * (`converted: false`) rather than labelling dollars as USDT — the mislabelling legacy does.
         * The row still shows a rate; it is just a dollar one.
         */
        id: 'gw.crypto',
        name: 'Crypto (NOWPayments)',
        images: [],
        fee_percent_rate: 0.5,
        fee_flat_amount: 0,
        currency: { id: 'USDT', usd_conversion_rate: 0, min_unit: 0 },
        min_payment_amount: 0,
        max_payment_amount: 100,
    },
] as Gateway[]

export function PackageGridPreview() {
    const [selected, setSelected] = useState<StarPackage | null>(PACKAGES[2] ?? null)
    return <StarPackageGrid packages={PACKAGES} selected={selected} onSelect={setSelected} />
}

export function GatewayAccordionPreview() {
    const [gateway, setGateway] = useState<Gateway | null>(GATEWAYS[0] ?? null)
    const [selected, setSelected] = useState<StarPackage | null>(PACKAGES[2] ?? null)
    return (
        <GatewayAccordion
            gateways={GATEWAYS}
            selected={gateway}
            onSelect={setGateway}
            packages={PACKAGES}
            selectedPackage={selected}
            onSelectPackage={setSelected}
        />
    )
}

export function GatewayPreview() {
    const [gateway, setGateway] = useState<Gateway | null>(GATEWAYS[0] ?? null)
    return <GatewayList gateways={GATEWAYS} selected={gateway} onSelect={setGateway} />
}

/**
 * The four shapes a purchase row has to survive, and none of them is reachable from a URL: the three
 * statuses, and a gateway that ships no logo — which legacy renders as a broken image, since it reads
 * `images[0]` with the array unchecked.
 *
 * The dates deliberately straddle a **month boundary**, because the group header only exists at one
 * — and the last row has none at all, which is the trailing unlabelled group.
 *
 * `PROCESSING_3DS` is deliberately not one of the mapped values. It is what an **unknown** status
 * looks like, and the row must call it *Processing* rather than print the token: the vocabulary is
 * unconfirmed (B87) and only "pending" is honest about a state this client does not recognise.
 */
const TRANSACTIONS = [
    {
        id: '1',
        top_up_quantity: 500,
        status: 'succeeded',
        created_at: '2026-08-26T08:27:00Z',
        payment: {
            amount: 137500,
            amount_currency: 'VND',
            payment_method: {
                id: 'gw.appotapay.cc',
                name: 'Credit or Debit Card',
                images: ['https://static.tevi.com/payments/(tevi_local)ic_colored_visa.svg'],
            },
        },
    },
    {
        id: '2',
        top_up_quantity: 1000,
        status: 'PROCESSING_3DS',
        created_at: '2026-08-25T19:02:00Z',
        payment: {
            amount: 10.29,
            amount_currency: 'USD',
            payment_method: { id: 'gw.stripe', name: 'Credit or Debit Card (USD)', images: [] },
        },
    },
    {
        id: '3',
        top_up_quantity: 300,
        status: 'failed',
        created_at: '2026-07-23T15:27:00Z',
        payment: {
            amount: 82500,
            amount_currency: 'VND',
            payment_method: { id: 'gw.momo', name: 'MoMo E-Wallet', images: [] },
        },
    },
    {
        id: '4',
        top_up_quantity: 50_000,
        status: 'succeeded',
        created_at: null,
        payment: null,
    },
] as StarTransaction[]

export function TransactionPreview() {
    // The shipped panel, so the month headers and the entrance stagger are previewed too.
    return <TransactionList rows={TRANSACTIONS} />
}

/**
 * The screen the catalogue produces when it answers and holds nothing — legacy's `NotSupported`.
 *
 * Here because it cannot be reached any other way: the real page needs a region with **no gateway
 * enabled**, so the only way to see it against the running app is to intercept `payment-methods/`
 * and return `[]`. Pressing the button opens the real `GetAppDialog` — remote-config store links and
 * a Tevi-branded QR — so the way out is previewed too, and on a desktop, where legacy hides it.
 */
export function UnavailablePreview() {
    return (
        <div className="flex min-h-[420px] flex-col">
            <StarCatalogueUnavailable />
        </div>
    )
}

/**
 * Both loading shapes, side by side with what they stand in for.
 *
 * A skeleton is the one state that is *always* reachable and never sits still long enough to look
 * at — a fast dev server paints it for a frame. It is also the one that breaks silently: a bar
 * reserved at the wrong height makes the list jump when the data lands, and a box that leans on the
 * default fill is three black stripes in Dark and correct in Light.
 */
export function SkeletonPreview() {
    return (
        <div className="flex flex-col gap-6">
            <GetStarSkeleton />
            <TransactionSkeleton />
        </div>
    )
}
