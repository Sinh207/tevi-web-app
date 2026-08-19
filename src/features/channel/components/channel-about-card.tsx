import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * One block of the About tab: legacy's bordered card.
 *
 * ## It went away once, and bringing it back was the correction
 *
 * An earlier pass replaced these four cards with plain sections divided by `ListSeparator`, on the
 * grounds that at `md` and up the tab panel is itself a `--background-surface` card — so a surface
 * card inside it is separated from its own background by nothing but a 1px ring. That reasoning is
 * not wrong, but it was **redesign, not port**: legacy draws exactly this, a white card on a white
 * page held apart by a `#e0e0e0` hairline, in both its trees and on all four blocks. This screen is
 * a 1:1 rewrite, so the card stays and the observation stays a note for whoever owns the design.
 *
 * ## The values are legacy's, the colours are the DS's
 *
 * `border-radius: 16px` → `--radius-xl`, exactly. `1px solid #e0e0e0` → `--separator-default`
 * (`--zinc-200`, `#e4e4e7`) — the nearest semantic token and the one every other hairline in the app
 * already uses, which is what makes it flip correctly in dark mode where a literal `#e0e0e0` would
 * glow. `elevation={0}`, so no shadow.
 *
 * Full-bleed dividers *inside* a card (the Details block, the MCN header) are the same token applied
 * as `divide-y` / `border-b`, matching MUI's `<Divider/>` between `CardContent`s.
 */
export function ChannelAboutCard({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
    return (
        <section
            className={cn(
                'min-w-0 rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)',
                className,
            )}
            {...props}
        />
    )
}

/**
 * A card's heading — legacy's `fontWeight: 700, fontSize: 16`.
 *
 * `type-body-strong` is 16/semibold: the DS has no 16/bold in its body ramp, and inventing one is
 * the thing `CLAUDE.md` forbids. Semibold is the closest step and the one every other 16px heading
 * in this app already uses.
 *
 * `h3` because the page's `h1` is the display name and the tab strip's labels sit between.
 */
export function ChannelAboutCardTitle({ className, ...props }: ComponentPropsWithoutRef<'h3'>) {
    return (
        <h3 className={cn('type-body-strong min-w-0 text-(--text-title)', className)} {...props} />
    )
}
