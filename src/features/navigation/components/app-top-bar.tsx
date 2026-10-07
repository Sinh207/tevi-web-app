'use client'

import { StarChangeFlash, useBalance, useBalanceDisplay } from '@features/balance'
import { useMyChannel } from '@features/channel'
import { NOTIFICATION_PATH, useUnreadInbox } from '@features/notification/shell'
import { GET_STAR_PATH } from '@features/payment/routes'
import { PREMIUM_PATH } from '@features/premium/routes'
import { SEARCH_PATH } from '@features/search'
import { PremiumBadge } from '@shared/components/premium-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarCompact } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import {
    AppBar,
    AppBarButton,
    AppBarButtonIcon,
    AppBarCluster,
    AppBarStarIcon,
} from '@shared/ui/app-bar'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
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
    const { t, currentLanguage } = useTranslation()
    const { open: menuOpen, toggle: toggleMenu } = useMenu()
    /*
     * One small query, gated on a real account and kept live by the `inbox_change` socket event
     * rather than by polling. The rail's bell reads the same one, so between the two shells it is
     * a single request per account.
     */
    const { count: unread, hasUnread } = useUnreadInbox()
    /*
     * `—` until the balance is known, which is `useBalanceDisplay`'s decision rather than this
     * file's: a `0` on the shell's most prominent figure would tell a creator with 40,000 Star
     * that they have none, for the length of a fetch, on every cold load. This bar and the
     * account drawer read the same query, so between them it is one request.
     */
    const display = useBalanceDisplay()
    const { star: starCount, isKnown: starKnown } = useBalance()
    /*
     * Exact up to six digits, abbreviated from a million (`1.2M`, in the reader's notation) — the
     * pill fits `120,018` at 360px and a seventh digit pushed the search button off the bar. `—`
     * while unknown is still `useBalanceDisplay`'s.
     */
    const star = starKnown ? formatStarCompact(starCount, currentLanguage) : display.star
    /*
     * Premium is an upsell: to a reader who already has it, a crown inviting them to buy it is
     * noise in the most crowded row of the app. Hidden for them, shown to everyone else — guests
     * included, for whom it is the way in. `isPremium` is the reader's own (`MyChannelProvider`).
     */
    const { isPremium } = useMyChannel()

    return (
        <AppBar data-testid="navigation-top-bar" aria-label={t('nav_main')}>
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
                        /*
                         * **44 tall, on the discs' own paint** — the DS `App Bar/Star` pill is 24
                         * (or 29 at `large`) and sat between two 44px discs like a label dropped
                         * into a row of buttons. Here it is one more control in that row: the same
                         * height, the same `--background-topbar-action` fill and hairline, so the
                         * bar reads as five even objects.
                         *
                         * The `+` is a brand-tinted disc rather than the DS's solid black one: it is
                         * the affordance, not the figure, and a black disc was the heaviest thing on
                         * the bar. The figure is tabular so a balance that changes does not shift
                         * the pill's width digit by digit.
                         */
                        className={cn(
                            'flex h-11 flex-none items-center gap-1 rounded-full ps-2 pe-1',
                            'bg-(--background-topbar-action) shadow-[inset_0_0_0_1px_var(--button-topbar-border)]',
                            'transition-[scale] duration-150 active:scale-95 motion-reduce:transition-none',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                        )}
                    >
                        <AppBarStarIcon size={22} />
                        <span
                            data-testid="navigation-top-bar-star-count"
                            className="type-dense-strong text-(--text-title) tabular-nums"
                        >
                            {star}
                        </span>
                        {/* `aria-hidden`: one affordance with the count, not a second control —
                            the link's own label already says what pressing it does. */}
                        <span
                            aria-hidden
                            className="flex size-7 items-center justify-center rounded-full bg-(--text-brand)/14 text-(--text-brand)"
                        >
                            <Icon name="plus" size={16} />
                        </span>
                    </Link>

                    <StarChangeFlash />
                </span>
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
