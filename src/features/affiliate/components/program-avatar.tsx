import { Avatar, AvatarPlaceholder, avatarImageClass } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { Program } from '../api/types'

/**
 * A program's icon.
 *
 * `unoptimized` because `icon_url` is a **third-party** URL: a program is somebody else's mini app,
 * on whatever host they publish from, and `next/image` only fetches hosts listed in
 * `next.config.ts`'s `remotePatterns` — an unlisted one is a runtime failure, not a fallback to the
 * raw image. No allow-list can be written ahead of a partner nobody has signed yet. Same call
 * `ProgramCard` makes for the affiliate campaign's own logo.
 *
 * A program with no icon gets the DS placeholder rather than a broken image box.
 */
export function ProgramAvatar({
    program,
    size,
    px,
}: {
    program: Program | null
    /** DS size token. */
    size: 'large' | 'xl'
    /** The same number in pixels — `next/image` needs it explicitly. */
    px: number
}) {
    const icon = program?.icon_url
    return (
        <Avatar
            size={size}
            type={icon ? 'image' : 'placeholder'}
            // White plate under the icon: mini-app marks are drawn for a light ground and several
            // are transparent PNGs that vanish on this app's dark surface. Legacy pins the same.
            className={icon ? 'bg-white' : undefined}
        >
            {icon ? (
                <Image
                    src={icon}
                    alt=""
                    width={px}
                    height={px}
                    unoptimized
                    className={avatarImageClass}
                />
            ) : (
                <AvatarPlaceholder size={size} className="flex items-center justify-center">
                    <Icon name="grid-square" size={24} />
                </AvatarPlaceholder>
            )}
        </Avatar>
    )
}
