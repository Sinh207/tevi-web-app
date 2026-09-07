'use client'

import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { PremiumManageButton } from './premium-manage-button'

/**
 * `/gift-premium`'s bar — back · "Gift Premium" · Manage in Stripe, over **three** grounds.
 *
 * ## One bar for three steps, and only its paint moves
 *
 * Legacy renders **two** bars for this — the same component with `sxTitle={{ color: '#141414' }}`
 * passed at one call site and not the other — which is how its two back buttons came to have
 * different behaviour (one calls `router.back()`, the other resets the flow). Here there is one bar
 * and the caller says what is behind it.
 *
 * `ground` is a statement about the pixels under the bar *right now*, not about which step it is:
 *
 * | value | when | paint |
 * |---|---|---|
 * | `brand` | the offer or the success screen, before the band has scrolled past | none — the band shows through, white ink |
 * | `surface` | the picker, whose plane is `--background-surface` below `md` | the same plane, so rows do not slide past the title on a phone |
 * | `page` | the band has scrolled past | the page's own ground |
 *
 * `surface` is the half of `docs/DESIGN_SYSTEM.md` §6 that is actually visible: content scrolls
 * *under* the bar, so a page-coloured bar over a surface-coloured screen shows the rows sliding past
 * — and from `md` that plane goes back to page colour, which is why the class carries both ends.
 *
 * The `brand`/`page` pair is `/premium`'s own behaviour, driven by the same `useBandPassed`
 * sentinel, so the two screens' bars agree.
 *
 * ## Why this screen has its own bar rather than `PageBackBar`
 *
 * The reason `PremiumTopBar` gives, unchanged: the DS bar's title takes its ink from `--text-title`,
 * which is near-black in Light and unreadable on a near-black-to-violet band, and `PageBackBar`
 * cannot be handed a different one — `titleClassName` lands on the title's *box* while the ink is on
 * `AppBarTitleText` inside it. Everything else is the same bar: the DS `AppBar` frame, the shared
 * `BarIconButton`, the same 60px height.
 *
 * ## Back is the caller's, and that is the whole point of the prop
 *
 * On the offer step Back means *un-choose this person*, not *leave the page* — legacy gets this
 * right and it is the one piece of its two-bar arrangement worth keeping. A bar that always called
 * `router.back()` would drop somebody out of a flow they were halfway through, and a browser Back
 * from there would land them on the offer again with the same recipient.
 */
export type GiftBarGround = 'brand' | 'surface' | 'page'

export function GiftPremiumTopBar({
    onBack,
    ground,
    backLabel,
}: {
    onBack: () => void
    /** What is behind the bar at this moment. See the table above. */
    ground: GiftBarGround
    /**
     * What Back does *here*, for a screen reader — "Back" on the picker, "Change recipient" on the
     * offer. The glyph is the same and the destination is not, and a control whose accessible name
     * is a direction rather than a destination is the one a screen-reader user cannot plan with.
     */
    backLabel: string
}) {
    const { t } = useTranslation()

    return (
        <AppBar
            data-testid="premium-gift-bar"
            /* Published as an attribute rather than baked into the id: state never goes in a
               `data-testid` (`docs/TEST_IDS.md`), and a bar findable only in one of its three
               paints is a bar a test cannot address in the other two. */
            data-ground={ground}
            /*
             * `backdrop-blur` in both states, as legacy's `backdropFilter: blur(10px)` is, and a
             * 300ms colour transition — which legacy declares (`transition: background 0.3s ease`)
             * and never wires to any state at all. This is that wiring, at its own duration.
             */
            /*
             * **`md:px-0` — the bar's side padding is the *content's*, not the DS bar's.**
             *
             * `AppBar` carries `px-4`, drawn for a phone where the bar is the full width of the
             * screen and the content under it is inset 16 by its own row padding. From `md` this
             * screen stops being full-width — it is a 612 column — and that 16px then measures
             * from the *column's* edge rather than the screen's, so the back disc sat inset from
             * a band and a card that do not. Measured at 1280: 16px in on both, against 0 on
             * `/search` and every other sub-page, which get this from `PageBackBar`.
             *
             * That component's own note is the rule and it applies unchanged here — the reason
             * these two bars missed it is that they are hand-rolled (the DS title takes
             * `--text-title`, which is unreadable on the band, and `PageBackBar` cannot be handed
             * a different ink). Everything else about them is `PageBackBar`; this was the one
             * line that did not come across.
             */
            className={cn(
                'sticky top-0 z-20 backdrop-blur-[10px] transition-colors duration-300',
                'md:px-0',
                ground === 'page' && 'bg-(--background)',
                ground === 'surface' && 'bg-(--background-surface) md:bg-(--background)',
            )}
        >
            <AppBarCluster className="min-w-0">
                <BarIconButton
                    data-testid="premium-gift-back"
                    name="angle-left"
                    weight="filled"
                    mirrored
                    label={backLabel}
                    onClick={onBack}
                />
            </AppBarCluster>

            {/*
             * Absolutely centred (the DS default), so the title holds the bar's centre whatever the
             * clusters weigh. The `max-w` reserves the 40px button and the bar's padding at both
             * ends, so a long title truncates instead of sliding under the control.
             */}
            {/* The reserve clears a 40px button *and* the trailing cluster at both ends, so a long
                title truncates instead of sliding under a control — `/premium`'s own number, because
                the two bars carry the same pair of controls. */}
            <AppBarTitle className="max-w-[calc(100%-160px)]">
                <AppBarTitleText
                    as="h1"
                    className={cn(
                        'max-w-full truncate transition-colors duration-300',
                        /*
                         * Fixed `white`, not `--text-on-primary`: that token flips to black in Dark
                         * and the band is the same near-black-to-violet in both modes. The trap
                         * `tinted-ground-needs-own-ink` describes.
                         */
                        ground === 'brand' ? 'text-white' : 'text-(--text-title)',
                    )}
                >
                    {t('giftpremium_title')}
                </AppBarTitleText>
            </AppBarTitle>

            {/*
             * **The same "Manage in Stripe" control `/premium`'s bar carries**, and legacy puts one
             * here too (`components/header/btnManageInStripe`).
             *
             * It is about the *buyer's own* billing rather than about the gift, which is why it
             * looked out of place at first reading — and then turned out to be the screen that needs
             * it most: **gifting Premium makes the buyer a Stripe customer without making them
             * Premium.** Somebody who has sent three gifts has charges and a saved card in that
             * portal and no subscription of their own, which is precisely who this bar is in front
             * of. That is what retired the `isPremium` gate this button used to carry; see its own
             * doc.
             *
             * Reused rather than re-declared, so the two bars cannot drift: one control, one gate,
             * one popup-blocker workaround. Legacy has two byte-identical copies of it, differing
             * only in a DOM id.
             */}
            <AppBarCluster>
                <PremiumManageButton />
            </AppBarCluster>
        </AppBar>
    )
}
