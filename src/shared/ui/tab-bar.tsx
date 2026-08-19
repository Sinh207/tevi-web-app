'use client'

import { cn } from '@shared/lib/utils'
import Link from 'next/link'
import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'
import { Icon } from './icon'

/**
 * Tab Bar — four Figma nodes, 7 variants, ported 1:1:
 *
 *   Tab Bar              159:4989   1v  the assembled bar
 *   Tab Bar/Item         122:28626  2v  Selected=No/Yes
 *   Tab Bar/Profile Item 122:28683  2v  Selected=No/Yes
 *   Tab Bar/FAB Item     122:28652  2v  Selected=No/Yes (pixel-identical)
 *
 * The bar is a fixed composition, not a slot: Home · Following · video FAB · Messages ·
 * My Space, in that order, with the first four sharing the width equally (82.5 at the
 * authored 402) and My Space pinned at 72. 4 × 82.5 + 72 = 402.
 *
 * Every item is 48 tall, pad 4/8 (Spacing 1 / Spacing 2), gap 2 — a raw 2, no spacing
 * variable is bound to it and the scale has no 2 step. Content (24 glyph + 2 + 15 label
 * = 41) is 1px taller than the 40px content box, so both Figma and `justify-center`
 * overflow it symmetrically; that is why the height is pinned rather than hugged.
 *
 * Colour is one pair everywhere: Text - Body unselected, Button - Accent BG selected,
 * applied to glyph and label together.
 *
 * ── engine notes ──────────────────────────────────────────────────────────────────
 * The bar's top hairline is a 0.5px INSIDE stroke and the profile rings are 1px / 1.5px
 * INSIDE strokes. None grow their frame in Figma, a CSS border would, and Chrome floors
 * 1.5px to 1px — so all three are `inset` box-shadows. Chromium still snaps the 0.5px
 * hairline up to ~1 device px at DPR 1.
 *
 * Figma applies a raw BACKGROUND_BLUR of 20 to the bar — not an effect style, and not
 * equal to any of --blur-sm/md/lg (16/24/32). The literal is used rather than rounded.
 *
 * ── deviation from the DS markup ──────────────────────────────────────────────────
 * The DS preview marks the bar up as `role="tablist"` with `role="tab"` children, which
 * is how the mobile app models it. Here the entries navigate between routes, so this is
 * navigation: a `<nav>` of links using `aria-current="page"`. `role="tab"` without a
 * tabpanel would promise a widget that does not exist. Everything visual is unchanged.
 */

const ITEM_BASE =
    "m-0 flex h-[48px] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-[2px] rounded-none border-0 bg-transparent px-2 py-1 [-webkit-tap-highlight-color:transparent] [transition:color_120ms_ease] focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0"

/**
 * Figma drops the Duotone tint to full strength in the tab bar. The glyph arrives as a
 * `<use>` clone, so the tint lives behind `--tevi-icon-tint` — a custom property, the one
 * thing that inherits into a shadow tree (set up in `scripts/build-icon-sprite.mjs`).
 */
const ITEM_TINT = '[--tevi-icon-tint:1]'

/**
 * …and repaints the detail layer White on `house-heart` and `comment-dots`, where it reads
 * as a knockout. `user-heart-alt` keeps every path on one colour, so this is opt-in per
 * icon rather than global.
 */
const ITEM_KNOCKOUT = '[--tevi-icon-detail:var(--white)]'

const LABEL = 'type-micro-overline block max-w-full overflow-hidden text-ellipsis whitespace-nowrap'

export type TabBarItemProps = HTMLAttributes<HTMLElement> & {
    /** The 24px glyph. */
    icon: ReactNode
    label: string
    selected?: boolean
    /** Repaint the duotone detail layer White — `house-heart` and `comment-dots` only. */
    knockout?: boolean
    /** Navigate: renders an `<a>` via `next/link` instead of a `<button>`. */
    href?: string
    disabled?: boolean
}

/** Home · Following · Messages — a glyph over a Micro/Overline label. */
function TabBarItem({
    className,
    icon,
    label,
    selected,
    knockout,
    href,
    disabled,
    ...props
}: TabBarItemProps) {
    const shared = {
        'data-slot': 'tab-bar-item',
        'data-selected': selected ? ('true' as const) : undefined,
        'aria-current': selected ? ('page' as const) : undefined,
        className: cn(
            ITEM_BASE,
            ITEM_TINT,
            knockout && ITEM_KNOCKOUT,
            selected ? 'text-(--button-accent-bg)' : 'text-(--text-body)',
            className,
        ),
    }

    const content = (
        <>
            <span data-slot="tab-bar-item-icon" className="block flex-none">
                {icon}
            </span>
            <span className={LABEL}>{label}</span>
        </>
    )

    if (href && !disabled) {
        return (
            <Link href={href} {...shared} {...props}>
                {content}
            </Link>
        )
    }

    return (
        <button type="button" disabled={disabled} {...shared} {...props}>
            {content}
        </button>
    )
}

/** The hexagon, at its rendered bounds — 44×44 in Figma, 38.11 × 41.52 on screen. */
const FAB_HEX =
    'M15.0526 1.0718C17.5278-0.3573 20.5774-0.3573 23.0526 1.0718L34.1051 7.453C36.5803 8.8821 38.1051 11.5231 38.1051 14.3812L38.1051 27.1436C38.1051 30.0017 36.5803 32.6427 34.1051 34.0718L23.0526 40.453C20.5773 41.8821 17.5278 41.8821 15.0526 40.453L4 34.0718C1.5248 32.6427 0 30.0017 0 27.1436L0 14.3812C0 11.5231 1.5248 8.8821 4 7.453Z'

/** Figma stacks the same 25%-black fill eight times to reach the shipped darkness. */
const FAB_FILL_LAYERS = 8

export type TabBarFabProps = HTMLAttributes<HTMLElement> & {
    'aria-label': string
    href?: string
    disabled?: boolean
}

/**
 * The video FAB. Selected=Yes and Selected=No are pixel-identical in Figma — same hexagon,
 * same fills, same glyph — so nothing keys off selection here, and there is no label.
 */
function TabBarFab({ className, href, disabled, ...props }: TabBarFabProps) {
    const uid = useId()
    const ringId = `tab-bar-fab-ring-${uid}`
    const clipId = `tab-bar-fab-clip-${uid}`

    const shared = {
        'data-slot': 'tab-bar-fab',
        className: cn(
            ITEM_BASE,
            // Figma binds no variable to the ring gradient; both stops are literals in
            // the file, so they are literals here too rather than invented tokens.
            '[--tab-bar-fab-ring-from:#3e2eff] [--tab-bar-fab-ring-to:#ffd600]',
            className,
        ),
    }

    const content = (
        <span
            data-slot="tab-bar-fab-container"
            className="relative flex size-[38px] flex-none items-center justify-center rounded-[var(--radius-fill)] p-2"
        >
            <svg
                width="38.105118"
                height="41.524792"
                viewBox="0 0 38.105118 41.524792"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
                // `inset-0 m-auto` rather than a translate: the hexagon is taller than
                // its 38px box and auto margins centre the overflow symmetrically
                // without a transform that would not mirror under RTL.
                className="absolute inset-0 m-auto"
            >
                <defs>
                    <linearGradient
                        id={ringId}
                        gradientUnits="userSpaceOnUse"
                        x1="-2.947"
                        y1="-1.238"
                        x2="41.902"
                        y2="-0.354"
                    >
                        <stop offset="0" stopColor="var(--tab-bar-fab-ring-from)" />
                        <stop offset="1" stopColor="var(--tab-bar-fab-ring-to)" />
                    </linearGradient>
                    <clipPath id={clipId}>
                        <path d={FAB_HEX} />
                    </clipPath>
                </defs>
                {Array.from({ length: FAB_FILL_LAYERS }, (_, i) => (
                    <path key={i} d={FAB_HEX} fill="var(--opacity-black-25)" />
                ))}
                {/* The 2px ring is an INSIDE stroke — clipped by its own path. */}
                <path
                    d={FAB_HEX}
                    fill="none"
                    stroke={`url(#${ringId})`}
                    strokeWidth="2"
                    clipPath={`url(#${clipId})`}
                />
            </svg>
            <Icon
                name="video"
                weight="filled"
                size={22}
                className="relative text-(--white)"
                aria-hidden
            />
        </span>
    )

    if (href && !disabled) {
        return (
            <Link href={href} {...shared} {...props}>
                {content}
            </Link>
        )
    }

    return (
        <button type="button" disabled={disabled} {...shared} {...props}>
            {content}
        </button>
    )
}

export type TabBarProfileProps = HTMLAttributes<HTMLElement> & {
    label: string
    selected?: boolean
    href?: string
    disabled?: boolean
    /** The photo (or a placeholder glyph); the 22px circle is provided. */
    children?: ReactNode
}

/** My Space — the avatar item the bar pins at 72px while the others share the rest. */
function TabBarProfile({
    className,
    label,
    selected,
    href,
    disabled,
    children,
    ...props
}: TabBarProfileProps) {
    const shared = {
        'data-slot': 'tab-bar-profile',
        'data-selected': selected ? ('true' as const) : undefined,
        'aria-current': selected ? ('page' as const) : undefined,
        className: cn(
            ITEM_BASE,
            'w-[72px] flex-none',
            selected ? 'text-(--button-accent-bg)' : 'text-(--text-body)',
            className,
        ),
    }

    const content = (
        <>
            <span
                data-slot="tab-bar-profile-ring"
                className={cn(
                    'flex size-[24px] flex-none items-center justify-center rounded-[var(--radius-fill)] p-px',
                    selected && 'shadow-[inset_0_0_0_1px_var(--button-accent-bg)]',
                )}
            >
                <span
                    data-slot="tab-bar-profile-avatar"
                    className={cn(
                        'relative flex size-[22px] items-center justify-center overflow-hidden rounded-[var(--radius-fill)] bg-(--background-subtle) text-(--text-placeholder) [&>img]:block [&>img]:size-full [&>img]:object-cover',
                        // The photo would paint over an inset shadow on the same box, so
                        // the second ring sits on an overlay. 1.5px, which a border floors.
                        selected &&
                            "after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1.5px_var(--background)] after:content-['']",
                    )}
                >
                    {children}
                </span>
            </span>
            <span className={LABEL}>{label}</span>
        </>
    )

    if (href && !disabled) {
        return (
            <Link href={href} {...shared} {...props}>
                {content}
            </Link>
        )
    }

    return (
        <button type="button" disabled={disabled} {...shared} {...props}>
            {content}
        </button>
    )
}

/** The bar itself. Give it a full-width host; the 32px bottom pad is the home indicator. */
function TabBar({ className, children, ...props }: ComponentPropsWithoutRef<'nav'>) {
    return (
        <nav
            data-slot="tab-bar"
            className={cn(
                'flex w-full items-center gap-0 bg-(--background-tabbar) pt-1 pb-8 shadow-[inset_0_0.5px_0_var(--separator-default)] [-webkit-backdrop-filter:blur(20px)] [backdrop-filter:blur(20px)]',
                className,
            )}
            {...props}
        >
            {children}
        </nav>
    )
}

export { TabBar, TabBarFab, TabBarItem, TabBarProfile }
