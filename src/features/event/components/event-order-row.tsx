'use client'

import { AvatarStill } from '@shared/components/avatar-still'
import { VerifiedBadge } from '@shared/components/verified-badge'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Link from 'next/link'
import type { EventOrder } from '../api/report-types'
import { formatEventDateTime } from '../lib/event-format'
import { formatRevenue, toAmount } from '../lib/event-revenue'

/**
 * One order in the **Report details** list: who (or what), when, and how much the creator earned.
 *
 * ## One row, where legacy has three components
 *
 * `tickets`, `gifts` and `games` are three ~140-line files that differ in **two** ways: games name a
 * `product` instead of a `user`, and the ticket list makes every row a link while the gift list
 * makes it look like one without being one (`cursor: pointer` on tickets, absent on gifts, though
 * both call `router.push`). Three copies of a money row is three places for a figure to be formatted
 * differently, so this is one row that reads whichever half of the payload is populated.
 *
 * ## The link is a real anchor, and only when there is somewhere to go
 *
 * Legacy puts `router.push` on the `<ListItem>`: not middle-clickable, no destination in the status
 * bar, invisible to anything that reads links. A game order has no slug at all, so it is not a link
 * in either client — here that is expressed by rendering a `<div>` rather than by an anchor whose
 * handler returns early.
 */
export function EventOrderRow({ order }: { order: EventOrder }) {
    const { t, currentLanguage } = useTranslation()

    const person = order.user
    const product = order.product
    // A ticket or a gift names a buyer; an interactive game names the thing that was bought.
    const name = person?.display_name ?? product?.name ?? t('event_order_unknown')
    const thumb = person?.thumb ?? product?.thumb ?? null
    const slug = person?.channel_slug ?? null

    const body = (
        <>
            <AvatarStill
                src={thumb}
                size="large"
                px={48}
                initials={name.slice(0, 2).toUpperCase()}
                className="flex-none"
            />

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1">
                    <span className="type-dense-strong min-w-0 truncate text-(--text-title)">
                        {name}
                    </span>
                    {person?.verifiedBadge && (
                        <VerifiedBadge image={person.verifiedBadge} size="dense" />
                    )}
                    {slug && (
                        <span className="type-caption-meta min-w-0 truncate text-(--text-placeholder)">
                            @{slug}
                        </span>
                    )}
                </span>
                {order.created_at && (
                    <time
                        dateTime={order.created_at}
                        // Local time, and the dialog is client-only — so unlike `EventSchedule` there
                        // is no server render to disagree with and no `suppressHydrationWarning`
                        // needed. See `lib/event-format.ts` for why the zone is the reader's.
                        className="type-caption-meta text-(--text-subtitle)"
                    >
                        {formatEventDateTime(order.created_at, currentLanguage)}
                    </time>
                )}
            </div>

            <span className="type-dense-strong flex-none tabular-nums text-(--text-title)">
                {formatRevenue(toAmount(order.net_amount), currentLanguage)}
            </span>

            {slug && (
                <Icon
                    name="angle-right"
                    size={16}
                    className="flex-none text-(--icon-secondary) rtl:-scale-x-100"
                />
            )}
        </>
    )

    const shell = cn(
        'flex min-w-0 items-center gap-3 border-b border-(--separator-default) px-4 py-3 last:border-b-0',
    )

    if (!slug) return <div className={shell}>{body}</div>

    return (
        <Link
            data-testid="event-order-link"
            href={`/@${encodeURIComponent(slug)}`}
            className={cn(shell, 'transition-colors hover:bg-(--background-subtle)')}
        >
            {body}
        </Link>
    )
}
