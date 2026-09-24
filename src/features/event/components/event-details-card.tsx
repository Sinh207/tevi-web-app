'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { LIVE_BREATH } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import type { EventDetail } from '../api/types'
import { EVENT_CARD, EVENT_PADDING } from '../lib/container'
import { eventStatusChip } from '../lib/event-status'
import { EventActions } from './event-actions'
import { EventBanner } from './event-banner'
import { EventSchedule } from './event-schedule'

/**
 * The page's first block: the art, what state the stream is in, its title, when it starts, and the
 * three controls.
 *
 * Legacy's `viewer/components/details/info` — four sections separated by hairlines, in this order,
 * with the banner above them. The order is not arbitrary and is worth keeping: the **status** is
 * read first because it decides whether the rest is an invitation or a record, and it is the one
 * line that changes while the page is open.
 *
 * ## What was dropped from legacy's version, and why
 *
 * Its `Exclusive` / `Free` chip on the status row. It is redundant three ways over: the access badge
 * on the banner directly above already names the gate *and* its price, the watch panel below states
 * it a third time, and the chip's own condition in legacy is `isExclusive` — which is the tangled
 * predicate `@features/event/access` was written to replace, and which reads `true` for an ordinary
 * free stream whose payload omits `price`. Three labels for one fact, one of them wrong.
 */
export function EventDetailsCard({
    event,
    showAccess = true,
}: {
    event: EventDetail
    /** Forwarded to `EventBanner` — `false` on the host's own stream. See that prop. */
    showAccess?: boolean
}) {
    const { t } = useTranslation()
    const chip = eventStatusChip(event.status)
    const title = event.title ?? t('channel_event_untitled')

    return (
        <section className={cn('flex min-w-0 flex-col overflow-clip', EVENT_CARD)}>
            <EventBanner event={event} showAccess={showAccess} />

            {chip && (
                <>
                    <div className={cn('flex min-w-0 items-center', EVENT_PADDING, 'py-3 md:py-3')}>
                        <Badge size="small" status={chip.status} data-testid="event-status">
                            {/*
                             * A breathing dot on `LIVE` and nothing else — the same treatment, and
                             * the same shared keyframe, as the card that links here. Every other
                             * status is a fact about the past or the schedule; this one is the only
                             * thing on the page that is true *at this moment*, and a still red chip
                             * says exactly what the grey `Ended` chip says.
                             *
                             * `currentColor`, so it is the badge's own accent rather than a second
                             * red that has to be kept in step with it.
                             */}
                            {event.status === 'LIVE' && (
                                <span
                                    aria-hidden
                                    className={cn(
                                        'size-1.5 flex-none rounded-full bg-current',
                                        LIVE_BREATH,
                                    )}
                                />
                            )}
                            {t(chip.key)}
                        </Badge>
                    </div>
                    <hr className="border-(--separator-default)" />
                </>
            )}

            <div className={cn('flex min-w-0 flex-col gap-4', EVENT_PADDING)}>
                {/*
                 * The page's `<h1>`. `text-balance` because a creator-typed title runs long and
                 * breaking it evenly reads better than a two-word orphan line; `break-words`
                 * because one of them will eventually be a single unbroken 60-character string.
                 */}
                <h1 className="type-title-t1-semibold min-w-0 break-words text-balance text-(--text-title)">
                    {title}
                </h1>
                <EventSchedule startAt={event.start_at} />
            </div>

            <hr className="border-(--separator-default)" />

            <div className={cn(EVENT_PADDING)}>
                <EventActions event={event} />
            </div>
        </section>
    )
}
