'use client'

import { toChannelPath, useMyChannel } from '@features/channel'
import { isMessagesPath, MESSAGES_PATH } from '@features/message/routes'
import { useLiveUnreadConversations } from '@features/message/shell'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumAvatarFrame } from '@shared/components/premium-avatar-frame'
import { useTranslation } from '@shared/i18n/use-translation'
import { PING } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { useAvatarSource } from '../hooks/use-avatar-source'
import { usePressedDestination } from '../hooks/use-pressed-destination'
import { isOwnSpacePath } from '../lib/tab-destinations'
import { CreateTabBarFab } from './create-tab-bar-fab'
import { Knockout, NAV_INDICATOR, NAV_SLIDE, NAV_SPRING, NavGlyph } from './nav-glyph'

/**
 * The mobile app shell's bottom bar — Home · Following · Create · Messages · My Space, as a
 * **floating glass pill** (concept A from `/dev/tab-bar-concepts`, chosen over an edge-to-edge
 * refinement of the DS bar).
 *
 * ## What changed from the DS `Tab Bar`, and why it is composed here rather than edited there
 *
 * `shared/ui/tab-bar.tsx` is the DS port and only moves when the DS does, so this redesign is
 * composed in the feature from scratch and the primitive stays as Figma draws it (its harness is
 * still `/dev/tab-bar`). Five things differ, each against something the shipped bar did:
 *
 * 1. **Floating, inset 12px, frosted.** The feed visibly runs past the bar on both sides, which is
 *    most of why it reads lighter than a full-width slab — and the glass is the same treatment the
 *    top bar got (`AppTopBarDock`), so the two read as one shell.
 * 2. **64px, no fixed 32px pad.** The DS bar is 84 tall because it reserves a home indicator on
 *    every device; `TabBarShell` now lifts the pill by the real safe area instead.
 * 3. **Icons only.** No room for labels at 64px, and each glyph is the platform's convention for
 *    what it opens. The name is still there for assistive tech, as real text (`sr-only`) rather
 *    than `aria-label` — some screen readers read a link's `href` over its `aria-label`.
 * 4. **Selection by shape and a sliding tint**, not colour alone. The glyph cross-fades outline →
 *    duotone, the duotone springing in from half size; one tint travels to the selected tab on a
 *    spring with a little overshoot, moved by `translate` so it is composited; the avatar's ring
 *    grows out of the face. All of it starts on the **press**, not when the route lands (see
 *    `pressed` below), and all of it stands still under reduced motion.
 * 5. **Selection ink is `--text-brand`**, not the accent button fill. In Dark the accent
 *    (`#501bc0`) on a near-black bar was a glyph you had to look for; `--text-brand` lifts to
 *    `primary-600` there and is the accent in Light.
 *
 * Home's idle glyph is `house`, not `house-heart`: `house-heart`'s bare id is an alias of its
 * duotone (there is no outline drawing of it in the sprite), and `house` is what the DS's own
 * `Tab Bar/Item` set draws.
 *
 * ## Unchanged
 *
 * All four destinations are real links (middle-click, prefetch, copy-link); the centre opens the
 * Create list (`CreateTabBarFab`). My Space is selected inside your **own** space too (`/@you`, and
 * its pages), so tapping through to it keeps the tab lit — and only there: somebody else's space
 * lights nothing (`isOwnSpacePath`). The test ids are the ones the shipped bar published.
 */
export function AppTabBar() {
    const { t } = useTranslation()
    const pathname = usePathname()
    const { myChannel } = useMyChannel()
    const avatar = useAvatarSource()
    // Live on every page (`features/message/shell`): the Messages tab says so when something waits.
    const unreadChats = useLiveUnreadConversations()

    const home = pathname === '/'
    const following = pathname === '/following'
    const messages = isMessagesPath(pathname)
    // Your **own** space only — `isOwnSpacePath` says why `startsWith('/@')` was wrong.
    const mySpace = isOwnSpacePath(pathname, myChannel ? toChannelPath(myChannel.slug) : null)
    // Column of the route's destination; the centre (2) is Create, which is never "current".
    const routeColumn = home ? 0 : following ? 1 : messages ? 3 : mySpace ? 4 : -1

    /*
     * **The bar answers the press, not the navigation** — `usePressedDestination` draws the pressed
     * column at once and hands back to the route when it lands. `aria-current` stays on the route.
     */
    const { current, press } = usePressedDestination(routeColumn)

    return (
        <nav
            data-testid="navigation-tab-bar"
            aria-label={t('nav_main')}
            className="relative grid h-16 grid-cols-5 items-center rounded-full bg-(--background-surface)/80 shadow-lg ring-1 ring-(--separator-default) backdrop-blur-(--blur-md) backdrop-saturate-150"
        >
            {/*
             * The tint behind the current tab — **moved with `translate`**, not `inset-inline-start`:
             * a transform is composited, so the slide never asks for a layout and stays smooth while
             * the next route renders underneath. One column is the pill's own width plus the 8px
             * between pills, so `--tab × (100% + 8px)`, negated under RTL where columns run the
             * other way. A spring curve with a little overshoot, so it lands rather than stops.
             * Faded out, not unmounted, when no destination is current, so it can fade back in.
             */}
            <span
                aria-hidden
                style={{ '--tab': Math.max(current, 0), width: 'calc(20% - 8px)' } as CSSProperties}
                className={cn(
                    NAV_INDICATOR,
                    'inset-y-1.5 start-1 rounded-full',
                    '[translate:calc(var(--tab)*(100%_+_8px))_0] rtl:[translate:calc(var(--tab)*(-100%_-_8px))_0]',
                    'transition-[translate,opacity]',
                    NAV_SLIDE,
                    current < 0 && 'opacity-0',
                )}
            />

            <TabLink
                testId="navigation-tab-bar-home"
                href="/"
                label={t('nav_home')}
                selected={current === 0}
                current={home}
                onPress={press(0)}
                idle={<Icon name="house" size={24} />}
                active={
                    <Knockout>
                        <Icon name="house-heart" weight="duotone" size={24} />
                    </Knockout>
                }
            />
            {/*
             * A real `href`, like Home and My Space — and that is not a hole in "gate the action,
             * never the route": `/following` renders a sign-in prompt for an anonymous visitor.
             */}
            <TabLink
                testId="navigation-tab-bar-following"
                href="/following"
                label={t('nav_following')}
                selected={current === 1}
                current={following}
                onPress={press(1)}
                idle={<Icon name="user-heart-alt" size={24} />}
                active={<Icon name="user-heart-alt" weight="duotone" size={24} />}
            />
            {/* The "+", the Create list it opens and the app prompt behind its event row. */}
            <CreateTabBarFab />
            {/* Lit inside a conversation too (`/@{slug}/messages`), which is still this tab. */}
            <TabLink
                testId="navigation-tab-bar-messages"
                href={MESSAGES_PATH}
                label={t('nav_messages')}
                selected={current === 3}
                current={messages}
                onPress={press(3)}
                unread={unreadChats}
                idle={<Icon name="comment-dots" size={24} />}
                active={
                    <Knockout>
                        <Icon name="comment-dots" weight="duotone" size={24} />
                    </Knockout>
                }
            />
            {/*
             * Not gated either: `/my-space` renders a sign-in prompt for a visitor and a create-space
             * prompt for an account with no channel, and it needs no slug, so there is nothing to
             * wait for.
             */}
            <TabLink
                testId="navigation-tab-bar-my-space"
                href="/my-space"
                label={t('nav_my_space')}
                selected={current === 4}
                current={mySpace}
                onPress={press(4)}
                glyph={<ProfileGlyph avatar={avatar} selected={current === 4} />}
            />
        </nav>
    )
}

function TabLink({
    testId,
    href,
    label,
    selected,
    current,
    onPress,
    idle,
    active,
    glyph,
    unread = 0,
}: {
    testId: string
    href: string
    label: string
    /** Drawn as selected — the pressed tab, or the route's. */
    selected: boolean
    /** The route really is this destination — what `aria-current` says. */
    current: boolean
    onPress: (event: MouseEvent) => void
    /** Unread items behind this tab — a dot on the glyph's shoulder while above zero. */
    unread?: number
    /** Two drawings that cross-fade on selection (outline → duotone)… */
    idle?: ReactNode
    active?: ReactNode
    /** …or one that carries its own selected state (the avatar). */
    glyph?: ReactNode
}) {
    return (
        <Link
            data-testid={testId}
            data-selected={selected || undefined}
            href={href}
            aria-current={current ? 'page' : undefined}
            onClick={onPress}
            className={cn(
                'relative flex h-full items-center justify-center rounded-full outline-none',
                'transition-[scale,color] duration-200 active:scale-[0.88] motion-reduce:transition-none',
                'focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-(--focus-ring)',
                selected ? 'text-(--text-brand)' : 'text-(--text-body)',
            )}
        >
            {glyph ? (
                <span aria-hidden className="flex">
                    {glyph}
                </span>
            ) : (
                <span className="relative flex">
                    <NavGlyph selected={selected} idle={idle} active={active} />
                    {unread > 0 && <UnreadDot count={unread} />}
                </span>
            )}
            <span className="sr-only">{label}</span>
        </Link>
    )
}

/**
 * The unread mark on a tab's glyph — the top bar's bell language at tab size: `--badge-bg` lit from
 * above, a 2px cut-out in the bar's surface so it stays its own shape over both glyph drawings, and
 * a single `PING` ripple keyed on the count, so a new message announces itself once and never loops.
 * A dot rather than a number: five 24px glyphs in a 64px pill have no room for digits, and the
 * screen it opens says how many.
 */
function UnreadDot({ count }: { count: number }) {
    return (
        <span aria-hidden className="pointer-events-none absolute end-0 top-0 flex size-2.5">
            <span
                key={count}
                className={cn('absolute inset-0 rounded-full bg-(--badge-bg)', PING)}
            />
            <span className="relative size-2.5 rounded-full bg-[linear-gradient(180deg,color-mix(in_srgb,var(--badge-bg)_78%,var(--white)),var(--badge-bg))] ring-2 ring-(--background-surface)" />
        </span>
    )
}

/**
 * The account's face — and on selection the brand ring around it, cut out of the bar by a 2px gap.
 * A Premium creator's crown overflows the circle, so it keeps the frame the DS profile item used.
 */
function ProfileGlyph({
    avatar,
    selected,
}: {
    avatar: ReturnType<typeof useAvatarSource>
    selected: boolean
}) {
    return (
        <span
            className={cn(
                'flex rounded-full transition-[box-shadow,scale] duration-[380ms]',
                NAV_SPRING,
                // The ring grows out from the face (0 → 2px gap + 2px ring) as the face lifts.
                selected
                    ? 'scale-110 shadow-[0_0_0_2px_var(--background-surface),0_0_0_4px_var(--text-brand)]'
                    : 'scale-100 shadow-[0_0_0_0_var(--background-surface),0_0_0_0_var(--text-brand)]',
            )}
        >
            {avatar.isPremium ? (
                <PremiumAvatarFrame badgeSize={11}>
                    <AnimatedAvatar {...avatar} alt="" size="xs" className="size-[22px]" />
                </PremiumAvatarFrame>
            ) : (
                <AnimatedAvatar {...avatar} alt="" size="xs" />
            )}
        </span>
    )
}
