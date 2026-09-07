'use client'

import {
    CARD_MANAGEMENT_CONTAINER,
    CardManagementSkeleton,
    MAX_SAVED_CARDS,
    type SavedCard,
    SavedCardList,
} from '@features/payment/dev'
import { useState } from 'react'

/**
 * Fixtures covering the payload shapes the row has to survive, not four nice brands.
 *
 * The last one is the case that matters most and is easiest to forget: a saved method with **no `card`
 * block at all** (a wallet), which legacy's row prints as `**** undefined`.
 */
const CARDS: SavedCard[] = [
    {
        id: 'pm_1',
        default: true,
        type: 'card',
        card: { brand: 'visa', last4: '4242', exp_month: 5, exp_year: 2030, funding: 'credit' },
    },
    {
        id: 'pm_2',
        default: false,
        type: 'card',
        card: {
            brand: 'mastercard',
            last4: '1881',
            exp_month: 11,
            exp_year: 2027,
            funding: 'debit',
        },
    },
    {
        // Past its expiry: the row says so, in the error colour, instead of printing a dead date.
        id: 'pm_3',
        default: false,
        type: 'card',
        card: { brand: 'amex', last4: '0005', exp_month: 1, exp_year: 2024, funding: 'credit' },
    },
    {
        // A scheme this client has no mark for — `Generic` rather than a gap.
        id: 'pm_4',
        default: false,
        type: 'card',
        card: { brand: 'elo', last4: '4444', exp_month: 8, exp_year: 2029, funding: 'credit' },
    },
    { id: 'pm_5', default: false, type: 'link', card: null },
]

/** Ten cards, so the header's cap branch can be looked at rather than reasoned about. */
const FULL: SavedCard[] = Array.from({ length: MAX_SAVED_CARDS }, (_, index) => ({
    id: `pm_full_${index}`,
    default: index === 0,
    type: 'card',
    card: {
        brand: index % 2 === 0 ? 'visa' : 'mastercard',
        last4: String(4000 + index),
        exp_month: (index % 12) + 1,
        exp_year: 2030,
        funding: 'credit',
    },
}))

export function CardListPreview({ full = false }: { full?: boolean }) {
    /*
     * The presses do nothing but record the last one, which is the point: this harness previews the
     * arrangement, and the writes belong to `useSavedCards` (tested separately). A row that opened a
     * real confirm here would need the account it is about.
     */
    const [pressed, setPressed] = useState<string | null>(null)

    return (
        <div className="bg-(--background) py-2">
            <div className={CARD_MANAGEMENT_CONTAINER}>
                <SavedCardList
                    cards={full ? FULL : CARDS}
                    pendingId={null}
                    isMutating={false}
                    isFull={full}
                    onAdd={() => setPressed('add')}
                    onSetDefault={card => setPressed(`default:${card.id}`)}
                    onDelete={card => setPressed(`delete:${card.id}`)}
                />
                {pressed && (
                    <p className="type-caption-meta px-4 pb-4 text-(--text-subtitle)">
                        last press: {pressed}
                    </p>
                )}
            </div>
        </div>
    )
}

export function CardSkeletonPreview() {
    return (
        <div className="bg-(--background) py-2">
            <div className={CARD_MANAGEMENT_CONTAINER}>
                <CardManagementSkeleton />
            </div>
        </div>
    )
}
