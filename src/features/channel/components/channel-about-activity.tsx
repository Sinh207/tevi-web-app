'use client'

import { AnimatedAvatar } from '@shared/components/animated-avatar'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import type { ChannelActivity } from '../api/types'
import { ACTIVITY_PAGE_SIZE, useChannelActivity } from '../hooks/use-channel-activity'
import { formatActivityDateTime } from '../lib/channel-format'
import { ChannelAboutCard, ChannelAboutCardTitle } from './channel-about-card'

/**
 * Recent memberships and donations — **my space only**.
 *
 * It names the people who paid, which is information for the creator and nobody else, so it is on the
 * owner's About tab in legacy and absent from the viewer's. The call site enforces that; this component
 * renders what it is given.
 *
 * ## An unrecognised `type` renders nothing at all
 *
 * Legacy maps exactly two values to copy — `NEW_MEMBERSHIP` → "Become a member", `DONATION` → "has
 * donated" — through a plain object lookup. Anything else yields `undefined` and the row prints a name
 * followed by blank space. Here the row is **skipped**: the feed is a courtesy block, and one
 * half-rendered line in it is worse than four rows instead of five. A backend that adds a third type
 * therefore degrades quietly rather than visibly, which is the trade worth naming.
 *
 * ## The row shape is legacy's
 *
 * 40px avatar, 12px gap, then a two-line column: the actor's name in 14/semibold followed by the
 * phrase in 14/regular, and the date under it in 12/regular muted. An earlier pass put the date at the
 * end of a single line and moved "Show more" up into the heading row. Both are reverted — the button
 * sits centred under the list, with the chevron legacy gives it.
 */
export function ChannelAboutActivity({ slug }: { slug: string }) {
    const { t, currentLanguage } = useTranslation()
    const { activities, isLoading, isError, hasMore, loadMore, isLoadingMore } = useChannelActivity(
        {
            slug,
        },
    )

    /** The two phrasings legacy knows. Anything else has no sentence, so it has no row. */
    function phrase(activity: ChannelActivity): string | null {
        switch (activity.type?.toUpperCase()) {
            case 'NEW_MEMBERSHIP':
                return t('channel_activity_became_member')
            case 'DONATION':
                return t('channel_activity_donated')
            default:
                return null
        }
    }

    const rows = activities.filter(activity => phrase(activity))

    // Silent on failure: this block is supplementary, and an error card for it would sit above the
    // creator's badges shouting about a feed they did not ask for.
    if (isError || (!isLoading && rows.length === 0)) return null

    return (
        <ChannelAboutCard className="flex flex-col gap-3 p-3">
            <ChannelAboutCardTitle>{t('channel_about_activity')}</ChannelAboutCardTitle>

            {isLoading ? (
                <ActivitySkeleton />
            ) : (
                <ul className="flex min-w-0 flex-col gap-3">
                    {rows.map((activity, index) => (
                        <li
                            /*
                             * The row carries no id of its own — the schema has `type`,
                             * `created_at` and an `actor`, and two donations from the same person
                             * in the same second are not distinguishable by any of them.
                             */
                            // biome-ignore lint/suspicious/noArrayIndexKey: append-only list — `useInfiniteQuery` concatenates pages, so no row ever changes position once rendered
                            key={`${activity.actor?.id}-${activity.created_at}-${index}`}
                            /*
                             * Staggered **within the page**, not across the whole list. Appending
                             * page three would otherwise start its first row at a 480ms delay and
                             * grow from there — by page five the reader is watching a queue. Modulo
                             * the page size, every batch arrives on the same four beats.
                             *
                             * Only the new `<li>`s animate: React keeps the existing ones mounted,
                             * and a CSS animation does not re-run on an element that never left.
                             */
                            className={`flex min-w-0 items-center gap-3 ${RISE}`}
                            style={riseDelay(index % ACTIVITY_PAGE_SIZE)}
                        >
                            <AnimatedAvatar
                                size="medium"
                                thumb={activity.actor?.avatar?.thumb ?? null}
                                /*
                                 * Never animated: the feed is a list of other people, and this
                                 * payload carries no clip or premium flag for them — passing
                                 * `false` is the honest answer rather than an omission.
                                 */
                                isPremium={false}
                                alt=""
                                initials={(activity.actor?.display_name ?? '?')
                                    .slice(0, 2)
                                    .toUpperCase()}
                            />
                            <div className="flex min-w-0 flex-1 flex-col">
                                <p className="type-dense-default min-w-0 truncate text-(--text-title)">
                                    <span className="type-dense-strong">
                                        {activity.actor?.display_name}
                                    </span>{' '}
                                    {phrase(activity)}
                                </p>
                                {/*
                                 * Full date **and clock time**. Every row here is somebody paying
                                 * the creator, so it reads as a receipt rather than as a social
                                 * timestamp, and the reader may be reconciling it against
                                 * something. Two earlier versions were both worse: the first threw
                                 * `created_at` away entirely, the second showed `Feb 20` and
                                 * dropped the year.
                                 */}
                                <time
                                    dateTime={activity.created_at ?? undefined}
                                    className="type-caption-meta text-(--text-placeholder)"
                                >
                                    {formatActivityDateTime(activity.created_at, currentLanguage)}
                                </time>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {hasMore && !isLoading && (
                /*
                 * Centred under the list, which is where legacy puts it. A button, not a scroll
                 * sentinel: this is a preview block inside an information tab, and an infinite list
                 * would grow it without end.
                 */
                <div className="flex justify-center">
                    <Button
                        data-testid="channel-activity-more"
                        variant="ghost"
                        size="small"
                        onClick={() => loadMore()}
                        disabled={isLoadingMore}
                    >
                        {/*
                         * The chevron turns while the page is in flight — 240ms, the app's one
                         * curve, so the press has an answer before the rows do. Legacy leaves it
                         * static and only disables the button, which on a slow connection reads as
                         * a dead control.
                         */}
                        <Icon
                            name="angle-down"
                            size={20}
                            className={`flex-none transition-transform duration-240 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                                isLoadingMore ? 'rotate-180' : ''
                            }`}
                        />
                        {t('channel_load_more')}
                    </Button>
                </div>
            )}
        </ChannelAboutCard>
    )
}

/** One page of rows — so the card does not resize when the real ones arrive. */
const SKELETON_ROWS = Array.from({ length: ACTIVITY_PAGE_SIZE }, (_, index) => index)

function ActivitySkeleton() {
    return (
        <ul className="flex min-w-0 flex-col gap-3">
            {SKELETON_ROWS.map(index => (
                <li key={index} className="flex min-w-0 items-center gap-3">
                    <Skeleton circle w={40} h={40} delay={index * 160} />
                    {/* 21 + 18: the two real lines, so the swap to content shifts nothing. */}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex h-[21px] items-center">
                            <Skeleton w="60%" delay={index * 160} />
                        </div>
                        <div className="flex h-[18px] items-center">
                            <Skeleton w={72} delay={index * 160} />
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    )
}
