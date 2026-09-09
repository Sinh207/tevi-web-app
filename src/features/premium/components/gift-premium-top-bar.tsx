'use client'

import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { PREMIUM_CONTROL_FLIP, PREMIUM_CONTROL_ON_HERO } from '../lib/premium-surface'
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
             * **The bar's side inset follows the *step*, because the two steps are two different
             * shapes of screen** — and this is the one place this bar cannot copy `/premium`'s.
             *
             * The rule underneath both is `PageBackBar`'s: the back disc lines up with **the edge of
             * whatever plane the content sits on**, and it is the plane that differs.
             *
             * - **The offer and the success step are `/premium`'s arrangement**: the column is
             *   `disableGutters` so the *band* can reach its edges, and the content on it is inset by
             *   `PREMIUM_INSET` — 16 — at every width. The band's edge is not a plane the disc can
             *   align to (nothing else on the screen does), so the bar keeps `AppBar`'s own `px-4`
             *   and the disc lands where the mark, the copy and the plan cards start. `md:px-0` put
             *   it 16px outboard of all three; measured at 1280 it sat at 334 against their 350.
             * - **The picker is the single-panel shape** (`docs/DESIGN_SYSTEM.md` §6): from `md` its
             *   content *is* one card, and that card runs the full width of the column — measured at
             *   1280, 334→946, the same box as the bar. So here the column's edge **is** the plane's
             *   edge, and 16 pushes the disc inboard of the card it belongs to while the card's own
             *   corner sits outside it. `md:px-0` is right on this step for exactly the reason it is
             *   wrong on the other.
             *
             * Below `md` neither case has a choice to make: the picker's panel is full-bleed and its
             * field and rows carry 16 of their own (`GIFT_PREMIUM_FIELD_INSET`), which is what
             * `AppBar` already gives. So this is a `md:` difference only, and it changes on a **step
             * change** — a whole-screen transition — rather than under a scroll, which is what keeps
             * it from reading as the bar twitching.
             */
            className={cn(
                'sticky top-0 z-20 backdrop-blur-[10px] transition-colors duration-300',
                // The picker's plane is the column itself from `md` — see the note above.
                ground === 'surface' && 'md:px-0',
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
                    /*
                     * Glass on the band, the surface disc on the other two grounds — the same flip
                     * `/premium`'s bar makes, driven here by the step rather than by a sentinel. See
                     * `PREMIUM_CONTROL_ON_HERO`.
                     */
                    className={cn(
                        PREMIUM_CONTROL_FLIP,
                        ground === 'brand' && PREMIUM_CONTROL_ON_HERO,
                    )}
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
                <PremiumManageButton onBrand={ground === 'brand'} />
            </AppBarCluster>
        </AppBar>
    )
}
