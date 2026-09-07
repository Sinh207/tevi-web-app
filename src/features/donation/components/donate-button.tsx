'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { DonationTarget } from '../api/types'
import { useDonateFlow } from '../hooks/use-donate-flow'
import { hasStarPrice } from '../lib/donation-amount'
import { DonateDialogs } from './donate-dialogs'
import { DonationArt } from './donation-art'

/**
 * The Donate control for a space's action row, and the flow behind it.
 *
 * ## It renders nothing far more often than it renders something
 *
 * Three conditions, and none is defensive:
 *
 * 1. **No offer** — roughly half of all spaces. `useDirectDonate` resolves `null` for them, not an
 *    error, which is the whole reason this can be an absent button rather than a broken one.
 * 2. **No Star price on the offer.** ⚠ This is the honest edge of what has shipped: the cash path
 *    (`checkout/v3/checkout/donation/` → Stripe → a `clientSecret`) needs a payment integration this
 *    repo does not have, so a cash-only offer cannot be completed here. A button that opens a dialog
 *    whose only action fails is worse than no button — the same reasoning that keeps Membership,
 *    Messages and the mini app out of this row entirely (`channel-viewer-actions.tsx`).
 * 3. **The offer failed to load.** Also nothing: an error message where a Donate button would go
 *    tells the reader about our infrastructure rather than about the creator.
 *
 * ## `?action=direct_donation` is opened **here** and nowhere else
 *
 * `proxy.ts` already rewrites legacy's `/@ada/direct-donation` into this query parameter, so the
 * deep link works today and the old URL keeps resolving after the cutover. The handler has to live
 * on exactly one component, though: the About tab's support card mounts the same flow, and both
 * listening would open two dialogs from one link. The action row is the right host because it is
 * mounted on every space page, while the About panel is not (`mountAll={false}`).
 *
 * The parameter is stripped with `history.replaceState`, not `router.replace` — for the two reasons
 * `use-channel-tab.ts` sets out: the route reads `searchParams`, so a Next navigation would re-run
 * the server component, and the back button should mean "leave this space" rather than walking back
 * through a dialog that has already been dismissed.
 */
export function DonateButton({
    target,
    className,
}: {
    target: DonationTarget
    className?: string
}) {
    const { t } = useTranslation()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const flow = useDonateFlow(target)
    const { offer, open } = flow

    const deeplinked = useRef(false)
    const wanted = searchParams.get('action') === 'direct_donation'
    const canOpen = Boolean(offer && hasStarPrice(offer))

    useEffect(() => {
        // Once per page, and only once the offer is known — before that there is nothing to open.
        if (!wanted || !canOpen || deeplinked.current) return
        deeplinked.current = true

        const params = new URLSearchParams(searchParams.toString())
        params.delete('action')
        const query = params.toString()
        window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname)
        open()
    }, [wanted, canOpen, open, pathname, searchParams])

    if (!canOpen || !offer) return null

    return (
        <>
            {/*
             * `secondary`, matching legacy's `#F4F4F4` fill beside a filled Follow. One filled
             * button per row: the row already has its emphasis, and two competing fills read as two
             * primary actions.
             */}
            <Button
                data-testid="donation-button"
                variant="secondary"
                size="large"
                className={cn('min-w-0', className)}
                onClick={open}
            >
                {/* Hidden below `sm`, with the membership button's glyph beside it and for the
                    same measured reason (`become-a-member-button.tsx`): the row cannot shrink, so
                    the two decorations are the only slack it has on a phone. The art is the
                    creator's chosen unit — a coffee, a pizza — and the dialog it opens leads with
                    it at full size, so nothing is lost that the next screen does not say. */}
                <DonationArt icon={offer.icon} size={20} className="flex-none max-sm:hidden" />
                <span className="truncate">
                    {/* The creator's own wording when they wrote one — see `api/types.ts`. */}
                    {offer.button_text ?? t('donation_action_donate')}
                </span>
            </Button>
            <DonateDialogs flow={flow} target={target} />
        </>
    )
}
