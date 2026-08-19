import { cn } from '@shared/lib/utils'
import Image from 'next/image'
import type { ComponentPropsWithoutRef, CSSProperties, HTMLAttributes, ReactNode } from 'react'

/**
 * App Bar — Figma "App Bar" 34:7033 plus its parts:
 *
 *   App Bar/Button        34:6891    the pill every top-bar action is built from
 *   App Bar/Star Balance  2274:48365
 *   App Bar/Star Icon     2022:5662  raster, see `AppBarStarIcon`
 *   App Bar/Badge         3464:21037
 *
 * **Partial port.** Figma ships nine Style variants of the bar — they are *content*
 * presets (title-center, message-detail, gift, group, …), not a size axis, and the DS
 * calls them "exactly the content Figma ships". What is here is the bar frame plus the
 * parts, so a screen composes the arrangement it needs. `App Bar/Level` (raster art
 * with the digit baked in), the segmented `gift` header and the `message-detail` user
 * block are not ported.
 *
 * Geometry: the bar is 60 tall, full width, `space-between`, gap 10 (Figma itemSpacing,
 * not a Spacing token), padding 8/16, and **no background of its own** — in the app it
 * sits over a screen. A sticky host has to supply one or the page scrolls through it.
 */

function AppBar({ className, ...props }: ComponentPropsWithoutRef<'header'>) {
    return (
        <header
            data-slot="app-bar"
            className={cn(
                'relative flex h-[60px] w-full items-center justify-between gap-[10px] bg-none px-4 py-2',
                className,
            )}
            {...props}
        />
    )
}

/** A run of adjacent actions, 8 apart. */
function AppBarCluster({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="app-bar-cluster"
            className={cn('flex flex-none items-center gap-2', className)}
            {...props}
        />
    )
}

export type AppBarButtonType =
    | '1-icon'
    | '1-icon-active'
    | '2-icons'
    | '3-icons'
    | '4-icons'
    | 'back'
    | 'text-primary'
    | 'text-secondary'
    | 'avatar'
export type AppBarTheme = 'light' | 'overlay'

/**
 * `--topbar-*` are the DS's own indirection: the type and theme rewrite them and every
 * part reads them, so a nested glyph or label picks up the right paint without knowing
 * which variant it is in.
 */
const BUTTON_BASE = [
    '[--topbar-bg:var(--background-topbar-action)]',
    '[--topbar-glyph:var(--text-title)]',
    '[--topbar-label:var(--button-secondary-text)]',
    'type-body-emphasis m-0 inline-flex h-[44px] flex-none cursor-pointer items-center justify-center gap-3 rounded-[var(--radius-fill)] border-0 p-1 whitespace-nowrap',
    'bg-[var(--topbar-bg)] text-[var(--topbar-label)] shadow-[inset_0_0_0_1px_var(--button-topbar-border)]',
    '[-webkit-tap-highlight-color:transparent] [transition:background-color_120ms_ease,color_120ms_ease]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed',
].join(' ')

/** Multi-icon and star-balance pills tighten to 8; `back` closes up entirely. */
const BUTTON_GAP: Partial<Record<AppBarButtonType, string>> = {
    '2-icons': 'gap-2',
    '3-icons': 'gap-2',
    '4-icons': 'gap-2',
    back: 'gap-0',
}

/** The three label-bearing types trade some of the 4 padding for horizontal room. */
const BUTTON_PAD: Partial<Record<AppBarButtonType, string>> = {
    back: 'px-2 py-1',
    'text-primary': 'px-2 py-1',
    'text-secondary': 'px-2 py-1',
}

const BUTTON_TYPE: Partial<Record<AppBarButtonType, string>> = {
    '1-icon-active': '[--topbar-bg:var(--button-accent-bg)] [--topbar-glyph:var(--white)]',
    'text-primary':
        '[--topbar-bg:var(--button-accent-bg)] [--topbar-label:var(--button-accent-text)]',
}

/**
 * `overlay` is the on-media theme: Figma pins its colours to Dark, so the two paints are
 * literals rather than tokens that would flip with the host. The active and primary
 * types clear the fill and ring instead of tinting them.
 */
const BUTTON_OVERLAY = [
    '[--background-topbar-action:#1d1d1dd9] [--button-topbar-border:#ffffff33]',
    '[--topbar-glyph:var(--white)] [--topbar-label:var(--white)]',
].join(' ')

/**
 * The overlay reset — Figma's `--background-topbar-action: unset` and `--button-topbar-border:
 * unset` for `Theme=Overlay` on the active and primary types.
 *
 * ⚠ It used to be `bg-none shadow-none`, and **`bg-none` is `background-image: none`** — a no-op
 * here, because the fill is a `background-color` (`bg-[var(--topbar-bg)]`). So the two types that
 * are supposed to lose their fill over media kept it, in the one theme where the fill is a dark
 * literal. Invisible in review and invisible in the light theme; caught when a screen wanted the
 * same fill-less treatment on a light bar and got a pill.
 *
 * Clearing the **variable** is both the fix and what the DS actually says: every part reads
 * `--topbar-*`, so unsetting the source is how a variant removes a paint rather than painting over
 * it.
 */
const BUTTON_OVERLAY_RESET = '[--topbar-bg:transparent] shadow-none'

export type AppBarButtonProps = HTMLAttributes<HTMLElement> & {
    type?: AppBarButtonType
    theme?: AppBarTheme
    disabled?: boolean
}

function AppBarButton({
    className,
    type = '1-icon',
    theme = 'light',
    disabled,
    ...props
}: AppBarButtonProps) {
    const overlayReset =
        theme === 'overlay' && (type === '1-icon-active' || type === 'text-primary')
    return (
        <button
            type="button"
            data-slot="app-bar-button"
            data-type={type}
            data-theme={theme}
            disabled={disabled}
            className={cn(
                BUTTON_BASE,
                BUTTON_GAP[type],
                BUTTON_PAD[type],
                BUTTON_TYPE[type],
                theme === 'overlay' && BUTTON_OVERLAY,
                overlayReset && BUTTON_OVERLAY_RESET,
                overlayReset && type === 'text-primary' && '[--topbar-label:var(--button-accent-text)]',
                theme === 'overlay' && type === 'back' && 'gap-2',
                theme === 'overlay' &&
                    (type === 'back' || type === 'text-primary' || type === 'text-secondary') &&
                    'p-1',
                className,
            )}
            {...props}
        />
    )
}

/** The 36×36 glyph slot inside a button. Put a 22px `<Icon>` in it. */
function AppBarButtonIcon({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="app-bar-button-icon"
            className={cn(
                'flex size-[36px] flex-none items-center justify-center text-[var(--topbar-glyph)]',
                className,
            )}
            {...props}
        />
    )
}

/**
 * `App Bar/Button/__lead` — the glyph slot *inside* a `frame`, as opposed to the 36×36
 * `__icon` a one-glyph button uses. It has no box of its own: just `flex none` and the
 * bar's `--topbar-glyph` paint, so the frame's own 6px padding and 4 gap do the spacing.
 *
 * This is what the DS puts in front of the label on the `back` and `star-balance` types
 * (`preview/app-bar.html`); an `__icon` there would add 36px of empty box.
 */
function AppBarButtonLead({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="app-bar-button-lead"
            className={cn('flex flex-none text-[var(--topbar-glyph)]', className)}
            {...props}
        />
    )
}

/** The 36-tall inline slot for a button that carries something other than one glyph. */
function AppBarButtonFrame({
    className,
    slot,
    ...props
}: ComponentPropsWithoutRef<'span'> & { slot?: 'back' | 'star-balance' }) {
    return (
        <span
            data-slot="app-bar-button-frame"
            data-frame={slot}
            className={cn(
                'inline-flex h-[36px] flex-none items-center p-[6px]',
                slot === 'back' && 'gap-1',
                slot === 'star-balance' && 'gap-2',
                className,
            )}
            {...props}
        />
    )
}

function AppBarButtonLabel({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="app-bar-button-label"
            className={cn('block text-[var(--topbar-label)]', className)}
            {...props}
        />
    )
}

/**
 * The Star balance pill. Radius 2000 and padding 2 are Figma literals with no variable
 * bound, and the ring is a 0.5px **outside** stroke — a box-shadow, so it stays off the
 * box model (Chromium snaps it to 1 device px at DPR 1 anyway).
 */
function AppBarStarBalance({
    className,
    size = 'medium',
    ...props
}: ComponentPropsWithoutRef<'div'> & { size?: 'medium' | 'large' }) {
    return (
        <div
            data-slot="app-bar-star-balance"
            data-size={size}
            className={cn(
                'inline-flex flex-none items-center gap-1 rounded-[2000px] bg-(--background-segment) p-[2px] shadow-[0_0_0_0.5px_var(--button-topbar-border)]',
                size === 'large' && 'h-[29px] py-[2px] pe-[2px] ps-1',
                size === 'medium' && 'h-[24px]',
                className,
            )}
            {...props}
        />
    )
}

/**
 * `App Bar/Star Icon` 2022:5662 — the Tevi Star, and the one part of the bar that is
 * **raster**: gold with a gradient and a highlight, not a `currentColor` glyph. The
 * sprite's flat `star` is a different mark, so substituting it would be wrong.
 *
 * The DS ships it embedded as a data URI inside `preview/app-bar.html`; the same 72×72
 * PNG is committed at `public/tevi-star.png` and drawn at 20.
 */
function AppBarStarIcon({ className, size = 20 }: { className?: string; size?: number }) {
    return (
        <Image
            data-slot="app-bar-star-icon"
            src="/tevi-star.png"
            alt=""
            aria-hidden
            width={size}
            height={size}
            className={cn('block flex-none', className)}
        />
    )
}

function AppBarStarCount({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="app-bar-star-count"
            className={cn('type-caption-label-strong block text-(--text-title)', className)}
            {...props}
        />
    )
}

/** The add affordance: a filled circle, 20 at medium and 25 at large. */
function AppBarStarPlus({
    className,
    size = 'medium',
    ...props
}: ComponentPropsWithoutRef<'span'> & { size?: 'medium' | 'large' }) {
    return (
        <span
            data-slot="app-bar-star-plus"
            className={cn(
                'grid flex-none place-items-center rounded-[27px] bg-(--text-title) text-(--button-primary-text)',
                size === 'large' ? 'size-[25px]' : 'size-[20px]',
                className,
            )}
            {...props}
        />
    )
}

/**
 * `App Bar/Badge` — a 24px art board the host scales down. Premium is the sprite's
 * `premium` glyph at `filled` (the DS badge art and the sprite symbol are the same
 * paths), which is multi-colour brand art and ignores `currentColor`.
 */
function AppBarBadge({
    className,
    size = 18,
    children,
    ...props
}: Omit<ComponentPropsWithoutRef<'span'>, 'children'> & { size?: number; children?: ReactNode }) {
    return (
        <span
            data-slot="app-bar-badge"
            className={cn('relative block flex-none', className)}
            style={{ '--badge-size': `${size}px`, width: size, height: size } as CSSProperties}
            {...props}
        >
            <span
                data-slot="app-bar-badge-art"
                className="absolute start-0 top-0 size-[24px] origin-top-left"
                style={{ transform: `scale(${size / 24})` }}
            >
                {children}
            </span>
        </span>
    )
}

export type AppBarTitleProps = ComponentPropsWithoutRef<'div'> & {
    align?: 'center' | 'left'
    size?: 'default' | 'large'
    /** Absolutely centred in the bar unless `flow` takes it out of that. */
    flow?: 'left' | 'start'
}

/** Title + optional subtitle. Centred on the bar by default, as Figma draws it. */
function AppBarTitle({
    className,
    align = 'center',
    size = 'default',
    flow,
    ...props
}: AppBarTitleProps) {
    return (
        <div
            data-slot="app-bar-title"
            data-align={align}
            data-size={size}
            data-flow={flow}
            className={cn(
                'flex flex-none flex-col justify-center gap-0 text-center',
                align === 'center' ? 'items-center px-4' : 'items-start p-0 text-start',
                // `start-1/2` is logical but the translate that pulls the box back onto
                // its own centre is not: under `dir=rtl` the offset is measured from the
                // right, so it has to move the other way or the title lands off-canvas
                // (and takes the page's horizontal scrollbar with it). Figma only draws
                // this LTR; the flip is ours.
                flow === undefined &&
                    'absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2',
                // Figma's 20 is a literal, not Spacing 5 — which is 24 in this theme.
                flow === 'left' && 'static ms-[20px] me-auto',
                flow === 'start' && 'static me-auto',
                className,
            )}
            {...props}
        />
    )
}

function AppBarTitleText({
    className,
    size = 'default',
    as: As = 'span',
    ...props
}: HTMLAttributes<HTMLElement> & {
    size?: 'default' | 'large'
    /** A screen title is a heading; a bar label on a composed view is not. */
    as?: 'span' | 'h1' | 'h2'
}) {
    return (
        <As
            data-slot="app-bar-title-text"
            className={cn(
                'block whitespace-nowrap text-(--text-title)',
                size === 'large' ? 'type-title-t1-bold' : 'type-body-strong',
                className,
            )}
            {...props}
        />
    )
}

function AppBarSubtitle({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="app-bar-subtitle"
            className={cn(
                'type-caption-meta block whitespace-nowrap text-(--text-subtitle)',
                className,
            )}
            {...props}
        />
    )
}

export {
    AppBar,
    AppBarBadge,
    AppBarButton,
    AppBarButtonFrame,
    AppBarButtonIcon,
    AppBarButtonLabel,
    AppBarButtonLead,
    AppBarCluster,
    AppBarStarBalance,
    AppBarStarCount,
    AppBarStarIcon,
    AppBarStarPlus,
    AppBarSubtitle,
    AppBarTitle,
    AppBarTitleText,
}
