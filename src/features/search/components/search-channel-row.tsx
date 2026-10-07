'use client'

import { toChannelPath } from '@features/channel'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatCompactCount, formatExactCount } from '@shared/lib/format-count'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { type SearchChannel, searchChannelName } from '../api/types'

/**
 * One space in a search list — the Figma Search page's `User Info` row (56px tall, 12 apart).
 *
 * The product brief on that page, item by item:
 *
 * - **"Tăng kích thước avatar"** — the avatar slot is 56px. The avatar itself is the DS `large`
 *   (48) centred in it: the comp draws a 48 disc inside a 56 frame, the 4px of air being where a
 *   live ring would sit. `AnimatedAvatar` has no 56 rung, and stretching a 48 asset is worse than
 *   honouring the comp's own inset.
 * - **"Đưa Spacename + Verified badge – Premium badge + @username về cùng 1 hàng"** — one line,
 *   in that order. The marks are `flex-none`; the name and the handle both truncate, the handle
 *   twice as eagerly (`shrink-[2]`), because the name is what the reader is scanning for.
 * - **"Hiển thị số followers và số members"** — the second line. Neither endpoint sends a member
 *   count yet (see `member_count` in `api/types.ts`), so today the line is followers alone and the
 *   dot appears only once both halves exist.
 *
 * ## Not the DS `List/User Item` any more
 *
 * That row is 80px with a hairline between rows; this comp is 56px rows with a 12px gap and no
 * rule, so building it from `ListUserItem*` would mean overriding every measurement it has. The
 * geometry is the comp's: 24px side inset (`px-6`, set by the list), 12 between avatar and text, 4
 * between the two lines.
 *
 * ## The link wraps the row
 *
 * One `<a>` around everything — the row has one action, "go there". Legacy's `div` + `onClick` is
 * neither focusable nor middle-clickable. `prefetch={false}`: a paginated list of a hundred rows
 * would otherwise prefetch a hundred dynamic channel routes to open one.
 */
export function SearchChannelRow({
    channel,
    onOpen,
    /** Entrance delay in ms — the list staggers its first screen, see `SearchView`. */
    enterDelay = 0,
    testId,
    channelSlug,
}: {
    channel: SearchChannel
    /** Called on press — records the term and the creator. Navigation is the link's. */
    onOpen: () => void
    enterDelay?: number
    /** The row's `data-testid`, plus its identity in a companion attribute (docs/TEST_IDS.md). */
    testId?: string
    channelSlug?: string
}) {
    const { t, currentLanguage } = useTranslation()

    const name = searchChannelName(channel)
    const label = name || `@${channel.slug}`
    const verifiedImage = channel.verified_tick_badge?.image ?? null
    const followers = channel.follower_count
    const members = channel.member_count

    return (
        <li
            data-testid={testId}
            data-channel-slug={channelSlug}
            className="animate-[tevi-rise_240ms_cubic-bezier(0.32,0.72,0,1)_both] motion-reduce:animate-none"
            style={enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}
        >
            <Link
                data-testid="search-result-link"
                href={toChannelPath(channel.slug)}
                onClick={onOpen}
                prefetch={false}
                /*
                 * The hover wash bleeds 8px past the text column (`-mx-2 px-2`) so it reads as a
                 * row rather than a box hugging the avatar; the focus ring is inward for the reason
                 * the panel's `overflow-hidden` clips anything drawn outside its edge.
                 */
                className="-mx-2 flex min-w-0 items-center gap-3 rounded-(--radius-lg) px-2 no-underline outline-none transition-colors hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-ring)"
            >
                <span className="flex size-14 flex-none items-center justify-center">
                    <AnimatedAvatar
                        size="large"
                        thumb={channel.images.thumb}
                        avatarVideo={channel.images.avatar_video}
                        isPremium={channel.is_premium}
                        /* Decorative — the name is inside the same link. */
                        alt=""
                        initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                    />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-0.5">
                        <span
                            className={cn(
                                'type-dense-strong min-w-0 truncate',
                                channel.is_premium
                                    ? '[background-image:var(--gradient-premium-name)] bg-clip-text text-transparent'
                                    : 'text-(--text-title)',
                            )}
                        >
                            {label}
                        </span>
                        {/*
                         * 16 / 12 rather than the comp's 16 / 16: the verified PNG's tick fills 75%
                         * of its box and the crown's hexagon ~92%, so equal boxes draw the crown a
                         * third larger. Same 4:3 the channel header and the following strip use.
                         */}
                        <VerifiedBadge
                            image={verifiedImage}
                            size={16}
                            label={t('channel_verified')}
                        />
                        {channel.is_premium && (
                            <PremiumBadge
                                size={12}
                                label={t('channel_premium')}
                                className="flex-none"
                            />
                        )}
                        {/*
                         * Sensitive spaces only reach this row when the account opted in (or the
                         * service did not say), and then the mark is information, not decoration —
                         * hence `title`. `--accents-nsfw` is the DS token for this one fact.
                         */}
                        {channel.is_nsfw && (
                            <Icon
                                name="nsfw"
                                weight="filled"
                                size={16}
                                title={t('channel_nsfw')}
                                className="flex-none text-(--accents-nsfw)"
                            />
                        )}
                        <span className="type-dense-default ms-0.5 min-w-0 shrink-[2] truncate text-(--text-subtitle)">
                            @{channel.slug}
                        </span>
                    </span>

                    {(followers !== null || members !== null) && (
                        <span className="type-dense-default flex min-w-0 items-center gap-1 text-(--text-title)">
                            {followers !== null && (
                                <span
                                    className="truncate"
                                    title={formatExactCount(followers, currentLanguage)}
                                >
                                    {t('search_followers', {
                                        count: followers,
                                        formatted: formatCompactCount(followers, currentLanguage),
                                    })}
                                </span>
                            )}
                            {followers !== null && members !== null && (
                                <span
                                    aria-hidden="true"
                                    className="size-1 flex-none rounded-(--radius-fill) bg-(--icon-secondary)"
                                />
                            )}
                            {members !== null && (
                                <span
                                    className="truncate"
                                    title={formatExactCount(members, currentLanguage)}
                                >
                                    {t('search_members', {
                                        count: members,
                                        formatted: formatCompactCount(members, currentLanguage),
                                    })}
                                </span>
                            )}
                        </span>
                    )}
                </span>
            </Link>
        </li>
    )
}
