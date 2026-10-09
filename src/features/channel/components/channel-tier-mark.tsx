'use client'

import { VERIFIED_BADGE_TIER } from '@shared/components/verified-badge-size'
import { useTranslation } from '@shared/i18n/use-translation'
import { spaceTierBadge } from '@shared/lib/space-tier'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useState } from 'react'
import type { Channel } from '../api/types'

/* The dialog is code nobody pays for until the mark is pressed — `VerifiedBadge`'s arrangement. */
const ChannelTierDialog = dynamic(() =>
    import('./channel-tier-dialog').then(module => module.ChannelTierDialog),
)

/**
 * The space-tier mark beside a space's name on its own page — legacy's viewer and creator `Name`,
 * which pass `tier` and so make `BadgeSpaceTier` interactive (it opens `TierInfoModal`).
 *
 * **Interactive here, and only here**, the same split the verified tick makes: everywhere else the
 * mark sits inside somebody's link (a post header, a conversation row) and legacy passes
 * `showInfoModal={false}` at each of those.
 *
 * Sized by `VERIFIED_BADGE_TIER.title` — the name is a `title` heading and the tick beside it is
 * `size="title"`, so the three marks read level. Height only, width following the art: the marks
 * are not square. The tap target is an `after:` spill, as on the tick and the crown, so the row's
 * layout does not move.
 */
export function ChannelTierMark({
    channel,
    testId,
}: {
    channel: Pick<Channel, 'space_tier' | 'space_tier_image' | 'slug'>
    testId?: string
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [everOpened, setEverOpened] = useState(false)

    const image = spaceTierBadge(channel)
    if (!image) return null

    const tier = channel.space_tier ?? 0
    const height = VERIFIED_BADGE_TIER.title

    return (
        <>
            <button
                type="button"
                aria-label={t('channel_space_tier', { tier })}
                aria-haspopup="dialog"
                data-testid={testId}
                onClick={() => {
                    setEverOpened(true)
                    setOpen(true)
                }}
                className="relative inline-flex flex-none cursor-pointer rounded-md after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
                {/* The 2× box, not the drawn one — `PostHeader`'s tier mark says why. */}
                <Image
                    src={image}
                    alt=""
                    width={height * 2}
                    height={height * 2}
                    style={{ height }}
                    className="w-auto"
                />
            </button>
            {everOpened && (
                <ChannelTierDialog
                    open={open}
                    onOpenChange={setOpen}
                    image={image}
                    tier={tier}
                    slug={channel.slug}
                    testId={testId}
                />
            )}
        </>
    )
}
