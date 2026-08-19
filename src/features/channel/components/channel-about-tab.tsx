'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import type { ReactNode } from 'react'
import type { Channel } from '../api/types'
import { useMyChannel } from '../providers/my-channel-provider'
import { ChannelAboutActivity } from './channel-about-activity'
import { ChannelAboutBadges } from './channel-about-badges'
import { ChannelAboutDetails } from './channel-about-details'
import { ChannelAboutMcn } from './channel-about-mcn'
import { ChannelEmptyState } from './channel-empty-state'

/**
 * The About tab.
 *
 * ## The two surfaces do not show the same blocks
 *
 * This is a **swap point**, not a shared leaf, and missing that produced a real defect. Legacy:
 *
 * | block | my space (`creator/`) | your space (`viewer/`) |
 * |---|---|---|
 * | **Direct donate** | — | ✓ (first) |
 * | Details | ✓ | ✓ |
 * | **Activity feed** | ✓ | — |
 * | Badges | ✓ | ✓ |
 * | **MCN** | ✓ | — |
 *
 * An earlier version rendered one set for both, MCN included — so **every visitor saw the creator's
 * revenue split with their MCN**. Legacy reads those rates off `myChannel` and puts "Leave this MCN"
 * beside them: a management block for the person under the contract, not information about them.
 * Nothing crashes when it leaks, which is why it needed the two trees compared rather than assumed.
 *
 * Both owner-only blocks are also the two that name **other people** — the activity feed lists who paid
 * — or name **money**. That is the pattern behind the split, and the thing to check against when a
 * sixth block appears.
 *
 * ## Order is legacy's, and it differs between the two
 *
 * Owner: Details → Activity → Badges → MCN. Visitor: Direct donate → Details → Badges. The activity
 * feed sits *above* badges, not below — a creator opens this tab for who just paid, and the badges
 * are decoration they already know they have.
 *
 * ## Still missing
 *
 * **Direct donate** (visitor) is the one block with no counterpart here: it needs
 * `/core/v1/gifting/direct-donate/{slug}/` and a stars flow, which is the donation plan. The tab is
 * complete on the owner's side and one block short on the visitor's.
 */
export function ChannelAboutTab({
    channel,
    /** Selects which blocks this surface shows — see the table above. */
    isOwner,
}: {
    channel: Channel
    isOwner: boolean
}) {
    const { t } = useTranslation()
    const { myChannel } = useMyChannel()
    const mcn = myChannel?.mcn ?? null

    /**
     * Whether *anything* will render. Each block returns `null` on its own when it has no data, so
     * without this the tab would be an empty scroll area rather than an empty state — and the check
     * has to know which blocks this surface even asks for.
     *
     * The activity feed is excluded on purpose: it is fetched, so it cannot be known here, and a tab
     * that flashed "nothing here" before it arrived would be wrong more often than right.
     */
    const hasDetails =
        Boolean(channel.description) ||
        Boolean(channel.shareable_url) ||
        channel.social_links.length > 0 ||
        channel.categories.length > 0
    const hasBadges = channel.claimed_badges.some(badge => badge.image)
    /*
     * MCN comes from **`my-channel`**, not from the channel on screen: `channels/{slug}/` carries no
     * `mcn` field, so `channel.mcn` — which this used to read — was always `undefined` and the card
     * never rendered. See `channel-about-mcn.tsx`.
     *
     * `!is_owner` is legacy's condition, not a typo: the card is hidden from the creator who *runs*
     * the network. `ChannelAboutMcn` re-checks both — this copy exists so the empty state below can
     * tell whether anything will render.
     */
    const hasMcn = isOwner && Boolean(mcn) && !mcn?.is_owner

    if (!hasDetails && !hasBadges && !hasMcn && !isOwner) {
        return <ChannelEmptyState icon="info-circle" title={t('channel_about_empty')} />
    }

    /**
     * Filtered before it is mapped, so the stagger counts **visible** cards.
     *
     * Indexing the unfiltered array would delay a card by the position of blocks that render
     * nothing — a creator with no badges would watch their MCN card arrive on the beat where the
     * badges would have been, i.e. a pause with nothing in it.
     */
    const cards: { key: string; node: ReactNode }[] = [
        { key: 'details', node: hasDetails ? <ChannelAboutDetails channel={channel} /> : null },
        // Always rendered for an owner: it fetches, so whether it has rows is not known yet, and it
        // removes itself once it knows.
        { key: 'activity', node: isOwner ? <ChannelAboutActivity slug={channel.slug} /> : null },
        { key: 'badges', node: hasBadges ? <ChannelAboutBadges channel={channel} /> : null },
        { key: 'mcn', node: hasMcn ? <ChannelAboutMcn /> : null },
    ].filter(card => card.node !== null)

    return (
        // gap-3 — legacy's `<Stack spacing={1.5}>` on MUI's 8px unit. The tab panel owns the
        // padding (`CHANNEL_PADDING`), which is the same `p: { xs: 1.5, md: 3 }` legacy puts here.
        <div className="flex min-w-0 flex-col gap-3">
            {cards.map((card, index) => (
                /*
                 * The app's standard entrance, staggered — `RISE` / `riseDelay` from
                 * `shared/lib/motion`, i.e. the same 240ms `cubic-bezier(0.32, 0.72, 0, 1)` the
                 * menu drawer moves by. Not a new animation: the rule in that file is that
                 * everything which arrives uses one curve.
                 *
                 * On a wrapper rather than on the cards themselves, so a card never has to know it
                 * is being animated and the stagger index stays here with the ordering it belongs
                 * to. `motion-reduce` is handled inside `RISE`.
                 */
                <div key={card.key} className={RISE} style={riseDelay(index)}>
                    {card.node}
                </div>
            ))}
        </div>
    )
}
