import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'
import { Icon } from './icon'

/**
 * Card/User Header — Figma 2039:6472, ported 1:1.
 *
 * Its own file rather than a section of `card.tsx`, because it is its own Figma node consumed by
 * List, Conversation List, App Bar *and* the Space screen — while `card.tsx` scopes itself to
 * the two `data-type`s the Left Bar assembles over. Same reasoning that keeps `list.tsx`
 * separate even though `components.md` files its button under `list`.
 *
 * Two types, and they are not one component at two sizes:
 *
 * | | name row | second line | height |
 * |---|---|---|---|
 * | `list` | 16/semibold, tracking none | `@username`, 14/regular Text-Subtitle | 45 |
 * | `space` | 20/**bold**, tracking tight | link hint, 14/regular Text-Link | 51 |
 *
 * **Every text part is `white-space: nowrap` in Figma**, which means truncation has to be asked
 * for explicitly. Get that wrong on the channel header and a long display name pushes the
 * verified tick and the premium badge off the row instead of ellipsing — so the name carries
 * `truncate` and every ancestor needs `min-w-0`.
 */
export type CardUserHeaderType = 'list' | 'space'

export type CardUserHeaderProps = ComponentPropsWithoutRef<'div'> & {
    type?: CardUserHeaderType
    /**
     * Paints the display name with the brand gradient. Not a colour swap — see
     * `CardUserHeaderName`, where the mechanism has a consequence worth knowing about.
     */
    premium?: boolean
}

function CardUserHeader({
    className,
    type = 'list',
    premium = false,
    ...props
}: CardUserHeaderProps) {
    return (
        <div
            data-slot="card-user-header"
            data-type={type}
            data-premium={premium ? '' : undefined}
            className={cn('flex min-w-0 flex-col items-start justify-center gap-0 p-0', className)}
            {...props}
        />
    )
}

/** The name plus whatever badges follow it — 4px gap, centred, and it must be able to shrink. */
function CardUserHeaderNameRow({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="card-user-header-name-row"
            className={cn('flex min-w-0 flex-row items-center gap-1', className)}
            {...props}
        />
    )
}

/**
 * The display name.
 *
 * `premium` paints it with Figma's `143.5deg` Primary-600 → Indigo-Active gradient via
 * `background-clip: text`. Both stops are bound tokens, so it flips with the theme on its own.
 *
 * ⚠ **The gradient makes the text's `color` transparent**, which has two consequences a caller
 * can trip over: a `text-*` class on the name is silently ignored while `premium` is set, and
 * anything relying on `currentColor` *inside* the name (an inline glyph) loses its paint. Put
 * badges in the row beside the name, never inside it.
 */
function CardUserHeaderName({
    className,
    type = 'list',
    premium = false,
    as: As = 'span',
    ...props
}: ComponentPropsWithoutRef<'span'> & {
    type?: CardUserHeaderType
    premium?: boolean
    /**
     * The element to render. `span` by default, because this name usually sits beside a page that
     * already has its heading elsewhere — a list row, a conversation, an app bar.
     *
     * A screen where this **is** the page's subject passes `h1`. The channel header does: its bar
     * carries no title, so the display name here is the document's one heading. Same option, same
     * three values and same reasoning as `AppBarTitleText`.
     */
    as?: 'span' | 'h1' | 'h2'
}) {
    return (
        <As
            data-slot="card-user-header-name"
            className={cn(
                'min-w-0 truncate whitespace-nowrap',
                type === 'space' ? 'type-title-t2-bold' : 'type-body-strong',
                premium
                    ? 'bg-[linear-gradient(143.5deg,var(--primary-600)_0%,var(--accents-indigo-active)_100%)] bg-clip-text text-transparent'
                    : 'text-(--text-title)',
                className,
            )}
            {...props}
        />
    )
}

/** `@handle` under the name — `list` type's second line. */
function CardUserHeaderUsername({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="card-user-header-username"
            className={cn(
                'min-w-0 truncate whitespace-nowrap type-dense-default text-(--text-subtitle)',
                className,
            )}
            {...props}
        />
    )
}

/** `tevi.com/@slug` under the name — `space` type's second line, in Text-Link. */
function CardUserHeaderHint({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="card-user-header-hint"
            className={cn(
                'flex min-w-0 flex-row items-center gap-1 whitespace-nowrap type-dense-default text-(--text-link)',
                className,
            )}
            {...props}
        />
    )
}

/** A muted-notifications glyph beside the name, in Text-Placeholder. */
function CardUserHeaderMute({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="card-user-header-mute"
            className={cn('flex flex-none text-(--text-placeholder)', className)}
            {...props}
        />
    )
}

/**
 * The verified mark.
 *
 * Figma repaints `badge-check`'s two duotone tones: the scalloped disc goes to Indigo-Active at
 * full opacity (Zappicon ships it at 0.4) and the tick becomes White.
 *
 * **The DS does that with `.tevi-card-user-header__verified path { fill: … }`, and copying that
 * CSS here would silently do nothing.** `Icon` renders `<use href="…#badge-check--duotone">`,
 * and no selector reaches into a `<use>` shadow tree (`docs/DESIGN_SYSTEM.md` §7). The sprite
 * build exposes two custom properties for exactly this, and they *do* cross the boundary:
 * `--tevi-icon-tint` (tint opacity, default 0.4) and `--tevi-icon-detail` (detail fill, default
 * `currentColor`). Setting tint to 1 and detail to White, with the disc taking `currentColor`
 * from the wrapper, is byte-equivalent to Figma's repaint.
 *
 * `title` is required: the mark carries meaning that colour alone does not convey, so it needs
 * an accessible name rather than being decorative.
 */
function CardUserHeaderVerified({
    className,
    title,
    size = 18,
}: {
    className?: string
    title: string
    size?: 16 | 18 | 20 | 22 | 24
}) {
    return (
        <Icon
            name="badge-check"
            weight="duotone"
            size={size}
            title={title}
            className={cn(
                'flex-none text-(--accents-indigo-active) [--tevi-icon-detail:var(--white)] [--tevi-icon-tint:1]',
                className,
            )}
        />
    )
}

export {
    CardUserHeader,
    CardUserHeaderHint,
    CardUserHeaderMute,
    CardUserHeaderName,
    CardUserHeaderNameRow,
    CardUserHeaderUsername,
    CardUserHeaderVerified,
}
