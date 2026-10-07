'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { LiveRing } from '@shared/components/live-ring'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import type { ReactNode } from 'react'
import type { Channel, ChannelStats as Stats } from '../api/types'
import { isChannelLive } from '../lib/channel-live'
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
 * | avatar overlap | `mt: { xs: -6, md: -9 }` | `-mt-9 md:-mt-[76px]` |
 * | avatar ↔ stats gap | `spacing={1.5}` | `gap-3` |
 * | info block gap | `Stack gap={1.5}` | `gap-3` |
 *
 * The overlap is the one number that is *not* legacy's: at `md` the avatar is 120 rather than
 * legacy's 120-inside-a-4px-ring, so `-76` leaves the same 44px of it below the cover's edge that
 * `-72` left of legacy's ringed 128. `xs` now says the same thing in its own numbers — `-36` of an
 * 80px avatar is that same 44 — where it used to copy legacy's *lift* and inherit 32px of room for
 * a block that needs 45. Derived, not guessed — but still the kind of thing `space.css` would
 * overrule, hence the marker on it.
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
    /**
     * Passed straight through to `ChannelBio`, which is the only part of this header that behaves
     * differently for the creator: the NSFW row offers them the appeal. Everything else in here is
     * the same markup for everybody — the *actions* are how ownership shows up, and those arrive
     * already composed.
     */
    isOwner = false,
    /**
     * A sensitive space whose gate has not been satisfied: the **art and the creator's own
     * content** are withheld — cover, avatar, the description and every link (`ChannelBio`'s
     * `withheld`). What still renders is the identity — name, handle, the space's own address, the
     * follower count. Those are not the sensitive part, and hiding them was what made the old dialog
     * leave a visitor unsure they had the right URL.
     */
    blurred = false,
    className,
}: {
    channel: Channel
    stats: Stats | null | undefined
    actions?: ReactNode
    isOwner?: boolean
    blurred?: false | 'soft' | 'strong'
    className?: string
}) {
    const { t } = useTranslation()
    const hasCover = Boolean(channel.images.cover)
    /** One of the space's events is on air — see `isChannelLive` for what legacy gets wrong here. */
    const isLive = isChannelLive(channel)

    const avatar = (
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
            /*
             * Legacy's `border: 4px solid white`, which is not decoration: the avatar
             * straddles the cover, so without it a photo with a light corner and a
             * light-shirted portrait run into each other.
             *
             * A **ring**, not a border, because a border would be inside the box
             * (`box-sizing: border-box` everywhere) and eat 8px of a size the DS
             * measured — 80 would draw a 72px portrait. The ring paints outside and
             * takes no layout, so the avatar stays 80/120 and the stats keep the
             * alignment set above.
             *
             * Not literally white: it reads as a cut-out of the header the avatar
             * sits on, which paints `--background-surface` at every width (full-bleed
             * below `md`, a card from it). One token, which inverts for dark mode
             * where legacy's literal white would glare. It read `--background` below
             * `md` from when the phone header sat on the page ground — a grey disc
             * round the face once the header was painted.
             */
            className={cn(
                'md:size-[120px]',
                // Live, `LiveRing` draws the cut-out itself — its gap is this ring.
                !isLive && 'ring-4 ring-(--background-surface)',
                /*
                 * The portrait, not the box: `[&_img]` / `[&_video]` reach inside so
                 * the ring, the Premium mark and the live badge stay sharp. Blurring
                 * the element itself would smear the cut-out ring into the cover
                 * behind it and read as a rendering fault rather than as withheld
                 * art. Cosmetic, as on the cover — `thumb` is already a thumbnail,
                 * so there is no full-size original on the page to recover.
                 */
                blurred === 'strong' && '[&_img]:blur-md [&_video]:blur-md',
                // Half the cover's, because the avatar is a fifth of its size — the
                // same radius on a 80px circle erases it entirely.
                blurred === 'soft' && '[&_img]:blur-[3px] [&_video]:blur-[3px]',
            )}
            thumb={channel.images.thumb}
            avatarVideo={channel.images.avatar_video}
            isPremium={channel.is_premium}
            alt={channel.name ?? channel.slug}
            initials={(channel.name ?? channel.slug).slice(0, 2).toUpperCase()}
            // With no cover art the avatar is the largest image on screen, so it becomes
            // the LCP candidate and has to be eager.
            priority={!hasCover}
        />
    )

    return (
        <section
            className={cn(
                'flex w-full flex-col',
                /*
                 * **The fill is the phone's too; only the card is `md:`.** Below the breakpoint the
                 * surface runs edge to edge with no radius and no border — the page *is* the space,
                 * so it is painted in the space's colour rather than left on the app's grey ground.
                 * From `md` the column caps and the rounded top is what turns that fill into a card.
                 *
                 * It read `md:bg-(--background-surface)` for a while, which left a phone showing the
                 * page ground behind the header while every band under it (the tab strip, the walls,
                 * the gate) painted its own — so the page looked assembled from mismatched parts,
                 * and the 6px section rule had nothing to separate.
                 *
                 * Only the top corners round, because **another surface continues below** — the tab
                 * strip, then the threads.
                 */
                'rounded-none bg-(--background-surface) md:rounded-t-[var(--radius-xl)]',
                // `overflow-hidden` is what makes that radius real: the cover fills the card's full
                // width with square corners of its own, so without a clip its top corners poke
                // through the rounded ones. Legacy gets this free from MUI's `Card`, which clips by
                // default — which is also why the bug is invisible when comparing the two side by side.
                'overflow-hidden',
                className,
            )}
        >
            <ChannelCover src={channel.images.cover} blurred={blurred} />

            <div className={cn('flex min-w-0 flex-col gap-3 md:gap-6', CHANNEL_PADDING)}>
                {/*
                 * `items-end` so the stats sit on the avatar's baseline rather than its middle.
                 *
                 * Which makes the avatar's lift a **constraint on the stats**, not a free choice:
                 * the row's only part below the cover is `avatar − lift`, and the stats hang from
                 * its bottom. `md` had 120 − 76 = 44px for a 45px block, and that one pixel of
                 * overshoot is invisible — the number is an inline box inside a 24px line box, so
                 * it still paints 2px clear of the cover. Mobile had 80 − 48 = 32px for the same
                 * block, and 13px of overshoot is not invisible: the figures were drawn 10px up
                 * into the cover art, which is the bug this fixes.
                 *
                 * So the two are set to leave the **same 44px** below the cover — 80 − 36 and
                 * 120 − 76 — and the stats land 2px under the edge at either width. Deliberately
                 * expressed that way rather than as a clearance: the block's height depends on the
                 * type scale, so matching the room makes the two breakpoints agree whatever the
                 * type does next.
                 *
                 * Measured in a browser, not derived. The obvious arithmetic — line box against
                 * cover edge — says `md` overlaps by 1px and should have been reported too; it
                 * does not, because the glyphs sit inside the leading.
                 */}
                <div className="-mt-9 flex min-w-0 items-end gap-3 md:-mt-[76px]">
                    {/*
                     * `relative` and nothing else — the wrapper exists only so the live ring and
                     * its pill can hang off the avatar, and it must not become a layout box of its
                     * own: `flex` keeps it at the avatar's exact size so `items-end` above still
                     * aligns the stats to the portrait rather than to a taller container.
                     */}
                    <div className="relative flex shrink-0">
                        {isLive ? (
                            /*
                             * Live: Figma's live ring (`LiveRing`, shared with the live studio's
                             * phone notice) in place of legacy's red border and Lottie flag — the
                             * gradient ring turning, its gap the same cut-out as the plain ring, and
                             * the `Live` pill on its foot. Thicker from `md`, where the face is 120.
                             *
                             * The label is `channel_event_live`, reused rather than duplicated: the
                             * space is live *because an event is*, so a second key would be the same
                             * word translated twice into nine locales and free to drift.
                             */
                            <LiveRing
                                label={t('channel_event_live')}
                                className="md:[--live-gap:4px] md:[--live-ring:4px]"
                            >
                                {avatar}
                            </LiveRing>
                        ) : (
                            avatar
                        )}
                    </div>
                    <ChannelStats channel={channel} stats={stats} />
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                    <ChannelIdentity channel={channel} />
                    {/* `strong` only: a closed space (`soft`) is behind a door, not withholding
                        anything the creator wrote. See `ChannelBio`'s `withheld`. */}
                    <ChannelBio
                        channel={channel}
                        isOwner={isOwner}
                        withheld={blurred === 'strong'}
                    />
                </div>

                {actions}
            </div>
        </section>
    )
}
