'use client'

import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { useRouter } from 'next/navigation'
import { PREMIUM_CONTROL_FLIP, PREMIUM_CONTROL_ON_HERO } from '../lib/premium-surface'
import { PremiumManageButton } from './premium-manage-button'

/**
 * The bar that floats **on** the brand band — back · "Tevi Premium" · Manage in Stripe.
 *
 * ## Why this screen has its own bar instead of `PageBackBar`
 *
 * One reason, and it is a colour: the DS bar's title takes its ink from `--text-title`, which is
 * near-black in Light. Over a near-black-to-violet gradient that is unreadable, and legacy prints
 * the title in **white** here — the only screen in the app that does. `PageBackBar` cannot be handed
 * that: `titleClassName` lands on the title's *box*, while the ink is on `AppBarTitleText` inside
 * it, so a caller cannot reach it. Everything else is the same bar — the DS `AppBar` frame, the
 * shared `BarIconButton`, the same 60px height, the same trailing cluster.
 *
 * (Legacy's back button is a **white 32px disc with a dark glyph** even over the violet, and this
 * bar's controls are `BarIconButton` and its pill rather than the DS's `overlay` theme, which is
 * drawn for a bar over photography and would put a dark translucent plate on an already near-black
 * band. What they do take from that theme is its hairline of light: on the band both controls wear
 * `PREMIUM_CONTROL_ON_HERO` — frosted glass, white ink — and they cross to the surface-and-hairline
 * paint with the rest of the bar. That constant carries the reasoning and the measured contrast.)
 *
 * ## `stuck` is the band's news, so the band is what decides it
 *
 * Transparent with white ink while any part of the brand band is still behind the bar; the page's
 * own ground and ink once the band has gone past. `PremiumHero` owns that observation because it
 * owns the band — see the sentinel there, and the note on why it is at the band's **bottom** rather
 * than its top.
 *
 * Legacy has `transition: background 0.3s ease` on this bar and `transition: color 0.3s ease` on its
 * title, and **no state to drive either** — the transitions are the design's intent, written down
 * and never wired. This is the wiring, at legacy's own 300ms. `backdrop-blur` stays on in both
 * states, as its `backdropFilter: blur(10px)` does.
 */
export function PremiumTopBar({
    /** The band has scrolled out from under the bar. See the note above. */
    stuck,
}: {
    stuck: boolean
}) {
    const { t } = useTranslation()
    const router = useRouter()

    return (
        <AppBar
            data-stuck={stuck || undefined}
            /*
             * **The bar keeps `AppBar`'s own `px-4` at every width — no `md:px-0` here.**
             *
             * `PageBackBar`'s rule is to drop the bar's inset from `md`, because on those screens
             * the *column* carries the 16 below `md` and a card carries it above, so 0 lines the
             * back disc up with the panel's edge. This screen is the other shape: the column is
             * `disableGutters` (the **band** has to reach its edges) and the content is inset by
             * `PREMIUM_INSET` — 16 — at *every* width. So `md:px-0` did not align the disc with
             * anything; measured at 1280 it sat at the band's edge (334) while the mark, the copy
             * and the plan cards sat 16 further in (350), which reads as a control falling off the
             * band. 16 at every width is this screen's content inset, and it is the number the
             * band's own children use.
             */
            className={cn(
                'sticky top-0 z-20 backdrop-blur-[10px] transition-colors duration-300',
                stuck && 'bg-(--background)',
            )}
        >
            <AppBarCluster className="min-w-0">
                <BarIconButton
                    data-testid="premium-back"
                    name="angle-left"
                    weight="filled"
                    mirrored
                    label={t('common_back')}
                    /*
                     * The two ends of the bar flip together — see `PREMIUM_CONTROL_ON_HERO`. It is
                     * passed as a class here and as a prop to the pill because that is what each
                     * control accepts: `BarIconButton` is a `className` component by design (its own
                     * note: the disc's ground is not knowable at the call site), while the pill has a
                     * second paint of its own to switch and takes the answer typed.
                     */
                    className={cn(PREMIUM_CONTROL_FLIP, !stuck && PREMIUM_CONTROL_ON_HERO)}
                    onClick={() => {
                        /*
                         * `history.length` is the only signal available for "is there anywhere to go
                         * back to", and it is read in the handler because it is meaningless during
                         * SSR. Same handler, same fallback, as `PageBackBar` — this screen is reached
                         * from a share link and a push notification as often as from the drawer.
                         */
                        if (window.history.length > 1) router.back()
                        else router.push('/')
                    }}
                />
            </AppBarCluster>

            {/*
             * Absolutely centred (the DS default), so the title stays on the bar's centre whatever
             * the clusters weigh. The `max-w` is the reserve that clears the 40px button and the
             * bar's padding at both ends, so a long title truncates instead of sliding under a
             * control.
             */}
            <AppBarTitle className="max-w-[calc(100%-160px)]">
                <AppBarTitleText
                    as="h1"
                    className={cn(
                        'max-w-full truncate transition-colors duration-300',
                        /*
                         * White while the band is behind it. Fixed `white`, not
                         * `--text-on-primary` — that token flips to black in Dark, and the band is
                         * the same near-black-to-violet in both modes.
                         */
                        stuck ? 'text-(--text-title)' : 'text-white',
                    )}
                >
                    {t('premium_title')}
                </AppBarTitleText>
            </AppBarTitle>

            <AppBarCluster>
                <PremiumManageButton onBrand={!stuck} />
            </AppBarCluster>
        </AppBar>
    )
}
