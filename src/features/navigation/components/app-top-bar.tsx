'use client'

import { StarChangeFlash, useBalanceDisplay } from '@features/balance'
import { NOTIFICATION_PATH, useUnreadInbox } from '@features/notification/shell'
import { GET_STAR_PATH } from '@features/payment/routes'
import { PREMIUM_PATH } from '@features/premium/routes'
import { SEARCH_PATH } from '@features/search'
import { PremiumBadge } from '@shared/components/premium-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import {
    AppBar,
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
 * The notifications button links to `/notification` and carries the unread dot, now that
 * `features/notification` is a source for it. **The DS App Bar has no badge variant for a
 * button** — only the rail's `Navbar` does (`type="badge"`) — so the dot is composed here from
 * that one's own numbers: 8px, `--badge-bg`, and a 1px ring in the bar's background so it reads
 * as a cut-out against the glyph rather than a blob on top of it. Written out rather than
 * imported, because `BADGE_DOT` is positioned against the rail's 56px item and this button is 36.
 * If the DS ever draws a badged App Bar button, this is the call site to reconcile.
 */
export function AppTopBar() {
    const { t } = useTranslation()
    const { open: menuOpen, toggle: toggleMenu } = useMenu()
    /*
     * One small query, gated on a real account and kept live by the `inbox_change` socket event
     * rather than by polling. The rail's bell reads the same one, so between the two shells it is
     * a single request per account.
     */
    const { hasUnread } = useUnreadInbox()
    /*
     * `—` until the balance is known, which is `useBalanceDisplay`'s decision rather than this
     * file's: a `0` on the shell's most prominent figure would tell a creator with 40,000 Star
     * that they have none, for the length of a fetch, on every cold load. This bar and the
     * account drawer read the same query, so between them it is one request.
     */
    const { star } = useBalanceDisplay()

    return (
        <AppBar data-testid="navigation-top-bar" aria-label={t('nav_main')}>
            <AppBarCluster>
                <AppBarButton
                    data-testid="navigation-top-bar-menu"
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
                 * ## One link, to `/get-star` — the destination the comp always gave it
                 *
                 * It was `role="group"` while the balance was a placeholder, then a link to
                 * `/my-star` while `/get-star` did not exist, then briefly **two** links: the
                 * figure to the balance and the `+` to the purchase page, on the argument that a
                 * pill drawing two things should not send them to one place.
                 *
                 * That was over-thought. The `+` is not a second control, it is the affordance
                 * that says what pressing the pill does — which is why Figma draws it inside the
                 * capsule and why it was `aria-hidden` to begin with. `EndRailPill` has the same
                 * capsule without a `+` and goes to the same place, so splitting this one made
                 * the two pieces of chrome disagree about a press that means the same thing.
                 *
                 * `/my-star` keeps its own drawer row, so the balance's screen stays one tap away.
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
                        data-testid="navigation-top-bar-star-balance"
                        href={GET_STAR_PATH}
                        aria-label={t('balance_action_get_star')}
                        className="flex-none rounded-[2000px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                    >
                        <AppBarStarBalance>
                            <AppBarStarIcon />
                            <AppBarStarCount data-testid="navigation-top-bar-star-count">
                                {star}
                            </AppBarStarCount>
                            {/* `aria-hidden`: one affordance with the count, not a second control —
                                the link's own label already says what pressing it does. */}
                            <AppBarStarPlus aria-hidden>
                                <Icon name="plus" size={16} />
                            </AppBarStarPlus>
                        </AppBarStarBalance>
                    </Link>

                    <StarChangeFlash />
                </span>
            </AppBarCluster>

            <AppBarCluster>
                <AppBarButton
                    data-testid="navigation-top-bar-premium"
                    href={PREMIUM_PATH}
                    aria-label={t('appbar_premium')}
                >
                    <AppBarButtonIcon>
                        {/* The button already carries the label, so the badge is decorative. */}
                        <PremiumBadge size={22} />
                    </AppBarButtonIcon>
                </AppBarButton>
                <AppBarButton
                    data-testid="navigation-top-bar-notifications"
                    href={NOTIFICATION_PATH}
                    aria-label={t('nav_notifications')}
                    className="relative"
                >
                    <AppBarButtonIcon>
                        <Icon name="bell" size={22} />
                    </AppBarButtonIcon>
                    {hasUnread && (
                        /*
                         * Decorative: `aria-label` on the button already names the destination, and
                         * the *count* is announced by the screen itself. A second announcement here
                         * would be a badge with no wording that reads well next to "Notifications".
                         *
                         * `end-` and not `right-`, so it mirrors under RTL — `pnpm lint:rtl` would
                         * refuse the other spelling anyway.
                         */
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute top-[5px] end-[5px] size-2 rounded-[var(--radius-fill)] border border-(--background) bg-(--badge-bg)"
                        />
                    )}
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
