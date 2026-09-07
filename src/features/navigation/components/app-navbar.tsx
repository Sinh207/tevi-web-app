'use client'

import { useRequireAuth } from '@features/auth'
import { NOTIFICATION_PATH, useUnreadInbox } from '@features/notification/shell'
import { SEARCH_PATH } from '@features/search'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import { Logo } from '@shared/ui/logo'
import { Navbar, NavbarGroup, NavbarItem, NavbarRule } from '@shared/ui/navbar'
import { usePathname } from 'next/navigation'
import { useAvatarSource } from '../hooks/use-avatar-source'
import { useMenu } from '../providers/menu-state'
import { CreateRailEntry } from './create-rail-entry'

/**
 * The app shell's left rail — `Navbar (Web)` from the design system, composed with
 * routing and i18n. The nine entries and their order are fixed by the DS:
 * Home · Following · Chat · Create · Search · Notifications · Profile · Menu · Language.
 *
 * Home, Following, Search, Notifications and Profile are real links; Create opens a two-option
 * menu (`CreateRailEntry`); Menu and Language drive the drawer. **Chat is the only inert entry
 * left**, rather than pointing at a route that would 404. Give each a `href` as its route lands.
 *
 * None of those five is behind `gated`, and Search is the one where that is a statement rather
 * than a consequence: the others render their own signed-out prompt, while Search genuinely
 * *works* without an account. Gating it would put a sign-in dialog in front of the surface a
 * visitor uses to find somebody to sign up for. See the entry itself.
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
     * The callback is empty because the one destination still using this — **Chat** — does not
     * exist yet. For a signed-in visitor this changes nothing; what it adds is the prompt
     * for everyone else, which is the whole point — gate the *action*, never the route.
     *
     * Create used to be the second consumer and now has `CreateRailEntry`, which is the shape the
     * others should take as they land: a gated press that *does* something, not a gated no-op.
     */
    const gated = requireAuth(() => {
        // TODO: navigate here as each destination lands.
    })

    /**
     * Figma's Notifications entry is Type=Badge, and the dot means unread. It was pinned to
     * `false` for as long as there was no unread source — a dot that is always on is decoration
     * pretending to be state — and `features/notification` is that source.
     *
     * `useUnreadInbox` is one small query, gated on a real account and kept live by the
     * `inbox_change` socket event rather than by polling. For a guest it never runs, so the bell
     * renders bare and its press raises the login dialog like every other gated entry.
     */
    const { hasUnread } = useUnreadInbox()

    /** Named once: it decides the entry's ground *and* the glyph's weight, and the two must not
     *  be able to disagree. */
    const onNotification = pathname === NOTIFICATION_PATH

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
            data-testid="navigation-navbar"
            className="shadow-[inset_-1px_0_0_var(--separator-default)] rtl:shadow-[inset_1px_0_0_var(--separator-default)]"
        >
            <NavbarGroup group="brand">
                <Logo size={48} title={null} />
                <NavbarRule />
            </NavbarGroup>

            <NavbarGroup group="nav">
                <NavbarItem
                    href="/"
                    selected={pathname === '/'}
                    aria-label={t('nav_home')}
                    data-testid="navigation-navbar-home"
                >
                    {pathname === '/' ? (
                        <Icon name="house" weight="filled" size={24} />
                    ) : (
                        <Icon name="house" size={24} />
                    )}
                </NavbarItem>
                {/* A real link, like Home and Profile: `/following` is not a gated route — it
                    renders a sign-in prompt for an anonymous visitor — and it needs no slug, so
                    there is nothing to resolve before the rail can point at it. */}
                <NavbarItem
                    href="/following"
                    selected={pathname === '/following'}
                    aria-label={t('nav_following')}
                    data-testid="navigation-navbar-following"
                >
                    {/*
                     * Selected is **solid**, like Home above — but it gets there a different way,
                     * and the difference is the sprite's.
                     *
                     * `Navbar (Web)/Item` (Figma 3626:26304) draws Selected with the *filled* glyph
                     * on every type: outline house → `house--filled`, outline bell →
                     * `bell--filled`. `user-heart-alt` cannot follow that literally, because it is
                     * the one glyph in the DS's "Users & People" group with **no filled render** —
                     * `icons.md` marks all eight of its siblings `(filled only)` and leaves this
                     * one unannotated, and the sprite carries default, `--regular` and `--duotone`
                     * and nothing else. `weight="filled"` here is a type error, not a wrong render.
                     * The DS's own rail preview never draws Following as selected, which is why the
                     * gap had never surfaced.
                     *
                     * `duotone` **alone** is not the answer either — that was the first attempt and
                     * it shipped the bug: duotone is a tint path at `opacity: 0.4` under solid
                     * detail paths, so at `--icon-default` the item came out half white and half
                     * grey beside five single-tone glyphs, reading as a rendering fault rather than
                     * as a state.
                     *
                     * `--tevi-icon-tint: 1` is the missing half, and it is the DS's own mechanism
                     * rather than a workaround: the hook exists precisely because "Figma drops the
                     * Duotone tint to full strength" (see `docs/DESIGN_SYSTEM.md` §3 and
                     * `shared/ui/tab-bar.tsx`), and it is a custom property because a `<use>` clone
                     * lives in a shadow tree that no stylesheet rule can reach. At full tint every
                     * path is `currentColor`, so the glyph is a solid silhouette — the filled
                     * render, out of the DS's own art, with nothing substituted and nothing drawn.
                     *
                     * It is also **exactly how the DS paints this glyph when it is active
                     * elsewhere**: the tab bar takes the same icon to full tint, and is the one
                     * entry there that gets *no* white knockout on the detail layer, so every path
                     * stays one colour. Same glyph, same state, same treatment.
                     */}
                    {pathname === '/following' ? (
                        <Icon
                            name="user-heart-alt"
                            weight="duotone"
                            size={24}
                            className="[--tevi-icon-tint:1]"
                        />
                    ) : (
                        <Icon name="user-heart-alt" size={24} />
                    )}
                </NavbarItem>
                <NavbarItem
                    aria-label={t('nav_chat')}
                    data-testid="navigation-navbar-chat"
                    onClick={gated}
                >
                    <Icon name="comment-dots" size={24} />
                </NavbarItem>
                {/* The accent `+`, its menu and the app prompt behind the event row — one flex
                    item in this group, everything else portalled. See `CreateRailEntry`. */}
                <CreateRailEntry />
                {/*
                 * A real link, and **not gated**. Global search is public — legacy's page is too
                 * — and the only part of that screen that needs an account is the Following
                 * grid, which the hook simply does not fetch without one. Putting the sign-in
                 * prompt in front of it would wall a visitor off from the one surface that helps
                 * them find a creator to sign up for.
                 */}
                <NavbarItem
                    href={SEARCH_PATH}
                    selected={pathname === SEARCH_PATH}
                    aria-label={t('nav_search')}
                    data-testid="navigation-navbar-search"
                >
                    <Icon name="search" size={24} />
                </NavbarItem>
                {/*
                 * A real link, and **not** `gated`, unlike the three inert entries above it.
                 * `/notification` renders its own signed-out prompt (which raises the same login
                 * dialog from a button the reader can read a sentence next to), so gating the rail
                 * entry would put a modal in front of a screen that explains itself — the pattern
                 * `/my-space` already follows.
                 */}
                <NavbarItem
                    type={hasUnread ? 'badge' : 'icon'}
                    href={NOTIFICATION_PATH}
                    selected={onNotification}
                    aria-label={t('nav_notifications')}
                    data-testid="navigation-navbar-notifications"
                >
                    {/*
                     * **Filled while this is the current screen**, the same swap Home makes two
                     * entries up: `NavbarItem`'s `selected` paints the item's ground, and the glyph
                     * going solid is the other half of what makes an entry read as *where you are*
                     * rather than as merely hovered. A bell that stays outlined on its own screen
                     * looks like the selection did not take.
                     *
                     * `bell` is in `TeviIconNameFilled`, so the pair is typed rather than hoped at,
                     * and the sprite subset already carries `bell--filled` (`pnpm icons` keeps any
                     * literal name+weight pair — pass 1 — so this needed no rebuild).
                     *
                     * Not `duotone` at full tint, which is what Following does directly above.
                     * That entry needs it because `user-heart-alt` has **no filled weight** and the
                     * tab bar establishes the tint trick as this DS's stand-in for one. The bell
                     * has a real filled weight, so using the workaround here would be inventing a
                     * second way to say the same thing.
                     */}
                    {onNotification ? (
                        <Icon name="bell" weight="filled" size={24} />
                    ) : (
                        <Icon name="bell" size={24} />
                    )}
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
                    data-testid="navigation-navbar-profile"
                >
                    {/* Animated for a Premium creator — same component the tab bar uses. */}
                    <AnimatedAvatar {...avatar} alt="" size="xs" />
                </NavbarItem>
            </NavbarGroup>

            <NavbarGroup group="bottom">
                <NavbarRule />
                <NavbarItem
                    aria-label={t('nav_menu')}
                    data-testid="navigation-navbar-menu"
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
                    data-testid="navigation-navbar-language"
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
