'use client'

import { StarChangeFlash, useBalanceDisplay } from '@features/balance'
import { MY_STAR_PATH } from '@features/my-star/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import {
    AppBar,
    AppBarBadge,
    AppBarButton,
    AppBarButtonIcon,
    AppBarCluster,
    AppBarStarBalance,
    AppBarStarCount,
    AppBarStarIcon,
    AppBarStarPlus,
} from '@shared/ui/app-bar'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { useMenu } from '../providers/menu-state'

/**
 * The mobile top bar — DS `App Bar` parts arranged the way the app's home screen
 * arranges them: menu · star balance · premium · notifications · search.
 *
 * The bar is one of the nine Figma Style variants only in spirit; the home
 * arrangement is not among them (they are content presets like `title-center` and
 * `message-detail`), so it is composed from the parts, which is what the DS expects.
 *
 * The Star count is live as of `features/balance` and the pill links to `/my-star`. It reads
 * `—` while the balance is unknown — a placeholder rather than a made-up number, which is
 * `useBalanceDisplay`'s call and not this file's.
 *
 * The notifications button still carries no unread dot, held back for the same reason the
 * rail's bell is: there is no data for it. Not a layout change either way — the button is
 * already the right size.
 */
export function AppTopBar() {
    const { t } = useTranslation()
    const { open: menuOpen, toggle: toggleMenu } = useMenu()
    /*
     * `—` until the balance is known, which is `useBalanceDisplay`'s decision rather than this
     * file's: a `0` on the shell's most prominent figure would tell a creator with 40,000 Star
     * that they have none, for the length of a fetch, on every cold load. This bar and the
     * account drawer read the same query, so between them it is one request.
     */
    const { star } = useBalanceDisplay()

    return (
        <AppBar aria-label={t('nav_main')}>
            <AppBarCluster>
                <AppBarButton
                    aria-label={t('nav_menu')}
                    aria-expanded={menuOpen}
                    aria-controls="app-menu-drawer"
                    onClick={toggleMenu}
                >
                    <AppBarButtonIcon>
                        <Icon name="menu-bars" size={22} />
                    </AppBarButtonIcon>
                </AppBarButton>

                {/*
                 * Figma models the standalone pill with the icon, count and plus as
                 * direct children on a 4 gap — `AppBarButtonFrame` is only for the
                 * `star-balance` *button* variant, where the pill sits inside a 44 tall
                 * action.
                 *
                 * ## Now a link, and to `/my-star` rather than to a purchase
                 *
                 * It was `role="group"` while the balance was a placeholder, because a control
                 * that shows nothing and goes nowhere should not be announced as pressable.
                 * The figure is live as of `features/balance`, so it becomes a real link.
                 *
                 * The comp sends this pill to the **purchase** screen, which does not exist yet;
                 * `/my-star` is where the balance it displays lives, so the destination matches
                 * what the control is showing rather than standing in for a missing one. It moves
                 * to `/get-star` when that lands — at which point the `+` becomes the thing
                 * carrying the purchase intent, which is what it is for.
                 *
                 * `+` stays `aria-hidden`: it is one affordance with the count, not a second
                 * control, and the link's own label already says what pressing it does.
                 */}
                {/*
                 * The anchor wraps the pill rather than replacing it: `AppBarStarBalance` is a
                 * plain DS `div` with no polymorphic escape, and adding one to a shared primitive
                 * for a single caller is a bigger change than a wrapper. `flex-none` so the anchor
                 * hugs the pill exactly, leaving the pill's own geometry untouched.
                 */}
                {/*
                 * The wrapper carries `relative`, and the flash is the anchor's **sibling**.
                 *
                 * `StarChangeFlash` centres itself in its positioning context, so it has to be scoped
                 * to the Star pill and nothing wider — otherwise the number drifts down under
                 * whichever control happens to sit in the middle of the bar. And it stays outside the
                 * link because it carries a `role="status"` sentence, which inside an anchor would be
                 * content of that anchor.
                 *
                 * The same figure moves here as in the desktop rail, so it gets the same
                 * acknowledgement — a spend on a phone is most spends.
                 */}
                <span className="relative flex flex-none items-center">
                    <Link
                        href={MY_STAR_PATH}
                        aria-label={t('appbar_star_balance')}
                        className="flex-none rounded-[2000px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                    >
                        <AppBarStarBalance>
                            <AppBarStarIcon />
                            <AppBarStarCount>{star}</AppBarStarCount>
                            <AppBarStarPlus aria-hidden>
                                <Icon name="plus" size={16} />
                            </AppBarStarPlus>
                        </AppBarStarBalance>
                    </Link>

                    <StarChangeFlash />
                </span>
            </AppBarCluster>

            <AppBarCluster>
                <AppBarButton aria-label={t('appbar_premium')}>
                    <AppBarButtonIcon>
                        <AppBarBadge size={22}>
                            <Icon name="premium" weight="filled" size={24} />
                        </AppBarBadge>
                    </AppBarButtonIcon>
                </AppBarButton>
                <AppBarButton aria-label={t('nav_notifications')}>
                    <AppBarButtonIcon>
                        <Icon name="bell" size={22} />
                    </AppBarButtonIcon>
                </AppBarButton>
                <AppBarButton aria-label={t('nav_search')}>
                    <AppBarButtonIcon>
                        <Icon name="search" size={22} />
                    </AppBarButtonIcon>
                </AppBarButton>
            </AppBarCluster>
        </AppBar>
    )
}
