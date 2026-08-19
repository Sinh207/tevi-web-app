import { cn } from '@shared/lib/utils'
import type { ComponentProps, ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * Avatar — Figma "Avatar" (34:7161), ported 1:1.
 *
 * **Partial port.** All seven sizes are now measured — `xl` and `2xl` were added from
 * `avatar.css` when the channel header needed the 80px box, read off the stylesheet
 * rather than interpolated from `large`. `type="icon"` is still not ported, and neither
 * is `Avatar/Status` (a dot at four sizes, `online | busy | offline`). Add them from the
 * DS when a screen needs them — don't guess.
 *
 * The Initials text style rides on the size (10 / 10 / 12 / 14 / 16 / 20 / 24), and the
 * two largest are the **only** sizes whose initials use `--letter-spacing-tight` — every
 * size below them is `none`. That is the reason `size` picks a `type-*` utility instead
 * of a bare font-size: the tracking comes along with it.
 *
 * Nothing here plays video. An animated (Premium) avatar is a Tevi behaviour with no DS
 * variant behind it, so it composes this component from one layer up — see
 * `shared/components/animated-avatar.tsx`.
 */
export type AvatarSize = '2xs' | 'xs' | 'small' | 'medium' | 'large' | 'xl' | '2xl'
export type AvatarType = 'image' | 'initials' | 'placeholder'

const AVATAR_BASE =
    'relative inline-flex flex-none items-center justify-center overflow-visible rounded-[var(--radius-fill)] border-0 border-solid border-transparent leading-[var(--line-height-default)] select-none'

const AVATAR_SIZE: Record<AvatarSize, string> = {
    '2xs': 'size-[20px] type-micro-overline',
    xs: 'size-[24px] type-micro-overline',
    small: 'size-[32px] type-caption-label',
    medium: 'size-[40px] type-dense-emphasis',
    large: 'size-[48px] type-body-emphasis',
    xl: 'size-[64px] type-title-t2-semibold',
    '2xl': 'size-[80px] type-title-t1-semibold',
}

/** Figma keeps the placeholder art inset from the ring: 18 / 22 / 30 / 38 / 44 / 60 / 76. */
const PLACEHOLDER_SIZE: Record<AvatarSize, string> = {
    '2xs': 'size-[18px]',
    xs: 'size-[22px]',
    small: 'size-[30px]',
    medium: 'size-[38px]',
    large: 'size-[44px]',
    xl: 'size-[60px]',
    '2xl': 'size-[76px]',
}

/** The ring thickens from `large` up — 1px below, 1.5px at and above. */
const PLACEHOLDER_RING: Record<AvatarSize, string> = {
    '2xs': 'border',
    xs: 'border',
    small: 'border',
    medium: 'border',
    large: 'border-[1.5px]',
    xl: 'border-[1.5px]',
    '2xl': 'border-[1.5px]',
}

/**
 * `ComponentProps` rather than `ComponentPropsWithoutRef`, so the box can be observed.
 *
 * React 19 passes `ref` to a function component as an ordinary prop, no `forwardRef` needed —
 * and `shared/components/animated-avatar.tsx` needs one, because it gates video playback on
 * whether the avatar is actually on screen. Nothing about the DS port changes.
 */
export type AvatarProps = Omit<ComponentProps<'span'>, 'children'> & {
    size?: AvatarSize
    type?: AvatarType
    /** `type="image"` — pass the rendered `<img>`/`next/image` as children instead
     *  when the host needs to control loading. */
    children?: ReactNode
}

function Avatar({ className, size = 'medium', type = 'image', children, ...props }: AvatarProps) {
    return (
        <span
            data-slot="avatar"
            data-size={size}
            data-type={type}
            className={cn(
                AVATAR_BASE,
                AVATAR_SIZE[size],
                type === 'image' && 'bg-(--white)',
                /*
                 * Figma's own paint for the initials type — `--accents-indigo-bg-active` behind
                 * `--accents-indigo-active`, both bound tokens, so it flips with the theme.
                 *
                 * It was missing from this port, and the failure was invisible on every screen
                 * that had an avatar image to show: initials only render when there is none, and
                 * without the fill they are two letters floating in a transparent circle beside
                 * a name — with nothing marking where the avatar column is. Caught on
                 * `/dev/blocked-accounts`, where none of the fixtures has a picture.
                 */
                type === 'initials' &&
                    'bg-(--accents-indigo-bg-active) text-(--accents-indigo-active)',
                type === 'placeholder' &&
                    cn(
                        'border-solid border-(--button-secondary-border) bg-(--background-segment) text-(--icon-secondary)',
                        PLACEHOLDER_RING[size],
                    ),
                className,
            )}
            {...props}
        >
            {children}
        </span>
    )
}

/** `type="image"` — fills the circle. Use for a plain `<img>`; `next/image` can take
 *  the same classes via `className`. */
const avatarImageClass = 'block size-full rounded-[inherit] object-cover'

/** `type="placeholder"` — the inset circle the fallback art sits in. */
function AvatarPlaceholder({
    className,
    size = 'medium',
    ...props
}: ComponentPropsWithoutRef<'span'> & { size?: AvatarSize }) {
    return (
        <span
            data-slot="avatar-placeholder"
            className={cn(
                'absolute inset-0 m-auto overflow-hidden rounded-[var(--radius-fill)]',
                PLACEHOLDER_SIZE[size],
                className,
            )}
            {...props}
        />
    )
}

/** `type="initials"` — inherits the size's text style. */
function AvatarInitials({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            data-slot="avatar-initials"
            className={cn('font-[inherit] tracking-[inherit] whitespace-nowrap', className)}
            {...props}
        />
    )
}

export { Avatar, AvatarInitials, AvatarPlaceholder, avatarImageClass }
