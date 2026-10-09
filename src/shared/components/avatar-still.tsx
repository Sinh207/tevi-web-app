'use client'

import { cn } from '@shared/lib/utils'
import {
    Avatar,
    AvatarInitials,
    AvatarPlaceholder,
    type AvatarSize,
    avatarImageClass,
} from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { type ReactNode, type Ref, useCallback, useState } from 'react'

/**
 * Which still to draw for an avatar URL, and the two hooks into the `<img>` that find out it is
 * broken — the one rule every avatar in the app follows when a picture does not arrive.
 *
 * ## Keyed by URL
 *
 * The failure is remembered for **that URL**, not as a flag: the same instance is handed a new
 * `src` when a list reorders or an account changes its picture, and a boolean would carry one
 * picture's failure onto the next.
 *
 * ## Two ways to find out, because one misses
 *
 * `onError` catches a load that fails after hydration. One that failed **before** it — common on a
 * server-rendered page, where the 404 comes back before the bundle — fired its event while the HTML
 * had no listeners. So the element is also checked as it mounts: `complete` with no pixels is a load
 * that already failed. A lazy image not yet fetched is not `complete`, so it is left alone.
 */
export function useAvatarStill(src: string | null | undefined) {
    const [failed, setFailed] = useState<string | null>(null)
    const still = src && src !== failed ? src : null
    const ref = useCallback(
        (img: HTMLImageElement | null) => {
            if (src && img?.complete && img.naturalWidth === 0 && img.currentSrc) setFailed(src)
        },
        [src],
    )
    const onError = useCallback(() => {
        if (src) setFailed(src)
    }, [src])
    return { still, imgProps: { ref, onError } }
}

/**
 * An avatar from a URL that may be missing **or broken** — `Avatar` plus the fallback rule, so a call
 * site cannot assemble one that shows the browser's broken-image glyph on a white disc.
 *
 * - a picture that loads → the picture;
 * - **no** picture, and initials given → the initials (the DS `initials` type: "nobody set one");
 * - otherwise, including a picture that **failed** → the DS placeholder: its grey ground, ring and a
 *   glyph. Not the initials even when given: initials say this person has no picture, and they do —
 *   it just did not arrive.
 *
 * `AnimatedAvatar` is the same rule plus a video layer, and uses `useAvatarStill` directly. Reach for
 * this one where there is never a clip (accounts, hosts, orders, partner logos).
 */
export function AvatarStill({
    src,
    alt = '',
    size,
    px,
    initials,
    glyph,
    unoptimized,
    priority,
    className,
    imageClassName,
    ref,
}: {
    src: string | null | undefined
    /** The picture's name. `''` (the default) for a decorative avatar beside a printed name. */
    alt?: string
    size: AvatarSize
    /** The box in pixels — `next/image` needs it explicitly. */
    px: number
    /** Shown only when there is **no** picture at all; a failed one gets the placeholder. */
    initials?: string
    /** The placeholder's glyph. Defaults to the person glyph; pass a literal `<Icon>` for another. */
    glyph?: ReactNode
    /** For hosts outside `next.config.ts`'s `remotePatterns` — see the call sites that set it. */
    unoptimized?: boolean
    priority?: boolean
    className?: string
    /** Classes for the avatar **only while it shows a picture** — e.g. a white plate under a logo. */
    imageClassName?: string
    ref?: Ref<HTMLSpanElement>
}) {
    const { still, imgProps } = useAvatarStill(src)
    const showsInitials = !src && !!initials
    const type = still ? 'image' : showsInitials ? 'initials' : 'placeholder'

    return (
        <Avatar
            ref={ref}
            size={size}
            type={type}
            className={cn('overflow-hidden', className, still && imageClassName)}
        >
            {still ? (
                <Image
                    {...imgProps}
                    src={still}
                    alt={alt}
                    width={px}
                    height={px}
                    unoptimized={unoptimized}
                    priority={priority}
                    className={avatarImageClass}
                />
            ) : showsInitials ? (
                <AvatarInitials>{initials}</AvatarInitials>
            ) : (
                <AvatarPlaceholder
                    size={size}
                    role={alt ? 'img' : undefined}
                    aria-label={alt || undefined}
                    className="flex items-center justify-center"
                >
                    {glyph ?? <Icon name="user-simple-alt" weight="filled" size={24} />}
                </AvatarPlaceholder>
            )}
        </Avatar>
    )
}
