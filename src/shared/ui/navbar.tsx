import { cn } from '@shared/lib/utils'
import Link from 'next/link'
import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from 'react'

/**
 * Navbar (Web) — Figma 3626:26349 (the rail, 1 variant) + 3626:26304
 * (Navbar (Web)/Item, 20 variants = State × Type), ported 1:1.
 *
 * The item is one square: 56×56, radius XL, Spacing 4 on all four sides, a single
 * 24px glyph centred. 16 + 24 + 16 = 56 exactly, so the box is pinned rather than
 * hugged and the glyph never shifts between types.
 *
 * Two axes, painting from different ramps:
 *
 *   type=icon | badge | avatar   Button/Ghost       transparent → Ghost BG Hover
 *   type=accent                  Button/Secondary   Secondary BG + a 1px border
 *
 * `accent` keeps the Figma variant name. It is NOT painted from the Accent ramp —
 * the variant binds Button/Secondary throughout, so the create affordance reads as
 * a bordered square, not a purple one. Renaming the axis would break the mapping
 * back to Figma, so the name stays and this note carries the warning.
 *
 * Geometry notes: the accent border is a 1px INSIDE stroke and the selected-avatar
 * ring a 1.5px INSIDE stroke. Neither grows its frame in Figma, and Chrome floors a
 * 1.5px border to 1px — so both are `inset` box-shadows. Focus is the one OUTSIDE
 * stroke (2px), which is an `outline` and also stays off the box model.
 *
 * State comes from real CSS where a browser has one (`:hover`, `:focus-visible`,
 * `:disabled`). `state` pins the same paints so a gallery can show all twenty
 * variants at once; the forced and live forms resolve identically.
 *
 * The rail's nine entries are fixed, in this order:
 *   Home · Following · Chat · Create · Search · Notifications · Profile · Menu · Language
 */

export type NavbarItemType = 'icon' | 'badge' | 'avatar' | 'accent'

/** Pins a Figma variant. Omit it and the browser drives the same paints. */
export type NavbarItemState = 'default' | 'hover' | 'selected' | 'focus' | 'disabled'

const ITEM_BASE =
    'relative m-0 flex size-[56px] shrink-0 items-center justify-center rounded-xl border-0 p-4 [-webkit-tap-highlight-color:transparent] [transition:background-color_120ms_ease,color_120ms_ease] disabled:cursor-not-allowed data-[state=disabled]:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0'

/**
 * Focus is the only state that tints the glyph blue, and in Figma it wins over the
 * others — hence `!`: Tailwind orders `data-*` variants after `focus-visible`, so
 * without it a selected + focused item would keep the selected colour.
 */
const ITEM_FOCUS =
    'outline-offset-0 focus-visible:outline-2 focus-visible:outline-(--focus-ring) focus-visible:text-(--focus-ring)! data-[state=focus]:outline-2 data-[state=focus]:outline-(--focus-ring) data-[state=focus]:text-(--focus-ring)!'

/** Type=Icon / Badge / Avatar — the Ghost ramp. */
const ITEM_GHOST = [
    'bg-(--button-ghost-bg) text-(--icon-secondary)',
    '[&:hover:not(:disabled):not([data-state])]:bg-(--button-ghost-bg-hover) [&:hover:not(:disabled):not([data-state])]:text-(--text-subtitle)',
    'data-[state=hover]:bg-(--button-ghost-bg-hover) data-[state=hover]:text-(--text-subtitle)',
    'data-[state=selected]:bg-(--button-ghost-bg) data-[state=selected]:text-(--icon-default)',
    'disabled:bg-(--button-ghost-bg) disabled:text-(--icon-disabled)',
    'data-[state=disabled]:bg-(--button-ghost-bg) data-[state=disabled]:text-(--icon-disabled)',
].join(' ')

/** Type=Accent — the Secondary ramp. Figma swaps the border token on Selected. */
const ITEM_ACCENT = [
    'bg-(--button-secondary-bg) text-(--text-body) shadow-[inset_0_0_0_1px_var(--button-secondary-border)]',
    '[&:hover:not(:disabled):not([data-state])]:bg-(--button-secondary-bg-hover) [&:hover:not(:disabled):not([data-state])]:text-(--text-title)',
    'data-[state=hover]:bg-(--button-secondary-bg-hover) data-[state=hover]:text-(--text-title)',
    'data-[state=selected]:text-(--text-title) data-[state=selected]:shadow-[inset_0_0_0_1px_var(--text-body)]',
    'disabled:bg-(--button-secondary-bg-disabled) disabled:text-(--button-secondary-text-disabled)',
    'data-[state=disabled]:bg-(--button-secondary-bg-disabled) data-[state=disabled]:text-(--button-secondary-text-disabled)',
].join(' ')

const AVATAR_BASE =
    'relative flex size-[24px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-fill)] bg-(--background-subtle) text-(--text-placeholder) [&>img]:block [&>img]:size-full [&>img]:object-cover'

/**
 * The photo would paint over an inset shadow on the same box, so the selected ring
 * sits on an overlay.
 */
const AVATAR_RING =
    "after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1.5px_var(--text-title)] after:content-['']"

/**
 * `Badge/Notification Type=Dot, Size=Medium` — 8px, pinned by Figma at 34,14 inside
 * the 56 box, i.e. hard against the glyph's top-right corner rather than the item's.
 * 56 − 34 − 8 = 14, expressed from the inline end so it mirrors under RTL.
 */
const BADGE_DOT =
    'pointer-events-none absolute top-[14px] end-[14px] size-[8px] rounded-[var(--radius-fill)] bg-(--badge-bg)'

/**
 * `type` is the Figma axis, not the native button attribute — every item is
 * `type="button"` anyway, so the name goes to the DS variant.
 */
export type NavbarItemProps = HTMLAttributes<HTMLElement> & {
    type?: NavbarItemType
    /** Shorthand for `state="selected"` — also sets `aria-current="page"`. */
    selected?: boolean
    state?: NavbarItemState
    /** Navigate: renders an `<a>` via `next/link` instead of a `<button>`. */
    href?: string
    disabled?: boolean
}

/**
 * One 56×56 square in the rail. Pass a single 24px glyph as children:
 *
 *   <NavbarItem href="/" selected aria-label="Home"><Icon name="house" weight="filled" size={24} /></NavbarItem>
 *   <NavbarItem type="badge" aria-label="Notifications"><Icon name="bell" size={24} /></NavbarItem>
 *   <NavbarItem type="avatar" aria-label="Profile"><img alt="" src={photo} /></NavbarItem>
 *
 * `type="avatar"` wraps children in the 24px circle; `type="badge"` adds the dot.
 *
 * `href` navigates and renders an `<a>` through `next/link`; without it you get the
 * `<button>` the DS markup uses. An entry that navigates has to be a real anchor —
 * a button carrying `role="link"` loses middle-click, ⌘-click and the status bar.
 * `href` + `disabled` renders the button instead, which is the honest affordance
 * for a destination that exists but is unavailable.
 */
function NavbarItem({
    className,
    children,
    type = 'icon',
    selected,
    state,
    disabled,
    href,
    ...props
}: NavbarItemProps) {
    const resolvedState = state ?? (selected ? 'selected' : undefined)
    const isDisabled = disabled || resolvedState === 'disabled'
    const isSelected = resolvedState === 'selected'

    const shared = {
        'data-slot': 'navbar-item',
        'data-type': type,
        'data-state': resolvedState,
        'aria-current': isSelected ? ('page' as const) : undefined,
        className: cn(
            ITEM_BASE,
            type === 'accent' ? ITEM_ACCENT : ITEM_GHOST,
            ITEM_FOCUS,
            className,
        ),
    }

    const content = (
        <>
            {type === 'avatar' ? (
                <span
                    data-slot="navbar-item-avatar"
                    className={cn(
                        AVATAR_BASE,
                        isSelected && AVATAR_RING,
                        // Figma drops the whole item to 40% on Disabled=Avatar — the
                        // photo cannot take an icon token, so opacity is what carries.
                        isDisabled && 'opacity-40',
                    )}
                >
                    {children}
                </span>
            ) : (
                children
            )}
            {type === 'badge' && (
                <span
                    data-slot="navbar-item-badge"
                    aria-hidden="true"
                    className={cn(BADGE_DOT, isDisabled && 'opacity-40')}
                />
            )}
        </>
    )

    if (href && !isDisabled) {
        return (
            <Link href={href} {...shared} {...props}>
                {content}
            </Link>
        )
    }

    return (
        <button type="button" disabled={isDisabled} {...shared} {...props}>
            {content}
        </button>
    )
}

/**
 * A stack inside the rail. Figma reports itemSpacing 0 on the rail — the three
 * stacks are spread by SPACE_BETWEEN — and each stack carries its own gap: the
 * brand stack on Spacing 4, both item stacks on Spacing 2.
 */
function NavbarGroup({
    className,
    group,
    ...props
}: ComponentPropsWithoutRef<'div'> & { group: 'brand' | 'nav' | 'bottom' }) {
    return (
        <div
            data-slot="navbar-group"
            data-group={group}
            className={cn(
                'flex shrink-0 flex-col items-center',
                group === 'brand' ? 'gap-4' : 'gap-2',
                className,
            )}
            {...props}
        />
    )
}

/** The 56×1 hairline that closes the brand stack and opens the bottom stack. */
function NavbarRule({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="navbar-rule"
            role="separator"
            className={cn('block h-px w-[56px] shrink-0 bg-(--separator-default)', className)}
            {...props}
        />
    )
}

/**
 * The rail. Figma authors it 88 × 1008; the host owns the height so it can fill a
 * viewport, so give it a parent with a height.
 *
 * The width is the DS number, held in `--rail-width` because the app shell has to
 * line two other things up against it — see the token in `globals.css`.
 */
function Navbar({
    className,
    children,
    ...props
}: ComponentPropsWithoutRef<'nav'> & { children?: ReactNode }) {
    return (
        <nav
            data-slot="navbar"
            className={cn(
                'flex h-full w-(--rail-width) shrink-0 flex-col items-center justify-between gap-0 bg-(--background-surface) p-4',
                className,
            )}
            {...props}
        >
            {children}
        </nav>
    )
}

export { Navbar, NavbarGroup, NavbarItem, NavbarRule }
