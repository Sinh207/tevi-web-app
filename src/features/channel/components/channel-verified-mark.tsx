'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { CardUserHeaderVerified } from '@shared/ui/card-user-header'
import Image from 'next/image'
import type { Channel } from '../api/types'

/**
 * The verified mark, wherever a channel's name is written.
 *
 * ## Two sources, one of which the DS cannot draw
 *
 * `verified_tick_badge` is an object carrying an **image URL** — the API can hand back bespoke art
 * per programme, so the mark is a CDN asset rather than a glyph. `CardUserHeaderVerified` (the DS's
 * `badge-check--duotone`) is the fallback for a channel that is verified but has no custom art.
 *
 * Legacy renders **nothing** in that second case, which loses the signal entirely on any verified
 * account the badge service has no picture for. The presence of the object is the fact; the image is
 * decoration on top of it.
 *
 * ## Why it is a component and not two lines inlined twice
 *
 * Because it is now written in two places — the header's identity block and the top bar — and this
 * feature has already had one glyph drift apart across three call sites in the same session. The
 * rule (image, else DS mark, else nothing) is the part that must not diverge; the size is the part
 * that legitimately differs, so that is the prop.
 */
export function ChannelVerifiedMark({
    channel,
    /** 18 beside the header's 20px name, 16 beside the bar's 16px title. */
    size = 18,
}: {
    channel: Channel
    size?: 16 | 18 | 20 | 22 | 24
}) {
    const { t } = useTranslation()
    const badge = channel.verified_tick_badge
    if (!badge) return null

    const label = t('channel_verified')

    return badge.image ? (
        <Image
            src={badge.image}
            alt={label}
            width={size}
            height={size}
            className="flex-none"
            style={{ width: size, height: size }}
        />
    ) : (
        <CardUserHeaderVerified title={label} size={size} />
    )
}
