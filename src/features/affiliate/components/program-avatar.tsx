import { AvatarStill } from '@shared/components/avatar-still'
import { Icon } from '@shared/ui/icon'
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
 * A program with no icon — or one whose icon does not load — gets the DS placeholder rather than a
 * broken image box.
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
    return (
        <AvatarStill
            src={program?.icon_url}
            size={size}
            px={px}
            unoptimized
            // White plate under the icon: mini-app marks are drawn for a light ground and several
            // are transparent PNGs that vanish on this app's dark surface. Legacy pins the same.
            // Only while the icon shows — a partner's dead URL falls back to the placeholder.
            imageClassName="bg-white"
            glyph={<Icon name="grid-square" size={24} />}
        />
    )
}
