'use client'

import { toChannelPath, useMyChannel } from '@features/channel'
import { isMessagesPath, MESSAGES_PATH } from '@features/message/routes'
import { useLiveUnreadConversations } from '@features/message/shell'
import { NOTIFICATION_PATH, useUnreadInbox } from '@features/notification/shell'
import { SEARCH_PATH } from '@features/search'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumAvatarFrame } from '@shared/components/premium-avatar-frame'
import { Tooltip, TooltipProvider } from '@shared/components/tooltip'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Logo } from '@shared/ui/logo'
import { Navbar, NavbarGroup, NavbarItem, NavbarRule } from '@shared/ui/navbar'
import { usePathname } from 'next/navigation'
import type { CSSProperties } from 'react'
import { useAvatarSource } from '../hooks/use-avatar-source'
import { usePressedDestination } from '../hooks/use-pressed-destination'
import { isOwnSpacePath } from '../lib/tab-destinations'
import { useMenu } from '../providers/menu-state'
import { CreateRailEntry } from './create-rail-entry'
import { NAV_INDICATOR, NAV_SLIDE, NAV_SPRING, NAV_TINT, NavGlyph } from './nav-glyph'

/**
 * The app shell's left rail — `Navbar (Web)` from the design system, composed with
 * routing and i18n. The nine entries and their order are fixed by the DS:
 * Home · Following · Chat · Create · Search · Notifications · Profile · Menu · Language.
 *
 * Home, Following, Chat, Search, Notifications and Profile are real links; Create opens a
 * two-option menu (`CreateRailEntry`); Menu and Language drive the drawer.
 *
 * None of the links is behind a sign-in gate, and Search is the one where that is a statement
 * rather than a consequence: the others render their own signed-out prompt, while Search genuinely
 * *works* without an account. Gating it would put a sign-in dialog in front of the surface a
 * visitor uses to find somebody to sign up for. See the entry itself.
 */
/**
 * A selected rail item in the tab bar's language — the DS item's grey fill gives way to the sliding
 * brand indicator behind the group, and the glyph takes `--text-brand`. Hover is unchanged: the DS
 * never hovers a selected item. A `className`, so `shared/ui/navbar.tsx` stays the DS port.
 */
const RAIL_SELECTED =
    'data-[state=selected]:bg-transparent data-[state=selected]:text-(--text-brand)'

/**
 * **48px rows** instead of the DS item's 56: the rail's icons are 24, and 16px of padding on every
 * side made each row a large empty tile that the selection indicator then had to fill — the column
 * read as a stack of buttons rather than a strip of icons. 44 was tried and was too tight against
 * the 48px logo above it; 48 (12 around the glyph) matches the logo and keeps a generous pointer
 * target.
 *
 * The DS badge dot is pinned 14px in from the corner for the 56 box; 10 puts it back on the glyph's
 * shoulder in this one. Everything that measures a row — the indicator, the rules — moves with it,
 * so they say `48` too; the `+` keeps its 44px tile, centred in the row, the tab bar's size. The rail
 * itself stays 88 wide, so nothing outside it moves.
 */
const RAIL_ITEM = cn(
    'size-12 p-3',
    // The dot sits **on** the glyph's top-trailing corner (12 in = the glyph's own edge), not
    // half outside it, with a 2px cut-out in the rail's surface so it stays its own shape over
    // the strokes it now overlaps — the bell's and the tab bar's dots read the same way.
    '[&_[data-slot=navbar-item-badge]]:end-3 [&_[data-slot=navbar-item-badge]]:top-3',
    '[&_[data-slot=navbar-item-badge]]:ring-2 [&_[data-slot=navbar-item-badge]]:ring-(--background-surface)',
    RAIL_SELECTED,
)

/**
 * **Off for now** — the rail draws no background behind a selected entry: neither the sliding
 * indicator in the nav group nor the tile behind an open drawer toggle. Selection is carried by the
 * glyph alone (outline → filled, in `--text-brand`, with its glow), which reads cleaner in
 * a column this narrow. Both pieces are kept, and turning this back on restores them exactly — the
 * mobile tab bar keeps its indicator either way.
 */
const SHOW_RAIL_TINT = false

/** The app's arrival curve — the language chevron turns on it, as the "+" does. */
const TOGGLE_EASE = 'ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'

/**
 * The brand tint a drawer toggle wears while its drawer is showing — the nav indicator's paint,
 * grown in place on the glyph spring instead of slid there (these two are not part of the nav
 * group's single selection, so nothing travels between them).
 */
function ToggleTint({ on }: { on: boolean }) {
    if (!SHOW_RAIL_TINT) return null
    return (
        <span
            aria-hidden
            className={cn(
                'pointer-events-none absolute inset-0 rounded-xl transition-[opacity,scale] duration-[380ms]',
                NAV_TINT,
                NAV_SPRING,
                on ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
            )}
        />
    )
}

export function AppNavbar() {
    const { t, currentLanguage } = useTranslation()
    const { open: menuOpen, toggle: toggleMenu, close: closeMenu, view, openAt } = useMenu()
    const pathname = usePathname()
    const { myChannel } = useMyChannel()
    const avatar = useAvatarSource()

    /**
     * Figma's Notifications entry is Type=Badge, and the dot means unread. It was pinned to
     * `false` for as long as there was no unread source — a dot that is always on is decoration
     * pretending to be state — and `features/notification` is that source.
     *
     * `useUnreadInbox` is one small query, gated on a real account and kept live by the
     * `inbox_change` socket event rather than by polling. For a guest it never runs, so the bell
     * renders bare and leads to the page's own sign-in prompt.
     */
    const { hasUnread } = useUnreadInbox()
    /*
     * Conversations with something unread — live on every page (`features/message/shell`), so the
     * Chat entry carries the same dot the bell does instead of staying silent until the reader opens
     * Messages to find out.
     */
    const unreadChats = useLiveUnreadConversations()
    /*
     * The language button shows **which** language, as Figma's desktop rail draws it (`EN ▾`): the
     * primary subtag, upper-cased — `zh-CN` and `zh-TW` both read `ZH`, and the drawer the press opens
     * names the variant in full.
     */
    const languageCode = currentLanguage.split('-')[0].toUpperCase()

    /** Named once: it decides the entry's ground *and* the glyph's weight, and the two must not
     *  be able to disagree. */
    const onNotification = pathname === NOTIFICATION_PATH
    const onHome = pathname === '/'
    const onFollowing = pathname === '/following'
    const onChat = isMessagesPath(pathname)
    const onSearch = pathname === SEARCH_PATH
    // Your **own** space only — `isOwnSpacePath` says why `startsWith('/@')` was wrong.
    const onProfile = isOwnSpacePath(pathname, myChannel ? toChannelPath(myChannel.slug) : null)
    /*
     * Rows of the nav group, top to bottom: Home 0 · Following 1 · Chat 2 · Create 3 (never
     * current) · Search 4 · Notifications 5 · Profile 6. The indicator slides to the row; the rail
     * answers the press the way the tab bar does (`usePressedDestination`), and `aria-current`
     * stays on the route.
     */
    const routeRow = onHome
        ? 0
        : onFollowing
          ? 1
          : onChat
            ? 2
            : onSearch
              ? 4
              : onNotification
                ? 5
                : onProfile
                  ? 6
                  : -1
    const { current, press } = usePressedDestination(routeRow)

    /** The drawer is open *and* standing on the Language screen. */
    const languageOpen = menuOpen && view === 'language'

    return (
        /*
         * Every entry is icon-only, so each carries a tooltip with its name — on hover and on
         * keyboard focus, beside the rail. One provider for the column: once a label is showing,
         * moving to the next row shows its label at once. The `+` has none: it is already a menu
         * trigger, and its glyph and the menu it opens say what it does.
         */
        <TooltipProvider>
            {/**
             * The comp gives the rail a `border-right: 1px solid --separator-default` to
             * separate it from the page. Painted as an inset shadow, not a border: the
             * rail is 88 border-box with 16 of padding, so a real 1px border would leave
             * a 55px content box for 56px items and knock every glyph half a pixel off
             * centre. Mirrored for RTL, where the rail sits on the right.
             */}
            <Navbar
                aria-label={t('nav_main')}
                data-testid="navigation-navbar"
                className="shadow-[inset_-1px_0_0_var(--separator-default)] rtl:shadow-[inset_1px_0_0_var(--separator-default)]"
            >
                <NavbarGroup group="brand">
                    <Logo size={48} title={null} />
                    <NavbarRule className="w-12" />
                </NavbarGroup>

                {/*
                 * 12 between rows, not the DS group's 8: at 48px rows, 8 packed the icons into a
                 * tight stack floating in the rail's empty height. The indicator's step is the same
                 * number — `100% + 12px` below — and must move with it.
                 */}
                <NavbarGroup group="nav" className="relative gap-3">
                    {/*
                     * The tab bar's indicator, turned on its side: one 48px rounded square behind the
                     * current row, moved by `translate` (composited) one row at a time — 48 + the
                     * group's 12px gap, i.e. `100% + 12px` of itself. Painted first, so every item, being
                     * `relative` and later in the DOM, sits above it.
                     */}
                    {SHOW_RAIL_TINT && (
                        <span
                            aria-hidden
                            style={{ '--row': Math.max(current, 0) } as CSSProperties}
                            className={cn(
                                NAV_INDICATOR,
                                'start-0 top-0 size-12 rounded-xl',
                                '[translate:0_calc(var(--row)*(100%_+_12px))]',
                                'transition-[translate,opacity]',
                                NAV_SLIDE,
                                current < 0 && 'opacity-0',
                            )}
                        />
                    )}
                    <Tooltip label={t('nav_home')}>
                        <NavbarItem
                            href="/"
                            selected={current === 0}
                            aria-current={onHome ? 'page' : undefined}
                            onClick={press(0)}
                            className={RAIL_ITEM}
                            aria-label={t('nav_home')}
                            data-testid="navigation-navbar-home"
                        >
                            {/* `house` filled when selected — the Navbar (Web) comp's `State=Selected`.
                            The mobile tab bar's `house-heart` duotone is that component's own
                            drawing, not this one's. */}
                            <NavGlyph
                                selected={current === 0}
                                idle={<Icon name="house" size={24} />}
                                active={<Icon name="house" weight="filled" size={24} />}
                            />
                        </NavbarItem>
                    </Tooltip>
                    {/* A real link, like Home and Profile: `/following` is not a gated route — it
                    renders a sign-in prompt for an anonymous visitor — and it needs no slug, so
                    there is nothing to resolve before the rail can point at it. */}
                    <Tooltip label={t('nav_following')}>
                        <NavbarItem
                            href="/following"
                            selected={current === 1}
                            aria-current={onFollowing ? 'page' : undefined}
                            onClick={press(1)}
                            className={RAIL_ITEM}
                            aria-label={t('nav_following')}
                            data-testid="navigation-navbar-following"
                        >
                            <NavGlyph
                                selected={current === 1}
                                idle={<Icon name="user-heart-alt" size={24} />}
                                active={<Icon name="user-heart-alt" weight="filled" size={24} />}
                            />
                        </NavbarItem>
                    </Tooltip>
                    {/* A real link, like Following: `/messages` renders its own sign-in prompt. Lit
                    inside a conversation too. Selected is the filled weight, per the Navbar (Web)
                    comp (`State=Selected` instantiates `Style=Filled`), like Following and the bell. */}
                    <Tooltip label={t('nav_chat')}>
                        <NavbarItem
                            type={unreadChats > 0 ? 'badge' : 'icon'}
                            href={MESSAGES_PATH}
                            selected={current === 2}
                            aria-current={onChat ? 'page' : undefined}
                            onClick={press(2)}
                            className={RAIL_ITEM}
                            aria-label={t('nav_chat')}
                            data-testid="navigation-navbar-chat"
                        >
                            <NavGlyph
                                selected={current === 2}
                                idle={<Icon name="comment-dots" size={24} />}
                                active={<Icon name="comment-dots" weight="filled" size={24} />}
                            />
                        </NavbarItem>
                    </Tooltip>
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
                    <Tooltip label={t('nav_search')}>
                        <NavbarItem
                            href={SEARCH_PATH}
                            selected={current === 4}
                            aria-current={onSearch ? 'page' : undefined}
                            onClick={press(4)}
                            className={RAIL_ITEM}
                            aria-label={t('nav_search')}
                            data-testid="navigation-navbar-search"
                        >
                            {/* Filled when selected, per the Navbar (Web) comp. The glass had no filled
                            weight until the 2026-10-08 library import, so it changed colour only. */}
                            <NavGlyph
                                selected={current === 4}
                                idle={<Icon name="search" size={24} />}
                                active={<Icon name="search" weight="filled" size={24} />}
                            />
                        </NavbarItem>
                    </Tooltip>
                    {/*
                     * A real link, and **not** gated.
                     * `/notification` renders its own signed-out prompt (which raises the same login
                     * dialog from a button the reader can read a sentence next to), so gating the rail
                     * entry would put a modal in front of a screen that explains itself — the pattern
                     * `/my-space` already follows.
                     */}
                    <Tooltip label={t('nav_notifications')}>
                        <NavbarItem
                            type={hasUnread ? 'badge' : 'icon'}
                            href={NOTIFICATION_PATH}
                            selected={current === 5}
                            aria-current={onNotification ? 'page' : undefined}
                            onClick={press(5)}
                            className={RAIL_ITEM}
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
                             * Following and Chat took the tab bar's duotone-at-full-tint until the
                             * 2026-10-08 library import, because `user-heart-alt` and `comment-dots` had
                             * no filled weight; they are filled now too, which is what the Navbar (Web)
                             * comp's `State=Selected` draws.
                             */}
                            <NavGlyph
                                selected={current === 5}
                                idle={<Icon name="bell" size={24} />}
                                active={<Icon name="bell" weight="filled" size={24} />}
                            />
                        </NavbarItem>
                    </Tooltip>
                    {/*
                     * A real link, like the tab bar's. `/my-space` is not a gated route — it renders a
                     * prompt for an anonymous visitor — and it needs no slug, so there is nothing to
                     * resolve before the rail can point at it.
                     */}
                    <Tooltip label={t('nav_profile')}>
                        <NavbarItem
                            type="avatar"
                            href="/my-space"
                            selected={current === 6}
                            aria-current={onProfile ? 'page' : undefined}
                            onClick={press(6)}
                            aria-label={t('nav_profile')}
                            data-testid="navigation-navbar-profile"
                            /*
                             * Premium hangs its crown outside the 24px circle, which the DS item clips —
                             * lifted here rather than in `shared/ui`. The selected ring is dropped too: it
                             * is drawn *inside* the circle and would paint over the gold; the item's own
                             * selected ground still says where you are.
                             */
                            className={cn(
                                RAIL_ITEM,
                                // The selected ring in brand, as on the tab bar's avatar.
                                '[&_[data-slot=navbar-item-avatar]]:after:shadow-[inset_0_0_0_1.5px_var(--text-brand)]',
                                avatar.isPremium &&
                                    '[&_[data-slot=navbar-item-avatar]]:overflow-visible [&_[data-slot=navbar-item-avatar]]:after:hidden',
                            )}
                        >
                            {/* Animated for a Premium creator — same component the tab bar uses. */}
                            {avatar.isPremium ? (
                                <PremiumAvatarFrame badgeSize={12}>
                                    <AnimatedAvatar
                                        {...avatar}
                                        alt=""
                                        size="xs"
                                        className="size-[20px]"
                                    />
                                </PremiumAvatarFrame>
                            ) : (
                                <AnimatedAvatar {...avatar} alt="" size="xs" />
                            )}
                        </NavbarItem>
                    </Tooltip>
                </NavbarGroup>

                <NavbarGroup group="bottom" className="gap-3">
                    <NavbarRule className="w-12" />
                    {/*
                     * The two drawer toggles, in the nav group's selection language: when the
                     * drawer they open is showing, the brand tint grows in behind them on the
                     * glyph's spring and the ink turns `--text-brand` — not the DS item's grey,
                     * which now only ever means hover. `aria-current` is dropped: the DS item sets
                     * it from `selected`, but these are toggles, and `aria-expanded` is what says
                     * their state.
                     */}
                    <Tooltip label={t('nav_menu')}>
                        <NavbarItem
                            aria-label={t('nav_menu')}
                            data-testid="navigation-navbar-menu"
                            aria-expanded={menuOpen}
                            aria-controls="app-menu-drawer"
                            aria-current={false}
                            selected={menuOpen && !languageOpen}
                            onClick={toggleMenu}
                            className={RAIL_ITEM}
                        >
                            <ToggleTint on={menuOpen && !languageOpen} />
                            {/*
                             * The glyph stays ☰ — open, it only takes the brand ink
                             * (`RAIL_ITEM`'s selected colour, on the DS item's own colour
                             * transition). The drawer has its own close control; this entry does
                             * not need to become one.
                             */}
                            <Icon name="menu-bars" size={24} />
                        </NavbarItem>
                    </Tooltip>
                    {/*
                     * A shortcut into the drawer's Language screen, not a switcher of its own —
                     * one list of languages, one place it lives. `aria-expanded` reports the
                     * drawer (which is what this controls, open at whatever screen), while
                     * `selected` marks only the case where that screen is the one showing.
                     * Pressing it again while it *is* showing closes the drawer, the way the
                     * Menu entry above toggles.
                     */}
                    <Tooltip label={t('nav_language')}>
                        <NavbarItem
                            aria-label={t('nav_language')}
                            data-testid="navigation-navbar-language"
                            aria-expanded={menuOpen}
                            aria-controls="app-menu-drawer"
                            aria-current={false}
                            selected={languageOpen}
                            onClick={() => (languageOpen ? closeMenu() : openAt('language'))}
                            className={cn(RAIL_ITEM, 'p-0')}
                        >
                            <ToggleTint on={languageOpen} />
                            {/*
                             * A **chip**, so it reads as a control and not a stray label: the code
                             * in a hairline frame, with a chevron that turns up while the Language
                             * screen is open — when the frame hands over to the tile behind it. A new language **rises in** — the code is keyed on
                             * itself, so `RISE` replays on a switch and nowhere else.
                             */}
                            <span
                                className={cn(
                                    'type-caption-label-strong relative flex h-7 items-center gap-px rounded-lg ps-1.5 pe-0.5 tabular-nums',
                                    'shadow-[inset_0_0_0_1px_var(--separator-default)] transition-[box-shadow] duration-200',
                                    /*
                                     * Open: with the rail's tint on, the chip **gives up its frame**
                                     * to the brand tile behind it (one active shape, not a framed
                                     * chip in a framed tile); with it off, the frame itself turns
                                     * brand, since nothing else would say the screen is open.
                                     */
                                    languageOpen &&
                                        (SHOW_RAIL_TINT
                                            ? 'shadow-[inset_0_0_0_1px_transparent]'
                                            : 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text-brand)_45%,transparent)]'),
                                )}
                            >
                                <span key={languageCode} className={RISE}>
                                    {languageCode}
                                </span>
                                <Icon
                                    name="angle-down"
                                    size={16}
                                    className={cn(
                                        'transition-[rotate] duration-240',
                                        TOGGLE_EASE,
                                        languageOpen && 'rotate-180',
                                    )}
                                />
                            </span>
                        </NavbarItem>
                    </Tooltip>
                </NavbarGroup>
            </Navbar>
        </TooltipProvider>
    )
}
