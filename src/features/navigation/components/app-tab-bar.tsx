'use client'

import { useRequireAuth } from '@features/auth'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumAvatarFrame } from '@shared/components/premium-avatar-frame'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import { TabBar, TabBarItem, TabBarProfile } from '@shared/ui/tab-bar'
import { usePathname } from 'next/navigation'
import { useAvatarSource } from '../hooks/use-avatar-source'
import { CreateTabBarFab } from './create-tab-bar-fab'

/**
 * The mobile app shell's bottom bar — `Tab Bar` from the design system, composed with
 * routing and i18n. Five entries, fixed order, as the DS ships them:
 * Home · Following · video FAB · Messages · My Space.
 *
 * The rail (`AppNavbar`) has nine entries; this has five. They are different Figma
 * components with different contents, not one component at two sizes.
 *
 * Home, Following and My Space are real links; the FAB opens the Create list (`CreateTabBarFab`,
 * the same two options the rail's `+` offers). **Messages is the only inert entry left**, rather
 * than pointing at a route that would 404. Give each a `href` as its route lands.
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
        <TabBar data-testid="navigation-tab-bar" aria-label={t('nav_main')}>
            <TabBarItem
                data-testid="navigation-tab-bar-home"
                href="/"
                selected={pathname === '/'}
                knockout
                label={t('nav_home')}
                icon={<Icon name="house-heart" weight="duotone" size={24} />}
            />
            {/*
             * A real `href`, like Home and My Space — and, as on My Space, that is not a hole in
             * "gate the action, never the route": `/following` renders a sign-in prompt for an
             * anonymous visitor rather than a list. Being a link is strictly better than an
             * onClick — middle-click, prefetch and copy-link all work.
             */}
            <TabBarItem
                data-testid="navigation-tab-bar-following"
                href="/following"
                selected={pathname === '/following'}
                label={t('nav_following')}
                icon={<Icon name="user-heart-alt" weight="duotone" size={24} />}
            />
            {/* The FAB, the Create list it opens and the app prompt behind its event row. */}
            <CreateTabBarFab />
            <TabBarItem
                data-testid="navigation-tab-bar-messages"
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
                data-testid="navigation-tab-bar-my-space"
                href="/my-space"
                selected={pathname === '/my-space' || pathname.startsWith('/@')}
                label={t('nav_my_space')}
                /* Same lift as the rail's: the crown overflows the clipped 22px circle, and the
                   inner selected ring would paint over the gold (the accent ring outside stays). */
                className={
                    avatar.isPremium
                        ? '[&_[data-slot=tab-bar-profile-avatar]]:overflow-visible [&_[data-slot=tab-bar-profile-avatar]]:after:hidden'
                        : undefined
                }
            >
                {/*
                 * `AnimatedAvatar` rather than a bare `<Image>`: a Premium creator's clip plays here
                 * too, which is what legacy's shared `userAvatar` does. It handles the still, the
                 * placeholder and the Premium gate itself, so there is no branch left here.
                 */}
                {avatar.isPremium ? (
                    <PremiumAvatarFrame badgeSize={11}>
                        <AnimatedAvatar {...avatar} alt="" size="xs" className="size-[18px]" />
                    </PremiumAvatarFrame>
                ) : (
                    <AnimatedAvatar {...avatar} alt="" size="xs" />
                )}
            </TabBarProfile>
        </TabBar>
    )
}
