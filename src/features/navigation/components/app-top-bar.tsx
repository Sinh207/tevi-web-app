'use client'

import { StarBalancePill } from '@features/balance'
import { useMyChannel } from '@features/channel'
import { NOTIFICATION_PATH, useUnreadInbox } from '@features/notification/shell'
import { PREMIUM_PATH } from '@features/premium/routes'
import { SEARCH_PATH } from '@features/search'
import { PremiumBadge } from '@shared/components/premium-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarButton, AppBarButtonIcon, AppBarCluster } from '@shared/ui/app-bar'
import { Icon } from '@shared/ui/icon'
import { useMenu } from '../providers/menu-state'
import { NotificationBell } from './notification-bell'

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
 * The notifications button links to `/notification` and carries the unread dot, now that
 * `features/notification` is a source for it. **The DS App Bar has no badge variant for a
 * button** — only the rail's `Navbar` does (`type="badge"`) — so the dot is composed here from
 * that one's own numbers: 8px, `--badge-bg`, and a 1px ring in the bar's background so it reads
 * as a cut-out against the glyph rather than a blob on top of it. Written out rather than
 * imported, because `BADGE_DOT` is positioned against the rail's 56px item and this button is 36.
 * If the DS ever draws a badged App Bar button, this is the call site to reconcile.
 */
/**
 * The icon buttons **without** the DS disc — the 44px target stays, the fill and the hairline go.
 *
 * The bar is frosted glass now (`AppTopBarDock`), and four outlined circles on glass read as four
 * more surfaces stacked on one: busy, and heavier than the content under them. Bare glyphs on the
 * glass are the shape Instagram and Threads settle on. The Star pill alone keeps a chip, so the one
 * figure on the bar is also its one filled object. The disc comes back on hover and on press, as
 * the feedback a bare glyph otherwise lacks. The override is a `className` on the DS button, so
 * `shared/ui/app-bar.tsx` is unchanged.
 */
const GHOST =
    'bg-transparent shadow-none hover:bg-(--background-topbar-action) active:bg-(--background-topbar-action)'

export function AppTopBar() {
    const { t } = useTranslation()
    const { open: menuOpen, toggle: toggleMenu } = useMenu()
    /*
     * One small query, gated on a real account and kept live by the `inbox_change` socket event
     * rather than by polling. The rail's bell reads the same one, so between the two shells it is
     * a single request per account.
     */
    const { count: unread, hasUnread } = useUnreadInbox()
    /*
     * Premium is an upsell: to a reader who already has it, a crown inviting them to buy it is
     * noise in the most crowded row of the app. Hidden for them, shown to everyone else — guests
     * included, for whom it is the way in. `isPremium` is the reader's own (`MyChannelProvider`).
     */
    const { isPremium } = useMyChannel()

    return (
        /*
         * `max-md:px-0`: both edge controls (the menu and search) are `GHOST` — a 22px glyph in a 44px
         * target that already holds it 11px off its own edge — so `AppBar`'s 16 on top doubled the
         * inset. `PageBackBar`'s note has the rule; it applies only while the edge controls have no fill.
         */
        <AppBar data-testid="navigation-top-bar" aria-label={t('nav_main')} className="max-md:px-0">
            <AppBarCluster>
                <AppBarButton
                    data-testid="navigation-top-bar-menu"
                    className={GHOST}
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
                 * The Star pill — `features/balance`'s, shared with the channel and post bars
                 * below `md`.
                 * Its geometry, destination and flash are documented there.
                 */}
                <StarBalancePill testId="navigation-top-bar-star-balance" />
            </AppBarCluster>

            <AppBarCluster>
                {!isPremium && (
                    <AppBarButton
                        data-testid="navigation-top-bar-premium"
                        className={GHOST}
                        href={PREMIUM_PATH}
                        aria-label={t('appbar_premium')}
                    >
                        <AppBarButtonIcon>
                            {/* The button already carries the label, so the badge is decorative. */}
                            <PremiumBadge size={22} />
                        </AppBarButtonIcon>
                    </AppBarButton>
                )}
                <AppBarButton
                    data-testid="navigation-top-bar-notifications"
                    href={NOTIFICATION_PATH}
                    aria-label={t('nav_notifications')}
                    className={cn('relative', GHOST)}
                >
                    <AppBarButtonIcon>
                        {/* The glyph, its count badge and their motion — `NotificationBell`. */}
                        <NotificationBell count={hasUnread ? unread : 0} />
                    </AppBarButtonIcon>
                </AppBarButton>
                {/*
                 * The one action in this bar that has a destination, so it is the one that is a
                 * real link — `href` on `AppBarButton` renders an `<a>`, which is what keeps
                 * ⌘-click and the status-bar preview working. Premium and Notifications stay
                 * buttons because neither has a route yet; each becomes an `href` as it lands.
                 *
                 * Not gated: `/search` is public. The rail's own entry says why.
                 */}
                <AppBarButton
                    data-testid="navigation-top-bar-search"
                    className={GHOST}
                    href={SEARCH_PATH}
                    aria-label={t('nav_search')}
                >
                    <AppBarButtonIcon>
                        <Icon name="search" size={22} />
                    </AppBarButtonIcon>
                </AppBarButton>
            </AppBarCluster>
        </AppBar>
    )
}
