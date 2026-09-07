'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'
import { toChannelPath } from '../lib/channel-slug'
import { CHANNEL_SETTINGS_CONTAINER, MY_SPACE_SCREEN } from '../lib/container'
import { useMyChannel } from '../providers/my-channel-provider'
import { ChannelEmptyState } from './channel-empty-state'
import { ChannelSkeleton } from './channel-view'

/**
 * `/my-space` — the tab bar's and the rail's destination.
 *
 * ## Why a route rather than a computed link
 *
 * The tab bar cannot link to `/@{ownSlug}` because it does not know the slug until `/me` and possibly
 * `my-channel/` have resolved, and it renders on every page. A static `/my-space` sidesteps that
 * entirely: there is no slug to compute, so there is nothing to wait for, and the entry can be a real
 * `href` — which means middle-click, prefetch and copy-link all work, unlike the `onClick` no-op it
 * replaces.
 *
 * ## The no-channel case is *not* handled here
 *
 * `MyChannelProvider` gates it globally — a real account without a space gets the onboarding screen in
 * place of every route, so it never reaches this one. That is the product rule (everything Tevi does
 * belongs to a channel), and putting it in the provider is what makes it true of every entry point
 * rather than just of this link.
 *
 * ## Not gated as a route
 *
 * An anonymous visitor gets a prompt here, not a redirect to `/login`. CLAUDE.md: screens gate the
 * **action**, never the route — so the sign-in button runs through `useRequireAuth` and opens the
 * dialog in place.
 *
 * ## The two empty states carry the tab's chrome; the redirect does not
 *
 * `/my-space` sits outside `(tabs)` even though the tab bar points at it, because the screen it
 * lands on — `/@{slug}` — draws its own bar (`ChannelTopBar`), and a route group cannot know that
 * this one resolves into another. That is right for the redirect and wrong for the two states where
 * the redirect never happens: they left the reader on a tab destination with **no bar at all** and
 * the prompt sitting on bare page colour, which is the one screen in the app with no chrome above
 * it.
 *
 * So the bar comes in as `chrome` from the page (`app/` composes, this decides *when*) and is
 * rendered only by the two empty branches. `ChannelSkeleton` keeps its own — it is the destination's
 * shape, bar included, and stacking two of them is exactly what putting this route in `(tabs)` would
 * have done.
 */
export function MySpaceRedirect({ chrome }: { chrome?: ReactNode }) {
    const { t } = useTranslation()
    const router = useRouter()
    const requireAuth = useRequireAuth()
    const { isAuthenticated, isBootstrapping } = useAuth()
    /**
     * Read from the global provider, not fetched here. So on any navigation after the first this is a
     * cache hit and the redirect is immediate — which matters because this route exists only to
     * bounce you somewhere else, and a spinner on the way to your own page reads as a stall.
     */
    const { myChannel, isLoading } = useMyChannel()

    const slug = myChannel?.slug

    useEffect(() => {
        // `replace`, so the browser's Back leaves the site rather than bouncing through this
        // redirect and straight back into it.
        if (slug) router.replace(toChannelPath(slug))
    }, [slug, router])

    // Bootstrap, the lookup, and the moment after it resolves but before the replace commits.
    if (isBootstrapping || isLoading || slug) {
        /*
         * The destination's own shape, not a spinner — this is a redirect to a channel page, so
         * showing the channel skeleton means the layout does not change twice.
         */
        return <ChannelSkeleton />
    }

    /**
     * The shell the two empty states share — the mobile bar, the 612 column, and the surface that
     * exists only where that bar does. See `MY_SPACE_SCREEN`.
     */
    function shell(content: ReactNode) {
        return (
            <div className={cn('flex flex-1 flex-col', MY_SPACE_SCREEN)}>
                {/*
                 * Below `md` only, like every other mobile top bar in this app: from `md` the left
                 * rail is the navigation and a tab destination draws no bar (home does not either).
                 * Sticky and painted in the screen's own colour, not `--background` — below `md` the
                 * surface is full-bleed, and a page-coloured bar there shows a strip of the wrong
                 * colour above the panel.
                 */}
                {chrome && (
                    <div
                        data-viewport="md-down"
                        className={cn('sticky top-0 z-20 md:hidden', MY_SPACE_SCREEN)}
                    >
                        {chrome}
                    </div>
                )}
                <div className={cn(CHANNEL_SETTINGS_CONTAINER, 'flex flex-1 flex-col')}>
                    {content}
                </div>
            </div>
        )
    }

    // `isAuthenticated` already excludes anonymous sessions, so this is the whole signed-out case.
    if (!isAuthenticated) {
        return shell(
            <ChannelEmptyState
                testId="channel-my-space-signed-out"
                icon="user-simple-alt"
                title={t('channel_signed_out_title')}
                body={t('channel_my_space_signed_out_body')}
                /*
                 * The same block every other signed-out screen renders — `flex-1` so the prompt
                 * centres in the space it has instead of clinging to the top of the column, and
                 * `RISE` so it arrives the way `MyStarView`, `MyWalletView` and this feature's own
                 * `SpaceVisibilityView` do. The page's `main` is `flex-1`; this is the last link in
                 * that chain. Without it this one screen dropped its prompt under the navbar while
                 * every sibling centred one, which is the whole difference a reader saw between
                 * tabs.
                 */
                className={cn('flex-1', RISE)}
                action={
                    <Button
                        data-testid="channel-my-space-sign-in"
                        variant="primary"
                        size="large"
                        onClick={requireAuth(() => {
                            // Signing in re-runs `useMyChannel`, and the effect above takes over.
                        })}
                    >
                        {t('auth_sign_in')}
                    </Button>
                }
            />,
        )
    }

    /**
     * `myChannel === null` for a signed-in account is normally **unreachable here**: the global
     * `MyChannelProvider` replaces every route with the onboarding gate in that state, so this screen
     * never renders. It is kept as a fallback rather than an `invariant` because there is one way to
     * reach it — the query erroring, which `onboardingGate` deliberately treats as "we do not know"
     * rather than "no channel", so the app stays usable. A dead end at `/my-space` would be the wrong
     * answer to a transient failure.
     */
    return shell(
        <ChannelEmptyState
            testId="channel-my-space-no-channel"
            icon="user-sparkles-alt"
            title={t('channel_no_channel_title')}
            body={t('channel_no_channel_body')}
            // Same centring as the branch above — the two states share this screen's whole column.
            className={cn('flex-1', RISE)}
            action={
                <Button
                    data-testid="channel-my-space-retry"
                    variant="secondary"
                    size="large"
                    onClick={() => router.refresh()}
                >
                    <Icon name="arrow-rotate-right" size={20} />
                    {t('common_retry')}
                </Button>
            }
        />,
    )
}
