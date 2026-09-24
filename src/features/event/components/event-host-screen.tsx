'use client'

import type { EventDetail } from '../api/types'
import { useEventReport } from '../hooks/use-event-report'
import { eventReportPath } from '../routes'
import {
    EventLiveAnalyticsCard,
    EventMaintenanceFeeCard,
    EventNewMembersCard,
    EventTotalRevenueCard,
} from './event-analytics-cards'
import { EventDescriptionCard } from './event-description-card'
import { EventHostInfoCard } from './event-host-info-card'
import { EventRevenueSummary } from './event-revenue-summary'

/**
 * The event page **as its host sees it** — a revenue report, not a viewer's page.
 *
 * ```
 * Live event              status · thumbnail · title · when it started
 * Revenue summary   →     live + interactive accordions; links to /report
 * Maintenance fee details the rate, and how many periods were charged
 * Live analytics          live id · type · start · peak CCU · viewers · durations
 * New members             +N, when there is a summary
 * Description             what the creator wrote
 * Total revenue           sticky at the foot
 * ```
 *
 * Legacy's order exactly (`creator/components/details`), including the two things that look like
 * mistakes and are not: **Description sits between the analytics and the total**, and **Total
 * revenue is last and sticky** — it is the figure the report exists to produce, so it stays on
 * screen while the reader scrolls the rows that justify it.
 *
 * ## Two queries, and each card reads its own state
 *
 * `useEventReport` runs the bill and the summary in parallel on two services. Legacy awaits them in
 * sequence behind one `isLoading`, so a failure of either hides the other's data — its own hook's
 * note says why that is not reproduced here.
 *
 * ## What a host does **not** get
 *
 * No watch panel, no access badge, no paywall, no share row. They cannot buy a ticket to their own
 * broadcast, and the app hand-off is not the answer to "how did this stream do". The one thing a host
 * *does* lose relative to legacy is the *Edit* / *Get QR code* / *Cancel* menu, which legacy hangs
 * off the **Live tab's** row rather than this page — `features/channel`'s `ChannelEventMenu` already
 * ports it there, which is where a creator reaches it from.
 */
export function EventHostScreen({ event }: { event: EventDetail }) {
    const code = event.code ?? ''
    const slug = event.channel?.slug ?? ''
    const report = useEventReport({ code, enabled: Boolean(code) })

    return (
        <>
            <EventHostInfoCard event={event} />

            <EventRevenueSummary
                bills={report.bills}
                live={report.live}
                interactive={report.interactive}
                isLoading={report.isBillLoading}
                isError={report.isBillError}
                onRetry={report.refetchBill}
                // A URL, not a callback: *Report details* is a route now. Withheld when either half
                // of the address is missing — a header that leads nowhere is not a link.
                reportHref={code && slug ? eventReportPath(slug, code) : undefined}
            />

            <EventMaintenanceFeeCard
                summary={report.summary}
                isLoading={report.isSummaryLoading}
                isError={report.isSummaryError}
                onRetry={report.refetchSummary}
            />

            <EventLiveAnalyticsCard
                event={event}
                summary={report.summary}
                isLoading={report.isSummaryLoading}
                isError={report.isSummaryError}
                onRetry={report.refetchSummary}
            />

            <EventNewMembersCard summary={report.summary} />

            <EventDescriptionCard description={event.description} />

            {/*
             * ⚠ **No wrapper around this one**, and that is load-bearing rather than tidiness.
             *
             * It had a `<div className="mt-auto">` around it, to push the card to the foot of a
             * short report. What that actually did was give the sticky element a containing block
             * exactly its own height — and a sticky box cannot travel outside its containing block,
             * so the range collapsed to zero and the card simply sat at the end of the document,
             * off-screen until you scrolled to it. Sticky with nowhere to stick looks identical to
             * static; nothing warns you. The card carries `mt-auto` itself now, so it is still the
             * last block pushed to the foot, while its containing block is this whole column — the
             * same arrangement legacy has, where the sticky card is a direct child of the stack that
             * holds all seven.
             *
             * A **state**, not a number. `formatRevenue(null)` is `$0`, and while the billing
             * request was in flight — or after it failed — this card was telling the creator in the
             * page's largest number that they had earned nothing. See the card's own note.
             */}
            <EventTotalRevenueCard state={report.totalState} onRetry={report.refetchBill} />
        </>
    )
}
