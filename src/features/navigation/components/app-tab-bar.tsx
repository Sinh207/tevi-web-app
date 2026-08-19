'use client'

import { useRequireAuth } from '@features/auth'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import { TabBar, TabBarFab, TabBarItem, TabBarProfile } from '@shared/ui/tab-bar'
import { usePathname } from 'next/navigation'
import { useAvatarSource } from '../hooks/use-avatar-url'

/**
 * The mobile app shell's bottom bar — `Tab Bar` from the design system, composed with
 * routing and i18n. Five entries, fixed order, as the DS ships them:
 * Home · Following · video FAB · Messages · My Space.
 *
 * The rail (`AppNavbar`) has nine entries; this has five. They are different Figma
 * components with different contents, not one component at two sizes.
 *
 * Home and My Space are real links; the rest stay inert rather than pointing at routes that would
 * 404. Give each a `href` as its route lands.
 *
 * My Space is selected for `/@{slug}` too, so tapping through to your own channel keeps the tab lit —
 * the alternative leaves the bar looking as though you navigated away from every tab.
 */
export function AppTabBar() {
    const { t } = useTranslation()
    const pathname = usePathname()
    const avatar = useAvatarSource()
    const requireAuth = useRequireAuth()
    /** Same rule as the rail: everything but Home belongs to an account. */
    const gated = requireAuth(() => {
        // TODO: navigate here as each destination lands.
    })

    return (
        <TabBar aria-label={t('nav_main')}>
            <TabBarItem
                href="/"
                selected={pathname === '/'}
                knockout
                label={t('nav_home')}
                icon={<Icon name="house-heart" weight="duotone" size={24} />}
            />
            <TabBarItem
                onClick={gated}
                label={t('nav_following')}
                icon={<Icon name="user-heart-alt" weight="duotone" size={24} />}
            />
            <TabBarFab aria-label={t('nav_video')} onClick={gated} />
            <TabBarItem
                knockout
                onClick={gated}
                label={t('nav_messages')}
                icon={<Icon name="comment-dots" weight="duotone" size={24} />}
            />
            {/*
             * A real `href`, not the gated no-op the other entries still use — and that is not a
             * hole in "gate the action, never the route". The route is *not* gated: `/my-space`
             * renders a sign-in prompt for an anonymous visitor and a create-space prompt for
             * someone with no channel. Being a link is strictly better than an onClick: middle-click,
             * prefetch and copy-link all work, and it needs no slug, so there is nothing to wait for.
             */}
            <TabBarProfile
                href="/my-space"
                selected={pathname === '/my-space' || pathname.startsWith('/@')}
                label={t('nav_my_space')}
            >
                {/*
                 * `AnimatedAvatar` rather than a bare `<Image>`: a Premium creator's clip plays here
                 * too, which is what legacy's shared `userAvatar` does. It handles the still, the
                 * placeholder and the Premium gate itself, so there is no branch left here.
                 */}
                <AnimatedAvatar {...avatar} alt="" size="xs" />
            </TabBarProfile>
        </TabBar>
    )
}
