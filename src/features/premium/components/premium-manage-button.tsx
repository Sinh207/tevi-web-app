'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { useBillingPortal } from '../hooks/use-billing-portal'
import { PREMIUM_CONTROL_FLIP, PREMIUM_CONTROL_ON_HERO } from '../lib/premium-surface'

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
 * A pill with the "opens elsewhere" glyph after the label — legacy's `borderRadius: 24` and its
 * `endIcon`. That geometry is not a stylistic preference here: this button sits on the brand band at
 * rest, where a DS `secondary` (a bordered surface at the DS radius, glyph first) reads as a form
 * control dropped onto artwork rather than as the overlay affordance the design draws. The **back
 * button on the same bars is the disc of the same pair** (`BarIconButton`), so the two ends of the
 * bar are one object in two shapes — same height, same edge, same paint in each state.
 *
 * ## The paint is the bar's state, not legacy's white
 *
 * Legacy is `backgroundColor: '#ffffff'`, `color: '#131313'` at every scroll position. **Deliberate
 * divergence:** on the band the pill is frosted glass instead (`PREMIUM_CONTROL_ON_HERO`, where the
 * reasoning and the measured contrast live), and it takes the surface-and-hairline paint below only
 * once the band has gone past. Two opaque white pills are the brightest thing on a near-black band,
 * which puts the chrome ahead of the mark, the pitch and the price.
 *
 * ⚠ **40 tall, not legacy's `height: 32` — because the pair is what the eye measures.** The two ends
 * of the bar are one control each and they are read against each other: a 32px pill beside a 40px
 * disc is visibly the smaller half, and below `sm`, where this collapses to a disc of its own, the
 * two sit at the same height as an obviously mismatched pair. Legacy's 32 is the number for a bar
 * whose back control is *not* a 40px disc; ours is (`BarIconButton`, whose own note explains the 40).
 * So the height follows the disc, and the glyph goes to 20 in the icon-only state so the smaller
 * drawing does not re-open the same mismatch inside a matched box.
 *
 * Off the band it is `--background-surface` rather than a literal white, so it is the elevated
 * surface in Dark too — a fixed `#fff` would be the only thing on the screen that did not flip. On
 * the band the paint goes the other way and is fixed `white/*`: the band itself does not flip, so a
 * token there would be wrong in one of the two modes (`PREMIUM_CONTROL_ON_HERO`).
 *
 * ## The label goes away below `sm`, the button does not
 *
 * Legacy's own arrangement: a labelled `Button` from `md`, an `IconButton` on a phone. It stays a
 * *labelled control* for a screen reader either way — the text is `sr-only`, never absent, so this is
 * never an unlabelled icon.
 */
export function PremiumManageButton({
    /**
     * Is the brand band behind the bar right now?
     *
     * A **required** prop with no default, because there is no answer that is right when a caller
     * forgets it: `false` puts an opaque pill on the violet and `true` puts white-on-white on the
     * page ground. The two bars each know it for their own reason — `/premium` from the band
     * sentinel, `/gift-premium` from the step it is drawing — and neither can be derived here.
     */
    onBrand,
}: {
    onBrand: boolean
}) {
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
                PREMIUM_CONTROL_FLIP,
                'h-10 rounded-full bg-(--background-surface) px-4 text-(--text-title)',
                /*
                 * The same hairline `BarIconButton` carries, for the reason written there and
                 * measured on this bar's *other* ground: `/gift-premium`'s picker step paints the
                 * bar `--background-surface` below `md` (§6's single-panel rule), and this pill's
                 * fill is that same token — surface on surface, contrast **1.00**, so the control
                 * read as a bare glyph floating in the bar. The band hides it and the surface does
                 * not, and the ground is the bar's choice rather than this button's, so the edge
                 * comes with the button. `Button`'s base is already `border border-transparent`,
                 * so this only paints an edge that was always in the box — nothing moves.
                 */
                'border-(--button-secondary-border)',
                'hover:not-disabled:bg-(--background-segment) active:scale-[0.98]',
                // A 40px disc on a phone, where the label is `sr-only` and there is nothing to pad —
                // the same box as the back disc at the other end of the bar.
                'max-sm:w-10 max-sm:px-0',
                /*
                 * Last, so the glass overrides the three paints above it — `twMerge` keeps the later
                 * utility of a conflicting pair, and fill, edge and ink are each stated in both
                 * halves for exactly that reason.
                 */
                onBrand && PREMIUM_CONTROL_ON_HERO,
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
             * is pressed is the one thing a 40px target cannot afford.
             */}
            {portal.isPending ? (
                <Loader className="size-4 max-sm:size-5" label={t('common_loading')} />
            ) : (
                /*
                 * `arrow-up-right-from-square` is the sprite's "opens elsewhere" glyph, and it is
                 * literally true: the press opens a new tab on Stripe's own site. Not mirrored under
                 * RTL — an arrow that means "off to another site" is not a direction of travel in
                 * the reading order, and the DS draws it the same way in both.
                 */
                /*
                 * 16 beside the label, 20 in the icon-only disc — `size-*` in the class rather than
                 * the `size` prop alone, because `Button` styles any glyph *without* a `size-` class
                 * to `size-4` and would win (`BarIconButton`'s trap 1). The attribute stays at the
                 * larger of the two so the SVG's own box never crops the drawing.
                 */
                <Icon
                    name="arrow-up-right-from-square"
                    size={20}
                    className="size-4 max-sm:size-5"
                />
            )}
        </Button>
    )
}
