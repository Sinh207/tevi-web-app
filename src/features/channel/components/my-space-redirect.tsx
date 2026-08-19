'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { toChannelPath } from '../lib/channel-slug'
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
 */
export function MySpaceRedirect() {
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

    // `isAuthenticated` already excludes anonymous sessions, so this is the whole signed-out case.
    if (!isAuthenticated) {
        return (
            <ChannelEmptyState
                icon="user-simple-alt"
                title={t('channel_signed_out_title')}
                action={
                    <Button
                        variant="primary"
                        size="large"
                        onClick={requireAuth(() => {
                            // Signing in re-runs `useMyChannel`, and the effect above takes over.
                        })}
                    >
                        {t('auth_sign_in')}
                    </Button>
                }
            />
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
    return (
        <ChannelEmptyState
            icon="user-sparkles-alt"
            title={t('channel_no_channel_title')}
            body={t('channel_no_channel_body')}
            action={
                <Button variant="secondary" size="large" onClick={() => router.refresh()}>
                    <Icon name="arrow-rotate-right" size={20} />
                    {t('common_retry')}
                </Button>
            }
        />
    )
}
