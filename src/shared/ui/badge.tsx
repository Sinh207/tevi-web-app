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
 * Size only changes the box: 20 tall at `small`, 24 at `medium`, and `outline`
 * loses 1px of padding on each axis to absorb its border without growing.
 */
export type BadgeSize = 'small' | 'medium'
export type BadgeStatus =
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'outline'
    | 'disabled'

const BADGE_BASE =
    'type-caption-meta inline-flex items-center justify-center gap-1 rounded-[var(--radius-fill)] border-0 border-solid border-transparent whitespace-nowrap'

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

export type BadgeProps = ComponentPropsWithoutRef<'span'> & {
    size?: BadgeSize
    status?: BadgeStatus
}

function Badge({ className, size = 'medium', status = 'default', ...props }: BadgeProps) {
    const outline = status === 'outline'
    return (
        <span
            data-slot="badge"
            data-tone="label"
            data-size={size}
            data-status={status}
            className={cn(
                BADGE_BASE,
                size === 'small'
                    ? cn('h-[20px] min-h-[20px]', outline ? 'px-[5px] py-0' : 'px-[6px] py-px')
                    : cn('h-[24px]', outline ? 'px-[7px] py-[2px]' : 'px-2 py-[3px]'),
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
