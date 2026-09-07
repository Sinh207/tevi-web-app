'use client'

import { BarIconButton } from '@shared/components/bar-icon-button'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarCluster, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { useRouter } from 'next/navigation'
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
 * (Legacy's back button is a **white 32px disc with a dark glyph** even over the violet, so
 * `BarIconButton` is the faithful control rather than the DS's `overlay` theme, which would put a
 * dark translucent pill there instead.)
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
                <PremiumManageButton />
            </AppBarCluster>
        </AppBar>
    )
}
