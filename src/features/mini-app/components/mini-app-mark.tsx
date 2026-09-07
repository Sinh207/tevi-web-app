'use client'

import { cn } from '@shared/lib/utils'
import type { IconSize } from '@shared/ui/icon'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { MiniAppConfig } from '../lib/app-config'

/**
 * An app's mark — its icon, or the design system's stand-in.
 *
 * Shared by the tab pill (20px) and the launch splash (64px), which is the whole reason it is its
 * own file: both need the same two decisions, and both were about to make them separately.
 *
 * **`unoptimized`**, for the reason `ProgramAvatar` states: a mini app's icon is a **third-party**
 * URL on whatever host its publisher uses, and `next/image` fails outright on a host missing from
 * `next.config.ts`'s `remotePatterns` rather than falling back to the raw image. No allow-list can
 * be written ahead of a partner nobody has signed yet.
 *
 * **A white plate under the icon**, as `ProgramAvatar` also does: mini-app marks are drawn for a
 * light ground and several are transparent PNGs that vanish on this app's dark surface.
 *
 * With no icon — the Mini App Center, and any app opened by bare URL — the sprite's `grid-category`
 * glyph stands in on the app's own surface. **Not** a raster placeholder:
 * `docs/STATIC_ASSETS.md` forbids fetching static art from a CDN, and there is no committed mark for
 * "a mini app" to use instead.
 */
export function MiniAppMark({
    config,
    px,
    glyph,
    className,
}: {
    config: MiniAppConfig
    /** The rendered box, in pixels — `next/image` needs it explicitly. */
    px: number
    /** Sprite size for the fallback glyph. Pick the step that suits `px`. */
    glyph: IconSize
    className?: string
}) {
    const icon = config.iconUrl
    return (
        <span
            className={cn(
                'relative flex flex-none items-center justify-center overflow-hidden',
                icon ? 'bg-white' : 'bg-(--background-subtle) text-(--icon-secondary)',
                className,
            )}
            style={{ width: px, height: px }}
        >
            {icon ? (
                <Image
                    src={icon}
                    alt=""
                    width={px}
                    height={px}
                    unoptimized
                    className="block size-full object-cover"
                />
            ) : (
                <Icon name="grid-category" size={glyph} />
            )}
        </span>
    )
}
