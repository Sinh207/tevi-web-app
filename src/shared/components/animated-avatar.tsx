'use client'

import { useInView } from '@shared/hooks/use-in-view'
import { useMayAnimate } from '@shared/hooks/use-may-animate'
import { type AvatarSourceInput, resolveAvatarSource } from '@shared/lib/avatar-source'
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
import { useEffect, useState } from 'react'

/**
 * An avatar that plays the creator's clip when they have Premium, and shows a still otherwise.
 *
 * ## Why it lives in `shared/components/`, not `shared/ui/`
 *
 * The design system has no animated avatar — `Avatar` is `image | initials | placeholder`, and
 * that file's own doc says to add a variant *from the DS* when a screen needs one rather than
 * guessing. Playing video in a circle is a Tevi behaviour layered on top, so it **composes**
 * `Avatar` one level up and `shared/ui` keeps saying only what Figma says.
 *
 * ## Why it is shared before anything shares it
 *
 * Legacy reads `avatar_video` in more than twenty components — post cards, four comment
 * variants, quote posts, the nav bar's own avatar, membership, the share sheet, conversation
 * lists. This is the shape all of them need, and the Premium rule they all have to respect lives
 * once, in `resolveAvatarSource`.
 *
 * ## Four deliberate departures from legacy
 *
 * Legacy sets `autoPlay` on every instance with `preload="metadata"`, no laziness, and no regard
 * for reduced motion. In a feed of twenty comments that is twenty decoding video elements, which
 * is what makes scrolling stutter and batteries drain. Fixing it once here is the point of the
 * component:
 *
 * 1. **`prefers-reduced-motion: reduce` renders no `<video>` at all** — not a paused one. An
 *    avatar that loops forever is exactly what that setting is for, and a paused video element
 *    still costs a decoder.
 * 2. **Playback is gated on visibility**, with `rootMargin: '0px'`: unlike a pagination sentinel
 *    there is nothing to prefetch, so playing a screen early is pure waste. Off screen, it pauses.
 * 3. **`saveData` shows the still.** A looping clip behind an avatar is not what someone on a
 *    metered connection asked to spend their allowance on.
 * 4. **The poster renders on the server**, so the first paint is a real image (and a real LCP
 *    candidate) rather than an empty circle that fills in after hydration.
 *
 * Everything else is legacy's hardening, ported as-is: muted, looping, inline, no controls, no
 * download, no picture-in-picture, no pointer events, no drag.
 */
export type AnimatedAvatarProps = AvatarSourceInput & {
    /** Accessible name — the person's display name. `''` marks it decorative. */
    alt: string
    size?: AvatarSize
    /** Initials to show when there is no image at all. Falls back to a placeholder glyph. */
    initials?: string
    className?: string
    /** `next/image` `priority`. Set it for the one avatar that is above the fold. */
    priority?: boolean
}

/** Matches the DS boxes, so `next/image` requests the right pixels. */
const SIZE_PX: Record<AvatarSize, number> = {
    '2xs': 20,
    xs: 24,
    small: 32,
    medium: 40,
    large: 48,
    xl: 64,
    '2xl': 80,
}

export function AnimatedAvatar({
    thumb,
    avatarVideo,
    isPremium,
    alt,
    size = 'medium',
    initials,
    className,
    priority = false,
}: AnimatedAvatarProps) {
    const { poster, videoSrc } = resolveAvatarSource({ thumb, avatarVideo, isPremium })
    const mayAnimate = useMayAnimate()
    /** Nothing to prefetch — a clip a screen away is waste, not lead time. */
    const [ref, inView] = useInView<HTMLSpanElement>({
        rootMargin: '0px',
        enabled: mayAnimate && !!videoSrc,
    })
    /**
     * The element in **state**, not a ref.
     *
     * A ref does not trigger a re-render, so an effect could not tell when the `<video>` mounted
     * — it would have to depend on a proxy like "should we be showing one", which is a dependency
     * that isn't read in the body and reads like a mistake. Holding the node in state makes the
     * dependency the node itself: honest, and it re-runs at exactly the right moment.
     */
    const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
    /** A clip that 404s or fails to decode must fall back, not leave a hole. */
    const [videoFailed, setVideoFailed] = useState(false)

    const showsVideo = !!videoSrc && mayAnimate && !videoFailed

    useEffect(() => {
        if (!videoEl) return
        if (inView) {
            // Autoplay can still be refused (a browser policy, a decode failure). The catch is
            // not optional: an unhandled rejection here is a console error on every scroll.
            videoEl.play().catch(() => undefined)
        } else {
            videoEl.pause()
        }
    }, [inView, videoEl])

    const px = SIZE_PX[size]
    const type = poster ? 'image' : initials ? 'initials' : 'placeholder'

    return (
        <Avatar ref={ref} size={size} type={type} className={cn('overflow-hidden', className)}>
            {poster ? (
                <Image
                    src={poster}
                    alt={alt}
                    width={px}
                    height={px}
                    priority={priority}
                    className={avatarImageClass}
                />
            ) : initials ? (
                <AvatarInitials>{initials}</AvatarInitials>
            ) : (
                <AvatarPlaceholder size={size} className="flex items-center justify-center">
                    <Icon name="user-simple-alt" weight="filled" size={24} />
                </AvatarPlaceholder>
            )}

            {showsVideo && (
                /* Layered over the poster rather than replacing it, so there is no frame of
                   emptiness while the first video frame decodes. */
                <video
                    ref={setVideoEl}
                    src={videoSrc}
                    poster={poster ?? undefined}
                    muted
                    loop
                    playsInline
                    // `none` until visible — `metadata` (legacy's value) still costs a request
                    // per avatar, which is the whole problem in a long list.
                    preload="none"
                    controls={false}
                    controlsList="nodownload nofullscreen noremoteplayback"
                    /**
                     * `aria-hidden` plus `tabIndex={-1}`, and both are needed together.
                     *
                     * Hidden because the clip is decoration: the accessible name is on the
                     * poster image beneath it, so announcing a second, nameless media element
                     * would be noise. But a `<video>` is focusable in some browsers even without
                     * controls, and `aria-hidden` on a focusable element is worse than either
                     * alone — it produces a tab stop that assistive tech cannot describe. Taking
                     * it out of the tab order is what makes hiding it honest.
                     */
                    tabIndex={-1}
                    disablePictureInPicture
                    disableRemotePlayback
                    aria-hidden="true"
                    onError={() => setVideoFailed(true)}
                    onContextMenu={event => event.preventDefault()}
                    onDragStart={event => event.preventDefault()}
                    className="pointer-events-none absolute inset-0 size-full select-none rounded-[inherit] object-cover"
                />
            )}
        </Avatar>
    )
}
