'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { AppBarBadge } from '@shared/ui/app-bar'
import {
    CardUserHeader,
    CardUserHeaderHint,
    CardUserHeaderName,
    CardUserHeaderNameRow,
} from '@shared/ui/card-user-header'
import { Icon } from '@shared/ui/icon'
import type { Channel } from '../api/types'
import { ChannelCopyLink } from './channel-copy-link'
import { ChannelVerifiedMark } from './channel-verified-mark'

/**
 * Display name, badges, and the shareable link under it.
 *
 * Maps onto the DS Space Detail's `__info` head: `CardUserHeader[data-type="space"]` with its name
 * row and its link hint. `data-premium` paints the name with the brand gradient — see
 * `CardUserHeaderName` for why nothing may go *inside* the name element while that is on.
 *
 * ## The lock is not decoration
 *
 * Legacy puts a lock glyph before the name when the space is protected **or** unpublished. It is
 * the only affordance that tells an owner their space is not publicly visible while they are
 * looking at the otherwise-normal page, so it carries a translated label rather than being
 * `aria-hidden`.
 *
 * ## Every part disappears rather than rendering blank
 *
 * `if (!myChannel?.name) return null` in legacy, and the same for the link. A channel with no name
 * shows no name row — not an empty line that shifts the layout by one text height.
 */
export function ChannelIdentity({ channel }: { channel: Channel }) {
    const { t } = useTranslation()

    const isHidden = channel.privacy === 'protected' || channel.privacy === 'unpublished'
    const _verifiedImage = channel.verified_tick_badge?.image ?? null
    /**
     * Falls back to the handle, and the row always renders.
     *
     * This used to be `{channel.name && …}`, mirroring legacy's `if (!name) return null`. That was
     * safe while the bar held the `h1` and fell back to `@slug` itself; now that the heading lives
     * here, hiding the row would leave a channel with no display name — a real state, the field is
     * nullable — as a **document with no `h1` at all**. `@slug` is also simply the better thing to
     * show: it identifies the space, where an empty line identifies nothing.
     */
    const heading = channel.name ?? `@${channel.slug}`

    return (
        <CardUserHeader type="space" premium={channel.is_premium} className="w-full">
            <CardUserHeaderNameRow className="w-full">
                {isHidden && (
                    <Icon
                        name="lock-simple"
                        weight="filled"
                        size={20}
                        title={
                            channel.privacy === 'unpublished'
                                ? t('channel_state_unpublished_title')
                                : t('channel_state_protected_title')
                        }
                        className="flex-none text-(--text-subtitle)"
                    />
                )}
                {/*
                 * **The document's `h1`.** The bar used to hold it and no longer shows a title at
                 * all, so it belongs here — and this is the better home regardless: it is the
                 * page's actual subject at full width, not a copy of it truncated to fit between
                 * two buttons.
                 */}
                <CardUserHeaderName as="h1" type="space" premium={channel.is_premium}>
                    {heading}
                </CardUserHeaderName>

                {/*
                 * Shared with the top bar, which now writes the same name — see
                 * `channel-verified-mark.tsx` for the image-else-DS-mark rule and why the fallback
                 * exists at all.
                 */}
                <ChannelVerifiedMark channel={channel} size={18} />

                {channel.is_premium && (
                    <AppBarBadge size={18} aria-label={t('channel_premium')} role="img">
                        <Icon name="premium" weight="filled" size={24} />
                    </AppBarBadge>
                )}

                {/*
                 * Space-tier badge is **deliberately absent**. Figma draws it as one bespoke
                 * raster per level with the number baked in (App Bar/Level, 3464:21429, five
                 * variants), and `app-bar.css` says in writing that it is NOT the
                 * `level-hexagon` vector plus a text node — levels 2, 5 and 10 overflow the
                 * 22×24 box with their own offsets. Only level 1's art is reachable, so
                 * substituting a shape here would be inventing four of the five. Ship it when
                 * all five rasters and their offsets are in `design-system/`.
                 */}
            </CardUserHeaderNameRow>

            {channel.shareable_url && (
                /*
                 * A copy control, not a link — see `channel-copy-link.tsx`. The address here is the
                 * page you are already on, so there was never anywhere to navigate to; what people
                 * want off this row is the URL on their clipboard.
                 */
                <CardUserHeaderHint className="w-full">
                    <ChannelCopyLink url={channel.shareable_url} size={16} className="max-w-full" />
                </CardUserHeaderHint>
            )}
        </CardUserHeader>
    )
}
