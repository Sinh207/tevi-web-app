import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * Badge + Notification Badge — Figma "Badge", ported 1:1.
 *
 * **Partial port.** Only `tone="label"` is here. Figma also ships a default tone and
 * a `transaction` tone across 18 statuses; their paints are not in the exported
 * contract yet, so they are absent rather than approximated. `label` covers the
 * eight statuses below, which is every status the drawer and the shell use.
 *
 * Size changes the box **and the type**, per the DS's own measured table:
 *
 * | size | padding | height | font | icon |
 * |---|---|---|---|---|
 * | `small` | 1 / 6 | 20 | 12 / 18 | 12 |
 * | `medium` | 3 / 8 | 24 | 12 / 18 | 16 |
 * | `large` | 4 / 12 | 29 | 14 / 21 | 20 |
 *
 * `outline` loses 1px of padding on each axis to absorb its border without growing.
 *
 ## `weight` is **not** a Figma axis — it is a deliberate, opt-in departure
 *
 * `.tevi-badge` sets `font-weight: var(--font-weight-regular)` once for the whole component, and no
 * size or status overrides it. So `weight="strong"` is this repo adding something the design system
 * does not have, which is normally the thing `shared/ui` exists to prevent. It is here because the
 * product asked for a heavier badge label on the `/following` live card and reaffirmed it after the
 * DS's own line was put in front of them — a decision, made with the trade in view.
 *
 * It is a **prop, and it defaults to `regular`**, so every badge already in the app renders exactly
 * the same bytes and the departure is visible at the one call site that opted in. That is the whole
 * reason it is not a change to the base class: a global edit here would silently restyle the drawer,
 * the shell and everything else, and nothing would record that the DS says otherwise.
 *
 * The heavier step is the **type scale's own** — `type-caption-label-strong` (12/600) and
 * `type-dense-strong` (14/600) — not a hand-set `font-weight`, which `docs/DESIGN_SYSTEM.md`
 * forbids outright.
 *
 * ⚠ It could not be done from a call site instead. `type-caption-meta` and
 * `type-caption-label-strong` are both `@layer components` classes at equal specificity, so
 * `globals.css`'s **source order** decides — and `-meta` is declared last, so passing the strong
 * class through `className` silently does nothing. Which is why the axis has to live in here.
 */
export type BadgeSize = 'small' | 'medium' | 'large'
export type BadgeStatus =
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'outline'
    | 'disabled'

/** No type class here — it belongs to the size, and two `.type-*` classes on one element cannot
 *  be resolved by `twMerge` (they are `@layer components`, not utilities it knows about). */
const BADGE_BASE =
    'inline-flex items-center justify-center gap-1 rounded-[var(--radius-fill)] border-0 border-solid border-transparent whitespace-nowrap'

const BADGE_STATUS: Record<BadgeStatus, string> = {
    default: 'bg-(--background-segment) text-(--text-title)',
    primary: 'bg-(--accents-indigo-active) text-(--text-on-accent)',
    success: 'bg-(--accents-success-bg-active) text-(--accents-success-active)',
    warning: 'bg-(--accents-warning-bg-active) text-(--accents-warning-active)',
    error: 'bg-(--accents-error-bg-active) text-(--accents-error-active)',
    info: 'bg-(--accents-indigo-bg-active) text-(--accents-indigo-active)',
    outline: 'border border-(--button-secondary-border) bg-(--button-ghost-bg) text-(--text-body)',
    disabled: 'bg-(--button-secondary-bg-disabled) text-(--text-disabled)',
}

/** Regular is Figma's, everywhere. See the note above before reaching for the other one. */
export type BadgeWeight = 'regular' | 'strong'

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
    size?: BadgeSize
    status?: BadgeStatus
    weight?: BadgeWeight
}

/**
 * The type step per (size, weight). Kept as a table rather than composed, because these are the
 * scale's own named steps: 12/400, 12/600, 14/400, 14/600. There is no arithmetic to get wrong and
 * no room for a fifth combination to be invented at a call site.
 */
const BADGE_TYPE: Record<BadgeSize, Record<BadgeWeight, string>> = {
    small: { regular: 'type-caption-meta', strong: 'type-caption-label-strong' },
    medium: { regular: 'type-caption-meta', strong: 'type-caption-label-strong' },
    large: { regular: 'type-dense-default', strong: 'type-dense-strong' },
}

function Badge({
    className,
    size = 'medium',
    status = 'default',
    weight = 'regular',
    ...props
}: BadgeProps) {
    const outline = status === 'outline'
    return (
        <span
            data-slot="badge"
            data-tone="label"
            data-size={size}
            data-status={status}
            data-weight={weight}
            className={cn(
                BADGE_BASE,
                BADGE_TYPE[size][weight],
                size === 'small'
                    ? cn('h-[20px] min-h-[20px]', outline ? 'px-[5px] py-0' : 'px-[6px] py-px')
                    : size === 'medium'
                      ? cn('h-[24px]', outline ? 'px-[7px] py-[2px]' : 'px-2 py-[3px]')
                      : cn('h-[29px]', outline ? 'px-[11px] py-[3px]' : 'px-3 py-1'),
                BADGE_STATUS[status],
                className,
            )}
            {...props}
        />
    )
}

export type NotificationBadgeSize = 'small' | 'medium' | 'large'

const DOT_SIZE: Record<NotificationBadgeSize, string> = {
    small: 'size-[6px] border-[0.5px]',
    medium: 'size-[8px] border',
    large: 'size-[10px] border',
}

/** `count` never shrinks below its min box, so 1 and 99+ both stay legible. */
const COUNT_SIZE: Record<NotificationBadgeSize, string> = {
    small: 'min-h-[18px] min-w-[18px]',
    medium: 'min-h-[20px] min-w-[20px]',
    large: 'min-h-[24px] min-w-[24px]',
}

export type NotificationBadgeProps = ComponentPropsWithoutRef<'span'> & {
    size?: NotificationBadgeSize
    type?: 'dot' | 'count'
}

/**
 * The red unread marker. `dot` carries a ring in `--background` so it stays readable
 * on top of whatever it is pinned to; `count` is a pill with the number inside.
 */
function NotificationBadge({
    className,
    size = 'medium',
    type = 'dot',
    ...props
}: NotificationBadgeProps) {
    return (
        <span
            data-slot="notification-badge"
            data-size={size}
            data-type={type}
            className={cn(
                'inline-flex items-center justify-center rounded-[var(--radius-fill)] border-0 border-solid border-transparent bg-(--accents-error-active)',
                type === 'dot'
                    ? cn('border-solid border-(--background) p-0', DOT_SIZE[size])
                    : cn(
                          'type-caption-label gap-1 px-1 text-(--text-on-accent) whitespace-nowrap',
                          COUNT_SIZE[size],
                      ),
                className,
            )}
            {...props}
        />
    )
}

export { Badge, NotificationBadge }
