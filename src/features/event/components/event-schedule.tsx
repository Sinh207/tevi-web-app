'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Icon } from '@shared/ui/icon'
import { formatEventDate, formatEventTime } from '../lib/event-format'

/**
 * When the stream is — a calendar tile beside the day over the clock time.
 *
 * Legacy's block, geometry included: a 36px outlined square holding a 20px calendar glyph, then
 * `MMM d, yyyy` in strong text over `HH:mm` in secondary. The two lines are the point — *which day*
 * and *what time* are read separately, and one run of `Feb 20, 2026, 14:30` makes the reader parse
 * the whole string to find either.
 *
 * ## `suppressHydrationWarning`, and it is declared rather than papered over
 *
 * The time is formatted in the **reader's** zone (see `lib/event-format.ts` for why it is not
 * pinned to UTC — this is an appointment, not a historical date). This page is server-rendered, so
 * the HTML necessarily carries the server process's zone and the browser then computes the reader's.
 * That is a mismatch by construction, not a bug to be fixed, and it is exactly what this attribute
 * is for: React keeps the client's value and stops warning about the difference.
 *
 * What makes it safe is the `<time dateTime>` beside it. The **machine-readable** value is the ISO
 * timestamp, which is identical on both sides, so a scraper, a screen reader following the element,
 * and *Add to calendar* all read the truth regardless of which zone rendered the visible text.
 *
 * The alternative — render nothing until mount — costs a layout shift on the one row a reader
 * actually came for, on every visit, to avoid a discrepancy that lasts one paint.
 *
 * Renders **nothing** when there is no usable date: `formatEventDate` answers `''` rather than
 * `'Invalid Date'` precisely so the whole row can be dropped.
 */
export function EventSchedule({ startAt }: { startAt: string | null }) {
    const { t, currentLanguage } = useTranslation()
    const date = formatEventDate(startAt, currentLanguage)
    const time = formatEventTime(startAt, currentLanguage)

    if (!date) return null

    return (
        <div className="flex min-w-0 items-center gap-2">
            {/*
             * An outlined tile rather than `ListLeadingTile`'s filled one: that component paints a
             * status colour, and a schedule is not a status. Legacy draws the same neutral square.
             */}
            <span
                aria-hidden
                className="flex size-9 flex-none items-center justify-center rounded-(--radius-md) border border-(--separator-default) text-(--icon-secondary)"
            >
                <Icon name="calendar" size={20} />
            </span>
            <div className="flex min-w-0 flex-col">
                {/*
                 * One `<time>` around both lines, so the ISO value is stated once for the moment
                 * they jointly describe. `dateTime` takes the raw timestamp — `startAt` is already
                 * normalised to ISO by `eventDetailSchema`, which is what makes it a valid value
                 * here whether the wire sent epoch milliseconds or a string.
                 */}
                <time
                    dateTime={startAt ?? undefined}
                    suppressHydrationWarning
                    className="type-dense-strong text-(--text-title)"
                >
                    {date}
                </time>
                {time && (
                    <span
                        suppressHydrationWarning
                        className="type-dense-default text-(--text-subtitle)"
                    >
                        {time}
                    </span>
                )}
            </div>
            {/* Named for a screen reader that meets the tile with no adjacent label. */}
            <span className="sr-only">{t('event_starts_at')}</span>
        </div>
    )
}
