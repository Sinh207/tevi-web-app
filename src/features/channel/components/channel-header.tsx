'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { cn } from '@shared/lib/utils'
import type { ReactNode } from 'react'
import type { Channel, ChannelStats as Stats } from '../api/types'
import { CHANNEL_PADDING } from '../lib/container'
import { ChannelBio } from './channel-bio'
import { ChannelCover } from './channel-cover'
import { ChannelIdentity } from './channel-identity'
import { ChannelStats } from './channel-stats'

/**
 * The channel header — Figma "Space Detail" (2102:4051), group `Layout`.
 *
 * A **screen composition**, not a reusable primitive: the DS files it under Layout and its own note
 * calls the cover, the status bar and the overlay app bar *slots*. So it lives here in the feature
 * rather than in `shared/ui`, and it composes `Avatar`, `CardUserHeader` and `Button` — the DS note
 * is explicit that nothing is redrawn.
 *
 * ## Where each number comes from
 *
 * The DS gives the DOM order, the type styles and the tokens. It does **not** give the layout
 * metrics: `components.css` exceeds `DesignSync`'s 256 KiB cap and truncates mid-`sheet`, so
 * `space.css` — the block holding this component's padding, gaps and offsets — is unreachable
 * through the tool.
 *
 * Rather than invent them, they are read off **legacy's MUI `sx`**, which is the shipped
 * behaviour and therefore a real source rather than a guess (`containers/channel/.../content/info`,
 * MUI's 8px unit):
 *
 * | | legacy | here |
 * |---|---|---|
 * | card radius | `{ xs: 0, md: '16px 16px 0 0' }` | `rounded-none md:rounded-t-[var(--radius-xl)]` |
 * | content padding | `p: { xs: 1.5, md: 3 }` | `p-3 md:p-6` |
 * | content gap | `gap: { xs: 1.5, md: 3 }` | `gap-3 md:gap-6` |
 * | avatar overlap | `mt: { xs: -6, md: -9 }` | `-mt-12 md:-mt-[76px]` |
 * | avatar ↔ stats gap | `spacing={1.5}` | `gap-3` |
 * | info block gap | `Stack gap={1.5}` | `gap-3` |
 *
 * The overlap is the one number that is *not* legacy's: at `md` the avatar is 120 rather than
 * legacy's 120-inside-a-4px-ring, so `-76` leaves the same 44px of it below the cover's edge that
 * `-72` left of legacy's ringed 128. Derived, not guessed — but still the kind of thing `space.css`
 * would overrule, hence the marker on it.
 *
 * ## Avatar size: 80 → 120, and both are the DS's number
 *
 * This looked like a DS-versus-legacy conflict and is not one; see the note at the call site. The
 * Figma frame is the **mobile** frame, so `2xl` (80) is the phone value and the same proportion at
 * this column's 612 is 121.8 — which is what legacy draws on desktop.
 *
 * What is still genuinely missing from the DS: the 4px white ring legacy puts around the avatar, and
 * its live indicator. `Avatar/Status` is a status *dot* at four sizes with `online | busy | offline`,
 * which is not a ring and not `live`, so neither is invented here.
 */
export function ChannelHeader({
    channel,
    stats,
    /** The action row — owner or viewer, or a fixed-height placeholder while ownership is unknown. */
    actions,
    className,
}: {
    channel: Channel
    stats: Stats | null | undefined
    actions?: ReactNode
    className?: string
}) {
    const hasCover = Boolean(channel.images.cover)

    return (
        <section
            className={cn(
                'flex w-full flex-col',
                /*
                 * **A card only from `md`.** Below it the header takes no fill, no radius and no
                 * edge — it sits directly on the page background, which is the pattern every
                 * sub-page in this app already follows (`IDENTIFICATION_PANEL`:
                 * `md:rounded-2xl md:border md:bg-(--background-surface)`).
                 *
                 * It is the same idea as the width: below `md` the content *is* the page, so a
                 * surface fill draws a card edge where there is no edge — the column already reaches
                 * both sides of the screen. From `md` the column caps, a real edge exists, and the
                 * fill and the rounded top are what make it read as one.
                 *
                 * Only the top corners round, because **another surface continues below** — the tab
                 * strip, then the threads.
                 */
                'rounded-none md:rounded-t-[var(--radius-xl)] md:bg-(--background-surface)',
                // `overflow-hidden` is what makes that radius real: the cover fills the card's full
                // width with square corners of its own, so without a clip its top corners poke
                // through the rounded ones. Legacy gets this free from MUI's `Card`, which clips by
                // default — which is also why the bug is invisible when comparing the two side by side.
                'overflow-hidden',
                className,
            )}
        >
            <ChannelCover src={channel.images.cover} />

            <div className={cn('flex min-w-0 flex-col gap-3 md:gap-6', CHANNEL_PADDING)}>
                {/* `items-end` so the stats sit on the avatar's baseline rather than its middle. */}
                <div className="-mt-12 flex min-w-0 items-end gap-3 md:-mt-[76px]">
                    <AnimatedAvatar
                        size="2xl"
                        /**
                         * 80 on a phone, **120 from `md`** — and this is the DS value at both widths,
                         * not a compromise between the DS and legacy.
                         *
                         * The two looked like they disagreed: Figma's Space Detail draws `2xl` (80)
                         * while legacy draws 120 on desktop. But the Figma frame is **402 wide** — the
                         * mobile one — and 80/402 is 19.9% of it. Scaled to this column's 612 that is
                         * 80 × 612/402 = **121.8**, i.e. legacy's 120. Same design, measured at two
                         * frame widths; there was never a conflict to resolve, only a frame width to
                         * notice.
                         *
                         * Set through `className` rather than a new `3xl` on `Avatar`: 120 is not a
                         * size the DS ships, so inventing one there would put a number in `shared/ui`
                         * that Figma does not contain. What the override does not scale is the
                         * placeholder's 76px clip and 1.5px ring — visible only on an account with no
                         * picture at all, which is why it is an acceptable trade here and would not be
                         * inside the primitive.
                         */
                        className="md:size-[120px]"
                        thumb={channel.images.thumb}
                        avatarVideo={channel.images.avatar_video}
                        isPremium={channel.is_premium}
                        alt={channel.name ?? channel.slug}
                        initials={(channel.name ?? channel.slug).slice(0, 2).toUpperCase()}
                        // With no cover art the avatar is the largest image on screen, so it becomes
                        // the LCP candidate and has to be eager.
                        priority={!hasCover}
                    />
                    <ChannelStats channel={channel} stats={stats} />
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                    <ChannelIdentity channel={channel} />
                    <ChannelBio channel={channel} />
                </div>

                {actions}
            </div>
        </section>
    )
}
