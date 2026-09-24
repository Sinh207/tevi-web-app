'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { LIVE_BREATH } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Badge } from '@shared/ui/badge'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { EventDetail } from '../api/types'
import { formatEventDateTime } from '../lib/event-format'
import { eventStatusChip } from '../lib/event-status'
import { EventReportCard } from './event-report-card'

/**
 * **Live event** — the report's masthead: what state the broadcast is in, a thumbnail, its title and
 * when it started.
 *
 * Legacy's creator-side `info`, and it is deliberately **not** the viewer's `EventDetailsCard`: a
 * creator opening their own event came for the figures, so the art is a 123×64 thumbnail rather than
 * a full-bleed 16:9 hero, and there is no share row, no access badge and no paywall — they are the
 * one person who cannot buy a ticket to their own stream.
 *
 * That asymmetry is legacy's and it is right. The viewer's page leads with the art because the art
 * is the invitation; the report leads with the status because the report is a record.
 */
export function EventHostInfoCard({ event }: { event: EventDetail }) {
    const { t, currentLanguage } = useTranslation()
    const chip = eventStatusChip(event.status)
    const title = event.title ?? t('channel_event_untitled')
    const banner = event.images.banner
    /*
     * `start_at` — the **scheduled** time, and legacy's choice here.
     *
     * ⚠ This preferred `started_at` (when the stream actually went on air) until it was reviewed,
     * which put **two different timestamps on one screen with nothing to tell them apart**: this
     * masthead is unlabelled, and *Live analytics* four cards down prints `start_at` under the label
     * *Start time*. A broadcast that began twenty minutes late showed the host two times and no
     * explanation for either.
     *
     * The JSON-LD still prefers `started_at`, and that is not an inconsistency: its reader is a
     * machine asking "when did this happen", where precision is the whole point and there is no
     * second field beside it to contradict. Here the reader is a person comparing two cards.
     */
    const when = event.start_at

    return (
        <EventReportCard testId="event-host-info" title={t('event_live_event')}>
            <div className="flex min-w-0 items-center gap-3">
                {/* 123×64 is legacy's box. Written as a 16:9 width so the two agree at any density
                    rather than as two magic numbers that can drift apart. */}
                <div className="relative aspect-video w-[123px] flex-none overflow-hidden rounded-(--radius-md) border border-(--separator-default) bg-(--background-segment)">
                    {banner ? (
                        <Image src={banner} alt="" fill sizes="123px" className="object-cover" />
                    ) : (
                        <div className="flex size-full items-center justify-center text-(--text-placeholder)">
                            <Icon name="signal-stream" weight="filled" size={20} />
                        </div>
                    )}
                </div>

                {/*
                 * ⚠ **The status chip sits in this column, over the title — a deliberate divergence
                 * from legacy**, which puts it on its own row above the whole masthead.
                 *
                 * Legacy's placement makes the chip a property of the *card*; up there, with the
                 * card's own "Live event" heading directly above it and the thumbnail below, it
                 * reads as a second heading rather than as a label on anything. Beside the title it
                 * is what it actually is: the state of **this broadcast**, attached to the thing it
                 * describes. It also stops the masthead wasting a full row on a chip that is at most
                 * a dozen characters wide.
                 *
                 * The nesting is what keeps two spacings apart rather than averaging them: `gap-1`
                 * separates the chip from the block beneath it, and the inner column keeps legacy's
                 * `gap-0.5` between the title and its timestamp. One flat column would have had to
                 * pick one number and change the other pair.
                 *
                 * No `items-start` — the badge's own `w-fit` is what makes it hug. `items-start`
                 * would size every child to its content, and `truncate` on a content-sized box
                 * never truncates, so a long title would push the card open instead.
                 */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {chip && (
                        <Badge size="small" status={chip.status} className="w-fit">
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
                    )}

                    <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="type-dense-strong min-w-0 truncate text-(--text-title)">
                            {title}
                        </p>
                        {when && (
                            <time
                                dateTime={when}
                                /* The report is client-only (it needs a bearer), so unlike
                                   `EventSchedule` there is no server render to disagree with and no
                                   `suppressHydrationWarning` needed. */
                                className="type-caption-meta min-w-0 truncate text-(--text-subtitle)"
                            >
                                {formatEventDateTime(when, currentLanguage)}
                            </time>
                        )}
                    </div>
                </div>
            </div>
        </EventReportCard>
    )
}
