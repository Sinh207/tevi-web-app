'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import Image from 'next/image'
import type { Channel } from '../api/types'
import { ChannelAboutCard, ChannelAboutCardTitle } from './channel-about-card'

/**
 * Claimed badges — identical on both surfaces.
 *
 * ## A centred row of 30px-tall marks, and no captions
 *
 * Legacy renders each badge as an image at `height: 30, width: auto` in a centred row at 8px gaps,
 * under a centred 16/bold "Badges". The titles are **not** drawn; `badge.title` is the `alt` and
 * nothing else.
 *
 * An earlier pass turned this into a 72px auto-fill grid of 48px marks with the title captioned under
 * each. It read better in isolation and it was not what the app draws — the marks are wordmarks with
 * their own lettering, so a caption under them says the same thing twice at two sizes. Reverted.
 *
 * `width={100} height={100}` with the size in CSS is legacy's own arrangement, and it is the right
 * one here: badge art is not square (a wordmark is wide), so a fixed box would letterbox it. Next
 * needs *some* intrinsic pair to reserve space, `h-[30px] w-auto` overrides both, and the
 * `max-w-none` is what stops the reset's `max-width: 100%` from squeezing a wide mark back down.
 */
export function ChannelAboutBadges({ channel }: { channel: Channel }) {
    const { t } = useTranslation()
    const badges = channel.claimed_badges.filter(badge => badge.image)

    if (badges.length === 0) return null

    return (
        <ChannelAboutCard className="flex flex-col items-center gap-3 p-3">
            <ChannelAboutCardTitle className="text-center">
                {t('channel_about_badges')}
            </ChannelAboutCardTitle>
            {/* `flex-wrap` is the one addition: legacy's row overflows once a creator claims enough. */}
            <ul className="flex min-w-0 flex-wrap items-center justify-center gap-2">
                {badges.map(badge => (
                    <li key={badge.image} className="flex items-center">
                        <Image
                            src={badge.image as string}
                            alt={badge.title ?? ''}
                            width={100}
                            height={100}
                            className="h-[30px] w-auto max-w-none"
                        />
                    </li>
                ))}
            </ul>
        </ChannelAboutCard>
    )
}
