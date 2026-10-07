'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { TabBar, TabBarFab, TabBarItem, TabBarProfile } from '@shared/ui/tab-bar'
import Image from 'next/image'
import { useTheme } from 'next-themes'
import { type ReactNode, useEffect, useState } from 'react'

type Concept = 'current' | 'floating' | 'edge'
type TabId = 'home' | 'following' | 'messages' | 'me'

const CONCEPTS: { id: Concept; label: string; note: string }[] = [
    {
        id: 'current',
        label: 'Hiện tại',
        note: 'DS Tab Bar as shipped: 84px tall with a fixed 32px bottom pad, colour-only selection, the video hexagon in the middle.',
    },
    {
        id: 'floating',
        label: 'A · Nổi',
        note: 'A frosted pill inset 12px from the edges, icons only, a tint that slides to the active tab, outline → duotone on selection, a round “+” to create.',
    },
    {
        id: 'edge',
        label: 'B · Liền mép',
        note: 'Edge to edge, frosted, a dissolving top edge instead of a hairline, an indicator pill behind the active icon, labels kept, pad from the safe area only.',
    },
]

/**
 * Selection ink is `--text-brand`, not the accent button fill: in Dark the accent (`#501bc0`) on a
 * near-black bar is a glyph you have to look for, which is what the shipped bar does today.
 * `--text-brand` lifts to `primary-600` in Dark and is the accent in Light.
 */

/** The arrival curve every shell motion uses (`shared/lib/motion.ts`). */
const SLIDE = 'duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'

/** Columns in order — `create` is a slot, not a destination, so it is never selected. */
const COLUMNS = ['home', 'following', 'create', 'messages', 'me'] as const

const AVATAR = '/illustrations/channel/not-found.webp'

export function TabBarConceptsPreview() {
    const [concept, setConcept] = useState<Concept>('floating')
    const [active, setActive] = useState<TabId>('home')
    const [homeIndicator, setHomeIndicator] = useState(true)
    const { resolvedTheme, setTheme } = useTheme()
    // The theme is unknown on the server; reading it during the first render is a hydration mismatch.
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const dark = mounted && resolvedTheme === 'dark'
    const safe = homeIndicator ? 34 : 0
    const note = CONCEPTS.find(c => c.id === concept)?.note

    return (
        <main className="mx-auto flex w-full max-w-[440px] flex-col gap-4 px-4 py-6">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-t2-semibold text-(--text-title)">Tab bar concepts</h1>
                <p className="type-caption-meta text-(--text-body)">
                    Scroll the feed inside the frame; press the tabs.
                </p>
            </header>

            <div className="flex flex-wrap gap-2">
                {CONCEPTS.map(c => (
                    <Chip key={c.id} on={concept === c.id} onClick={() => setConcept(c.id)}>
                        {c.label}
                    </Chip>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
                <Chip on={dark} onClick={() => setTheme(dark ? 'light' : 'dark')}>
                    {dark ? 'Dark' : 'Light'}
                </Chip>
                <Chip on={homeIndicator} onClick={() => setHomeIndicator(v => !v)}>
                    iPhone home indicator
                </Chip>
            </div>
            <p className="type-caption-meta min-h-9 text-(--text-body)">{note}</p>

            {/* The phone. A scroller of its own, so the bars can sit `absolute` over it. */}
            <div className="relative h-[760px] w-full overflow-hidden rounded-[40px] bg-(--background) shadow-xl ring-8 ring-(--background-segment)">
                <div className="absolute inset-0 overflow-y-auto overscroll-contain [scrollbar-width:none]">
                    <div className="sticky top-0 z-20">
                        <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 top-0 -bottom-4 bg-(--background-surface)/72 backdrop-blur-(--blur-sm) backdrop-saturate-150 [mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)]"
                        />
                        {/* A static stand-in: the real `AppTopBar` needs the shell's `MenuProvider`. */}
                        <div className="relative flex h-[60px] items-center justify-between px-4 text-(--text-title)">
                            <Icon name="menu-bars" size={22} />
                            <span className="type-body-strong">Home</span>
                            <Icon name="bell" size={22} />
                        </div>
                    </div>
                    <FakeFeed />
                    <div aria-hidden style={{ height: 120 + safe }} />
                </div>

                {concept === 'current' && (
                    <CurrentBar active={active} onSelect={setActive} safe={safe} />
                )}
                {concept === 'floating' && (
                    <FloatingBar active={active} onSelect={setActive} safe={safe} />
                )}
                {concept === 'edge' && <EdgeBar active={active} onSelect={setActive} safe={safe} />}

                {homeIndicator && (
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-2 z-30 mx-auto h-1 w-32 rounded-full bg-(--text-title)"
                    />
                )}
            </div>
        </main>
    )
}

type BarProps = { active: TabId; onSelect: (id: TabId) => void; safe: number }

/** What ships today — the DS composition, unmodified. */
function CurrentBar({ active, onSelect }: BarProps) {
    return (
        <div className="absolute inset-x-0 bottom-0 z-10">
            <TabBar aria-label="Main">
                <TabBarItem
                    selected={active === 'home'}
                    knockout
                    label="Home"
                    icon={<Icon name="house-heart" weight="duotone" size={24} />}
                    onClick={() => onSelect('home')}
                />
                <TabBarItem
                    selected={active === 'following'}
                    label="Following"
                    icon={<Icon name="user-heart-alt" weight="duotone" size={24} />}
                    onClick={() => onSelect('following')}
                />
                <TabBarFab aria-label="Create" />
                <TabBarItem
                    selected={active === 'messages'}
                    knockout
                    label="Messages"
                    icon={<Icon name="comment-dots" weight="duotone" size={24} />}
                    onClick={() => onSelect('messages')}
                />
                <TabBarProfile
                    selected={active === 'me'}
                    label="My Space"
                    onClick={() => onSelect('me')}
                >
                    <Avatar />
                </TabBarProfile>
            </TabBar>
        </div>
    )
}

/**
 * Concept A — a floating glass pill.
 *
 * Detached from the edges so the feed visibly runs past it, which is most of why it reads as
 * lighter than a full-width slab. Icons only — the 64px height has no room for labels, and every
 * one of these glyphs is the platform's convention for what it opens — with the name kept as the
 * accessible label. One tint slides between the four destinations; the glyph goes outline →
 * duotone accent on selection, so state is carried by shape as well as colour.
 */
function FloatingBar({ active, onSelect, safe }: BarProps) {
    const index = COLUMNS.indexOf(active)
    return (
        <nav
            aria-label="Main"
            className="absolute inset-x-3 z-10 grid h-16 grid-cols-5 items-center rounded-full bg-(--background-surface)/72 shadow-lg ring-1 ring-(--separator-default) backdrop-blur-(--blur-md) backdrop-saturate-150"
            style={{ bottom: 12 + safe }}
        >
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-y-1.5 rounded-full bg-(--text-brand)/14 transition-[inset-inline-start]',
                    SLIDE,
                )}
                style={{ width: 'calc(20% - 8px)', insetInlineStart: `calc(${index * 20}% + 4px)` }}
            />
            <FloatingTab
                label="Home"
                on={active === 'home'}
                onClick={() => onSelect('home')}
                idle={<Icon name="house" size={24} />}
                selected={<Icon name="house-heart" weight="duotone" size={24} />}
            />
            <FloatingTab
                label="Following"
                on={active === 'following'}
                onClick={() => onSelect('following')}
                idle={<Icon name="user-heart-alt" size={24} />}
                selected={<Icon name="user-heart-alt" weight="duotone" size={24} />}
            />
            <div className="flex justify-center">
                <button
                    type="button"
                    aria-label="Create"
                    className="flex size-11 items-center justify-center rounded-full bg-(--button-accent-bg) text-(--white) shadow-md transition-[scale] duration-150 active:scale-90 motion-reduce:transition-none"
                >
                    <Icon name="plus" size={24} />
                </button>
            </div>
            <FloatingTab
                label="Messages"
                on={active === 'messages'}
                onClick={() => onSelect('messages')}
                idle={<Icon name="comment-dots" size={24} />}
                selected={<Icon name="comment-dots" weight="duotone" size={24} />}
                badge
            />
            <FloatingTab
                label="My Space"
                on={active === 'me'}
                onClick={() => onSelect('me')}
                idle={<Avatar />}
                selected={<Avatar ring />}
            />
        </nav>
    )
}

function FloatingTab({
    label,
    on,
    onClick,
    idle,
    selected,
    badge,
}: {
    label: string
    on: boolean
    onClick: () => void
    idle: ReactNode
    selected: ReactNode
    badge?: boolean
}) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-current={on ? 'page' : undefined}
            onClick={onClick}
            className={cn(
                'relative flex h-full items-center justify-center transition-[scale,color] duration-150 active:scale-90 motion-reduce:transition-none',
                on ? 'text-(--text-brand)' : 'text-(--text-body)',
            )}
        >
            <span className="relative flex">
                {on ? selected : idle}
                {badge && <UnreadDot />}
            </span>
        </button>
    )
}

/**
 * Concept B — edge to edge, refined.
 *
 * Keeps the labels and the full-width bar people already know, and changes what makes the current
 * one heavy: the glass gets the top bar's dissolving edge instead of a hairline, the bottom pad is
 * the safe area rather than a fixed 32px, and selection is an indicator pill behind the icon
 * (scaling in from its centre) plus the outline → duotone switch.
 */
function EdgeBar({ active, onSelect, safe }: BarProps) {
    return (
        <div className="absolute inset-x-0 bottom-0 z-10">
            <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-4 bottom-0 bg-(--background-surface)/80 backdrop-blur-(--blur-md) backdrop-saturate-150 [mask-image:linear-gradient(to_top,black_calc(100%-16px),transparent)]"
            />
            <nav
                aria-label="Main"
                className="relative grid grid-cols-5 pt-2"
                style={{ paddingBottom: Math.max(8, safe) }}
            >
                <EdgeTab
                    label="Home"
                    on={active === 'home'}
                    onClick={() => onSelect('home')}
                    idle={<Icon name="house" size={24} />}
                    selected={<Icon name="house-heart" weight="duotone" size={24} />}
                />
                <EdgeTab
                    label="Following"
                    on={active === 'following'}
                    onClick={() => onSelect('following')}
                    idle={<Icon name="user-heart-alt" size={24} />}
                    selected={<Icon name="user-heart-alt" weight="duotone" size={24} />}
                />
                <div className="flex flex-col items-center gap-1">
                    <button
                        type="button"
                        aria-label="Create"
                        className="flex h-8 w-14 items-center justify-center rounded-full bg-(--button-accent-bg) text-(--white) shadow-sm transition-[scale] duration-150 active:scale-90 motion-reduce:transition-none"
                    >
                        <Icon name="plus" size={22} />
                    </button>
                    <span className="type-micro-overline text-(--text-body)">Create</span>
                </div>
                <EdgeTab
                    label="Messages"
                    on={active === 'messages'}
                    onClick={() => onSelect('messages')}
                    idle={<Icon name="comment-dots" size={24} />}
                    selected={<Icon name="comment-dots" weight="duotone" size={24} />}
                    badge
                />
                <EdgeTab
                    label="My Space"
                    on={active === 'me'}
                    onClick={() => onSelect('me')}
                    idle={<Avatar />}
                    selected={<Avatar ring />}
                />
            </nav>
        </div>
    )
}

function EdgeTab({
    label,
    on,
    onClick,
    idle,
    selected,
    badge,
}: {
    label: string
    on: boolean
    onClick: () => void
    idle: ReactNode
    selected: ReactNode
    badge?: boolean
}) {
    return (
        <button
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={onClick}
            className={cn(
                'group flex flex-col items-center gap-1 transition-[color] duration-150 motion-reduce:transition-none',
                on ? 'text-(--text-brand)' : 'text-(--text-body)',
            )}
        >
            <span className="relative flex h-8 w-14 items-center justify-center transition-[scale] duration-150 group-active:scale-90 motion-reduce:transition-none">
                <span
                    aria-hidden
                    className={cn(
                        'absolute inset-0 rounded-full bg-(--text-brand)/14 transition-[scale,opacity]',
                        SLIDE,
                        on ? 'scale-100 opacity-100' : 'scale-x-50 opacity-0',
                    )}
                />
                <span className="relative flex">
                    {on ? selected : idle}
                    {badge && <UnreadDot />}
                </span>
            </span>
            <span className={cn('type-micro-overline', on && 'font-semibold')}>{label}</span>
        </button>
    )
}

/** The unread mark — `--badge-bg`, cut out of the bar by a ring in the surface colour. */
function UnreadDot() {
    return (
        <span
            aria-hidden
            className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-(--badge-bg) ring-2 ring-(--background-surface)"
        />
    )
}

function Avatar({ ring = false }: { ring?: boolean }) {
    return (
        <span
            className={cn(
                'flex rounded-full transition-[box-shadow] duration-150',
                ring &&
                    'shadow-[0_0_0_2px_var(--background-surface),0_0_0_4px_var(--button-accent-bg)]',
            )}
        >
            <AnimatedAvatar size="xs" thumb={AVATAR} isPremium={false} alt="" initials="ME" />
        </span>
    )
}

function Chip({
    on,
    onClick,
    children,
}: {
    on: boolean
    onClick: () => void
    children: ReactNode
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn(
                'type-dense-emphasis h-9 rounded-full px-4 transition-colors',
                on
                    ? 'bg-(--button-accent-bg) text-(--white)'
                    : 'bg-(--background-segment) text-(--text-title)',
            )}
        >
            {children}
        </button>
    )
}

/** Enough scrolling content, with colour in it, for the glass to have something to blur. */
function FakeFeed() {
    const images = [
        '/illustrations/channel/invitation-banner.webp',
        '/illustrations/monetization/donation.webp',
        '/illustrations/channel/not-found.webp',
        '/illustrations/channel/invitation-banner.webp',
        '/illustrations/monetization/donation.webp',
    ]
    return (
        <div className="flex flex-col gap-px">
            {images.map((src, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static preview content.
                <article key={index} className="flex flex-col gap-3 bg-(--background-surface) p-4">
                    <div className="flex items-center gap-2">
                        <AnimatedAvatar size="medium" thumb={AVATAR} isPremium={false} alt="" />
                        <div className="flex flex-col">
                            <span className="type-dense-strong text-(--text-title)">
                                Creator {index + 1}
                            </span>
                            <span className="type-caption-meta text-(--text-placeholder)">
                                Oct 07, 2026 - 1{index}:20
                            </span>
                        </div>
                    </div>
                    <p className="type-dense-default text-(--text-title)">
                        A post with an image, so there is colour passing under the bars.
                    </p>
                    <div className="relative aspect-video overflow-hidden rounded-(--radius-lg)">
                        <Image src={src} alt="" fill sizes="400px" className="object-cover" />
                    </div>
                </article>
            ))}
        </div>
    )
}
