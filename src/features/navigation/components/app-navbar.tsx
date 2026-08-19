'use client'

import { useRequireAuth } from '@features/auth'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import { Logo } from '@shared/ui/logo'
import { Navbar, NavbarGroup, NavbarItem, NavbarRule } from '@shared/ui/navbar'
import { usePathname } from 'next/navigation'
import { useAvatarSource } from '../hooks/use-avatar-url'
import { useMenu } from '../providers/menu-state'

/**
 * The app shell's left rail — `Navbar (Web)` from the design system, composed with
 * routing and i18n. The nine entries and their order are fixed by the DS:
 * Home · Following · Chat · Create · Search · Notifications · Profile · Menu · Language.
 *
 * Phase 1 only has `/`, so Home is the one real link and the other eight are inert
 * rather than pointing at routes that would 404. Give each a `href` as its route
 * lands.
 */
export function AppNavbar() {
    const { t } = useTranslation()
    const { open: menuOpen, toggle: toggleMenu, close: closeMenu, view, openAt } = useMenu()
    const pathname = usePathname()
    const avatar = useAvatarSource()
    const requireAuth = useRequireAuth()

    /**
     * Every rail entry that belongs to *your* account, behind the sign-in prompt.
     *
     * Home stays open — it is the public feed, and a platform whose front door asks for
     * credentials has no front door. So do Menu and Language in the bottom group: Menu is
     * a panel toggle rather than a destination, and it is where a guest reaches the
     * language switcher and the policies, so gating it would wall off the one surface
     * they still need.
     *
     * The callback is empty because none of these destinations exists yet (Phase 1 has
     * only `/`). For a signed-in visitor this changes nothing; what it adds is the prompt
     * for everyone else, which is the whole point — gate the *action*, never the route.
     */
    const gated = requireAuth(() => {
        // TODO: navigate here as each destination lands.
    })

    /**
     * Figma's Notifications entry is Type=Badge, but the dot means unread. There is
     * no unread source yet, so it stays an Icon until one exists — a dot that is
     * always on would be decoration pretending to be state.
     */
    const hasUnread = false

    /** The drawer is open *and* standing on the Language screen. */
    const languageOpen = menuOpen && view === 'language'

    return (
        /**
         * The comp gives the rail a `border-right: 1px solid --separator-default` to
         * separate it from the page. Painted as an inset shadow, not a border: the
         * rail is 88 border-box with 16 of padding, so a real 1px border would leave
         * a 55px content box for 56px items and knock every glyph half a pixel off
         * centre. Mirrored for RTL, where the rail sits on the right.
         */
        <Navbar
            aria-label={t('nav_main')}
            className="shadow-[inset_-1px_0_0_var(--separator-default)] rtl:shadow-[inset_1px_0_0_var(--separator-default)]"
        >
            <NavbarGroup group="brand">
                <Logo size={48} title={null} />
                <NavbarRule />
            </NavbarGroup>

            <NavbarGroup group="nav">
                <NavbarItem href="/" selected={pathname === '/'} aria-label={t('nav_home')}>
                    {pathname === '/' ? (
                        <Icon name="house" weight="filled" size={24} />
                    ) : (
                        <Icon name="house" size={24} />
                    )}
                </NavbarItem>
                <NavbarItem aria-label={t('nav_following')} onClick={gated}>
                    <Icon name="user-heart-alt" size={24} />
                </NavbarItem>
                <NavbarItem aria-label={t('nav_chat')} onClick={gated}>
                    <Icon name="comment-dots" size={24} />
                </NavbarItem>
                <NavbarItem type="accent" aria-label={t('nav_create')} onClick={gated}>
                    <Icon name="plus" size={24} />
                </NavbarItem>
                <NavbarItem aria-label={t('nav_search')} onClick={gated}>
                    <Icon name="search" size={24} />
                </NavbarItem>
                <NavbarItem
                    type={hasUnread ? 'badge' : 'icon'}
                    aria-label={t('nav_notifications')}
                    onClick={gated}
                >
                    <Icon name="bell" size={24} />
                </NavbarItem>
                {/*
                 * A real link, like the tab bar's. `/my-space` is not a gated route — it renders a
                 * prompt for an anonymous visitor — and it needs no slug, so there is nothing to
                 * resolve before the rail can point at it.
                 */}
                <NavbarItem
                    type="avatar"
                    href="/my-space"
                    selected={pathname === '/my-space' || pathname.startsWith('/@')}
                    aria-label={t('nav_profile')}
                >
                    {/* Animated for a Premium creator — same component the tab bar uses. */}
                    <AnimatedAvatar {...avatar} alt="" size="xs" />
                </NavbarItem>
            </NavbarGroup>

            <NavbarGroup group="bottom">
                <NavbarRule />
                <NavbarItem
                    aria-label={t('nav_menu')}
                    aria-expanded={menuOpen}
                    aria-controls="app-menu-drawer"
                    selected={menuOpen}
                    onClick={toggleMenu}
                >
                    <Icon name="menu-bars" size={24} />
                </NavbarItem>
                {/*
                 * A shortcut into the drawer's Language screen, not a switcher of its own —
                 * one list of languages, one place it lives. `aria-expanded` reports the
                 * drawer (which is what this controls, open at whatever screen), while
                 * `selected` marks only the case where that screen is the one showing.
                 * Pressing it again while it *is* showing closes the drawer, the way the
                 * Menu entry above toggles.
                 */}
                <NavbarItem
                    aria-label={t('nav_language')}
                    aria-expanded={menuOpen}
                    aria-controls="app-menu-drawer"
                    selected={languageOpen}
                    onClick={() => (languageOpen ? closeMenu() : openAt('language'))}
                >
                    <Icon name="language" size={24} />
                </NavbarItem>
            </NavbarGroup>
        </Navbar>
    )
}
