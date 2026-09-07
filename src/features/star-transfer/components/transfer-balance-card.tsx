'use client'

import { GET_STAR_PATH } from '@features/payment/routes'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { STAR_TRANSFER_ART } from '../lib/illustrations'

/**
 * `/star-transfer`'s hero — **legacy's own balance block**, not the DS balance card.
 *
 * ## Why this screen's hero is not `Card type="balance"`
 *
 * It was, for a while: the black gradient card `/my-star` uses, on the argument that two screens in the
 * wallet family should share a hero. That is the wrong reference for this screen. There is **no Figma
 * comp for `/star-transfer`** — the design project (`87e00715…`) carries `My Star — Desktop/Mobile` and
 * nothing else — so `web-app` is the specification, and `web-app` draws this block with its own purple
 * artwork. Matching a sibling screen instead was a substitution nobody asked for.
 *
 * Legacy's numbers, kept: min height **120**, padding **32**, radius **12 12 0 0** (it is the top of a
 * single surface, not a card of its own — see `StarTransferView`), the label at 14/500 and the figure at
 * 32/700 beside a 32px mark.
 *
 * The radius is `md:` only, because below that the screen is full-bleed — legacy's own
 * `borderRadius: {xs: 0, md: 16}`. `STAR_TRANSFER_CONTAINER` explains why the two go together.
 *
 * ## The text is pinned white, and that is not a token violation
 *
 * The background is a **raster image** — a fixed purple wash that does not flip with the theme — so the
 * ink over it cannot be a themed token either. `Card type="balance"` pins its own palette for exactly
 * this reason (`BALANCE_TOKENS` in `shared/ui/card.tsx`); this pins two colours for the same one.
 *
 * ## The `+` is legacy's, and it links where legacy's links
 *
 * A 42px `+` to `/get-star`. It shipped `disabled` while that route did not exist — dropping it would
 * have changed the composition and pointing it at a 404 would have been worse — and this is the one
 * `href` that note promised. It is an `<a>`, not a `<button>`: the press is a navigation, and a button
 * that navigates is a control a middle-click and a "open in new tab" cannot use.
 *
 * The path comes from `@features/payment/routes`, the import-free module, rather than that feature's
 * barrel — one string must not pull Stripe's loader into this screen's chunk.
 */
export function TransferBalanceCard({
    label,
    value,
}: {
    label: string
    /** Pre-formatted — `formatStarAmount`, or `—`. Never a raw number. */
    value: ReactNode
}) {
    const { t } = useTranslation()

    return (
        <div
            className="flex min-h-[120px] w-full items-center justify-between gap-2 bg-center bg-cover bg-no-repeat p-8 md:rounded-t-lg"
            style={{ backgroundImage: `url("${STAR_TRANSFER_ART.balance}")` }}
        >
            <div className="flex min-w-0 flex-col">
                <span className="type-dense-strong text-white">{label}</span>
                <span className="flex items-center gap-2">
                    <StarMark size={32} />
                    <span className="type-title-t1-semibold text-white tabular-nums">{value}</span>
                </span>
            </div>
            <span className="flex flex-none items-center">
                <Link
                    data-testid="star-transfer-get-star-link"
                    href={GET_STAR_PATH}
                    aria-label={t('balance_action_get_star')}
                    className={
                        // The 42px box and the 8px radius are legacy's. `bg-white/15` is its overlay
                        // rendered as one colour instead of two stacked elements. The focus ring is
                        // white rather than `--focus-ring`, for the reason the ink above is white:
                        // the backdrop is a fixed raster that does not flip with the theme.
                        'flex size-[42px] flex-none items-center justify-center rounded-md ' +
                        'bg-white/15 text-white transition-colors hover:bg-white/25 ' +
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
                    }
                >
                    <Icon name="plus" size={24} />
                </Link>
            </span>
        </div>
    )
}
