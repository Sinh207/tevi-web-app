'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { useBillingPortal } from '../hooks/use-billing-portal'

/**
 * "Manage in Stripe" — the trailing control on **both** Premium bars (`/premium` and
 * `/gift-premium`).
 *
 * One component for the two screens, because legacy's two are byte-identical apart from a DOM id
 * (`containers/premium/.../btnManageInStripe` and `containers/giftPremium/.../btnManageInStripe`).
 * Two copies is how the two came to be maintained separately in the first place.
 *
 * ## The gate is **a real account**, not `isPremium`
 *
 * It was `isPremium`, on the reasoning that somebody who has never bought anything would otherwise
 * get a door into an empty billing portal. That reasoning was wrong in the one place it mattered
 * most: **gifting Premium makes the buyer a Stripe customer without making them Premium.** A creator
 * who has sent three gifts has charges, receipts and a saved card in that portal and `isPremium:
 * false` — so the gate hid the control from exactly the people `/gift-premium` exists for, which is
 * how it was noticed. Legacy gates on neither and shows it to everybody.
 *
 * `isPremium` was never a measure of "has a billing relationship with Stripe", and the client has no
 * cheap one. So the button is offered to any signed-in account and the **portal itself answers**:
 * `useBillingPortal` already handles a service that replies without a URL — it closes the blank tab
 * and says so, and on a 4xx the API's own sentence wins (`docs/API_ERRORS.md`). Being told "there is
 * nothing to manage yet" is a better outcome than a control that is missing for no stated reason.
 *
 * Anonymous is excluded rather than merely `isAuthenticated`: this app always keeps a session, so
 * that flag is true for a visitor who has never signed in, and the portal is meaningless for one.
 *
 * ## The link is minted on the **press**
 *
 * Legacy calls `stripe/portal/` in `initData` for every visitor to either page and renders the
 * button only if the answer happened to carry a URL — so the common case is a request thrown away.
 * Here nothing is fetched until the button is pressed. `useBillingPortal` carries the one awkward
 * part: the tab has to be opened *before* the link is known, or the popup is blocked.
 *
 * ## The shape is legacy's, and the icon is **trailing**
 *
 * A white pill with dark ink and the "opens elsewhere" glyph after the label — legacy's
 * `backgroundColor: '#ffffff'`, `color: '#131313'`, `borderRadius: 24`, `height: 32` and its
 * `endIcon`. That geometry is not a stylistic preference here: this button sits on the brand band at
 * rest, where a DS `secondary` (a bordered surface at the DS radius, glyph first) reads as a form
 * control dropped onto artwork rather than as the overlay affordance the design draws. The **back
 * button on the same bars is already a white disc** (`BarIconButton`), so the pill is the pair to it
 * and the two ends of the bar match.
 *
 * `--background-surface` rather than a literal white, so it is the elevated surface in Dark too —
 * the band is the same near-black-to-violet in both modes, and a fixed `#fff` would be the only
 * thing on the screen that did not flip.
 *
 * ## The label goes away below `sm`, the button does not
 *
 * Legacy's own arrangement: a labelled `Button` from `md`, an `IconButton` on a phone. It stays a
 * *labelled control* for a screen reader either way — the text is `sr-only`, never absent, so this is
 * never an unlabelled icon.
 */
export function PremiumManageButton() {
    const { t } = useTranslation()
    const { isAuthenticated, isAnonymous } = useAuth()
    const portal = useBillingPortal()

    if (!isAuthenticated || isAnonymous) return null

    return (
        <Button
            data-testid="premium-manage"
            /*
             * `ghost` rather than `secondary`, then repainted: ghost is the variant with no border of
             * its own, which is what lets the pill be a clean disc-and-capsule pair with the back
             * button. The paint is applied here rather than in `shared/ui` because it is this
             * screen's overlay treatment, not a DS variant — the same call `BarIconButton` makes.
             */
            variant="ghost"
            size="small"
            disabled={portal.isPending}
            onClick={portal.open}
            className={cn(
                'h-8 rounded-full bg-(--background-surface) px-3 text-(--text-title)',
                'hover:not-disabled:bg-(--background-segment) active:scale-[0.98]',
                // A 32px disc on a phone, where the label is `sr-only` and there is nothing to pad.
                'max-sm:w-8 max-sm:px-0',
            )}
        >
            {/*
             * The label **first**, the glyph after it — legacy's `endIcon`, and the order in the
             * design. It also reads correctly under RTL with no work: both are flex children on the
             * inline axis, so the glyph lands on the trailing edge in either direction.
             */}
            <span className="max-sm:sr-only">{t('premium_manage_in_stripe')}</span>
            {/*
             * The loader replaces the glyph rather than joining it, so the button's width does not
             * change while the link is being minted — a control that grows under the pointer as it
             * is pressed is the one thing a 32px target cannot afford.
             */}
            {portal.isPending ? (
                <Loader className="size-4" label={t('common_loading')} />
            ) : (
                /*
                 * `arrow-up-right-from-square` is the sprite's "opens elsewhere" glyph, and it is
                 * literally true: the press opens a new tab on Stripe's own site. Not mirrored under
                 * RTL — an arrow that means "off to another site" is not a direction of travel in
                 * the reading order, and the DS draws it the same way in both.
                 */
                <Icon name="arrow-up-right-from-square" size={16} />
            )}
        </Button>
    )
}
