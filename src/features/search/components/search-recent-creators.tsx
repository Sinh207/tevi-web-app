'use client'

import { toChannelPath } from '@features/channel'
import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { PremiumBadge } from '@shared/components/premium-badge'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import type { RecentCreator } from '@shared/lib/search-recent-creators'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import { SearchSectionHeader } from './search-section-header'

/**
 * **Recent creators** — the spaces this account opened from `/search`, as a row of faces.
 *
 * The Figma Search page's `Recents Creators` component: a 16/600 title, then 72px tiles 8 apart —
 * a 48 avatar, a 12/600 name with its tick, a 12/400 handle — each with a 14px ✕ disc on the
 * avatar's top-end corner. The brief: "Giới hạn hiển thị tối đa 5 creators" (the store caps it),
 * "Trên mobile → scroll ngang; desktop → wrap hàng".
 *
 * ## Scroll below `md`, wrap from `md`
 *
 * A native `overflow-x-auto` + `snap-x` row below `md` — a row you scroll sideways, not a carousel
 * (`docs/DESIGN_SYSTEM.md` §10). From `md` it wraps, which at five tiles of 72 inside a 612 column
 * means it simply never needs to.
 *
 * ## Two controls per tile, and they are siblings
 *
 * The tile is a link to the space; the ✕ forgets it. A button inside an `<a>` is invalid and
 * swallows clicks unpredictably, so the ✕ is positioned over the tile from *outside* the link. Its
 * visible disc is 14px as drawn, but the hit area is 24px (`before:` inset), which is the WCAG 2.2
 * target minimum. The label names the creator so five ✕ buttons are not five identical
 * announcements.
 *
 * Rendered only when there is something in it — the caller checks.
 */
export function SearchRecentCreators({
    creators,
    onOpen,
    onForget,
    className,
}: {
    /** Newest first, never empty. */
    creators: RecentCreator[]
    /** A tile was pressed — re-dates it. Navigation is the link's. */
    onOpen: (creator: RecentCreator) => void
    onForget: (slug: string) => void
    className?: string
}) {
    const { t } = useTranslation()

    return (
        <section aria-labelledby="search-recent-creators-heading" className={className}>
            <SearchSectionHeader
                id="search-recent-creators-heading"
                title={t('search_recent_creators')}
            />

            <ul
                className={cn(
                    'flex list-none snap-x scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 py-3 md:scroll-px-6 md:px-6',
                    '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    'md:flex-wrap md:overflow-visible',
                )}
            >
                {creators.map(creator => {
                    const label = creator.name || `@${creator.slug}`
                    return (
                        <li
                            key={creator.slug}
                            data-testid="search-recent-creator"
                            data-channel-slug={creator.slug}
                            className="relative w-18 flex-none snap-start"
                        >
                            <Link
                                data-testid="search-recent-creator-link"
                                href={toChannelPath(creator.slug)}
                                onClick={() => onOpen(creator)}
                                prefetch={false}
                                className="flex w-full min-w-0 flex-col items-center gap-1.25 rounded-(--radius-lg) no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                            >
                                <AnimatedAvatar
                                    size="large"
                                    thumb={creator.thumb}
                                    isPremium={creator.isPremium}
                                    alt=""
                                    initials={label.replace('@', '').slice(0, 2).toUpperCase()}
                                />
                                <span className="flex w-full min-w-0 flex-col items-center">
                                    <span className="flex w-full min-w-0 items-center justify-center gap-0.5">
                                        <span
                                            className={cn(
                                                'type-caption-label-strong min-w-0 truncate',
                                                creator.isPremium
                                                    ? '[background-image:var(--gradient-premium-name)] bg-clip-text text-transparent'
                                                    : 'text-(--text-title)',
                                            )}
                                        >
                                            {label}
                                        </span>
                                        <VerifiedBadge
                                            image={creator.verifiedImage}
                                            size={16}
                                            label={t('channel_verified')}
                                        />
                                        {creator.isPremium && (
                                            <PremiumBadge
                                                size={12}
                                                label={t('channel_premium')}
                                                className="flex-none"
                                            />
                                        )}
                                    </span>
                                    <span className="type-caption-meta w-full min-w-0 truncate text-center text-(--text-subtitle)">
                                        @{creator.slug}
                                    </span>
                                </span>
                            </Link>

                            {/*
                             * Over the avatar's top-end corner — the comp puts the disc at
                             * (49, 3) on a 72 tile whose 48 avatar starts at 12, i.e. hugging
                             * the avatar's edge rather than the tile's.
                             */}
                            <button
                                type="button"
                                data-testid="search-recent-creator-remove"
                                data-channel-slug={creator.slug}
                                aria-label={t('search_remove_recent_creator', { name: label })}
                                onClick={() => onForget(creator.slug)}
                                className="absolute top-0.5 end-2 flex size-3.5 cursor-pointer items-center justify-center rounded-(--radius-fill) bg-(--background-elevated) text-(--icon-default) shadow-xs outline-none before:absolute before:-inset-1.25 before:content-[''] hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)"
                            >
                                <Icon name="xmark" size={16} className="size-2.5" />
                            </button>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
