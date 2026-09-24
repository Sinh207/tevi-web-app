'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { Skeleton } from '@shared/ui/skeleton'
import { useState } from 'react'
import type { EventBill } from '../api/report-types'
import {
    billLine,
    billLineTotal,
    formatQuantity,
    formatRevenue,
    toAmount,
} from '../lib/event-revenue'
import { EventCardState } from './event-card-state'
import { EventInfoDialog, SUSTAINED_VIEWERS_INFO } from './event-info-dialog'
import { EventReportCard } from './event-report-card'
import { EventRevenueAccordion, RevenueRow } from './event-revenue-accordion'

/**
 * **Revenue summary** — the two halves of the bill, and the way into the per-order report.
 *
 * Legacy's `revenueSummary`: a card whose header leads to *Report details* and whose body is the two
 * accordions. The header is the only way to the per-order report in either client — legacy opens a
 * modal, this navigates to `/report` (see `routes.ts` for why that is a route now).
 *
 * ## Two vocabularies, and the `LIVE` half is spelled out while `ACTION` is mapped
 *
 * The live half has exactly three known line types (`ticket`, `gift`, `consumables`) in a fixed
 * order, and its ticket row prints a **unit price** in the label — so it is written out, as legacy
 * does. The interactive half has an open set (`live_chat`, `view_cost`, and whatever the service
 * adds) so it is *mapped over the payload*, with a lookup for the two known labels and a fallback
 * that un-snake-cases the rest — again legacy's own behaviour (`item.type?.replace('_', ' ')`).
 *
 * ⚠ That fallback is `replace`, singular, in legacy: `some_long_type` becomes `some long_type`. Here
 * it is `replaceAll`.
 */
export function EventRevenueSummary({
    bills,
    live,
    interactive,
    isLoading,
    isError,
    onRetry,
    reportHref,
}: {
    bills: EventBill[]
    live: EventBill | null
    interactive: EventBill | null
    isLoading: boolean
    /**
     * The billing request failed — **not** "this broadcast earned nothing", which is a legitimate
     * answer and an empty array. Legacy has no error state here at all and shows its *No data*
     * panel for both; this port reproduced that until it was reviewed.
     */
    isError?: boolean
    onRetry?: () => void
    /**
     * Where the header leads — `/@{slug}/event/{code}/report`. A **URL**, where this took a callback
     * while the destination was a dialog; the card renders it as a real anchor.
     *
     * Optional so the `/dev/*` harness can draw the card without a route behind it. Absent, the
     * header is a heading and nothing more.
     */
    reportHref?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const [infoOpen, setInfoOpen] = useState(false)

    const labels = {
        subtotal: t('event_subtotal'),
        mcn: t('event_mcn_commission'),
        serviceFee: t('event_service_fee'),
    }

    const ticket = billLine(live, 'ticket')
    const gift = billLine(live, 'gift')
    const games = billLine(live, 'consumables')

    /** The two labels the interactive half is known to send. Anything else falls back. */
    const INTERACTIVE_LABELS: Record<string, string> = {
        live_chat: t('event_live_chats'),
        view_cost: t('event_sustained_viewers'),
    }

    return (
        <>
            <EventReportCard
                testId="event-revenue-summary"
                title={t('event_revenue_summary')}
                href={reportHref}
            >
                {isLoading ? (
                    <>
                        {/* Two 46px bars — the accordions' own summary height, so nothing shifts. */}
                        <Skeleton h={46} className="rounded-(--radius-md)" />
                        <Skeleton h={46} className="rounded-(--radius-md)" delay={160} />
                    </>
                ) : isError ? (
                    <EventCardState kind="error" onRetry={onRetry} />
                ) : bills.length === 0 ? (
                    /*
                     * ⚠ Legacy's condition is `eventBill ? … : <Nodata/>` on a value initialised to
                     * `[]` — and `[]` is truthy, so the *No data* branch is **unreachable**: an event
                     * that earned nothing renders two accordions of `$0` with no lines in them.
                     * `bills.length === 0` is the check that was meant.
                     *
                     * It is checked **after** `isError`, which is the ordering that matters: a failed
                     * request also yields `[]`, and reading that as "earned nothing" is the bug the
                     * error branch above exists to prevent.
                     */
                    <EventCardState kind="empty" />
                ) : (
                    <>
                        <EventRevenueAccordion
                            testId="event-live-revenue"
                            title={t('event_live_revenue')}
                            bill={live}
                            locale={currentLanguage}
                            labels={labels}
                        >
                            {/*
                             * The ticket label carries the **unit price** in parentheses — legacy's
                             * `Tickets [%s]` with `($60)` interpolated. It is the one line where the
                             * per-item figure is meaningful, because gifts and games each have many
                             * different prices.
                             */}
                            <RevenueRow
                                label={t('event_tickets_priced', {
                                    // Parenthesised at the call site, as legacy does: the key is
                                    // `Tickets {{price}}` and the brackets are punctuation around a
                                    // figure rather than part of the sentence, so a translator does
                                    // not have to carry them.
                                    price: `(${formatRevenue(
                                        toAmount(ticket?.price?.amount),
                                        currentLanguage,
                                    )})`,
                                })}
                                quantity={formatQuantity(ticket?.quantity, currentLanguage)}
                                value={formatRevenue(billLineTotal(ticket), currentLanguage)}
                            />
                            <RevenueRow
                                label={t('event_gifts')}
                                quantity={formatQuantity(gift?.quantity, currentLanguage)}
                                value={formatRevenue(billLineTotal(gift), currentLanguage)}
                            />
                            <RevenueRow
                                label={t('event_interactive_games')}
                                quantity={formatQuantity(games?.quantity, currentLanguage)}
                                value={formatRevenue(billLineTotal(games), currentLanguage)}
                            />
                        </EventRevenueAccordion>

                        <EventRevenueAccordion
                            testId="event-interactive-revenue"
                            title={t('event_interactive_revenue')}
                            bill={interactive}
                            locale={currentLanguage}
                            labels={labels}
                        >
                            {interactive?.bill_detail.revenue.map((line, index) => {
                                const key = line.type?.toLowerCase() ?? `line-${index}`
                                return (
                                    <RevenueRow
                                        key={key}
                                        label={
                                            INTERACTIVE_LABELS[key] ??
                                            line.type?.replaceAll('_', ' ') ??
                                            ''
                                        }
                                        quantity={formatQuantity(line.quantity, currentLanguage)}
                                        value={formatRevenue(billLineTotal(line), currentLanguage)}
                                        // The one line with an explainer, in legacy too: sustained
                                        // viewers is a mechanic nobody would guess from its name.
                                        onInfo={
                                            key === 'view_cost'
                                                ? () => setInfoOpen(true)
                                                : undefined
                                        }
                                        infoLabel={t('event_sustained_viewers_about')}
                                    />
                                )
                            })}
                        </EventRevenueAccordion>
                    </>
                )}
            </EventReportCard>

            <EventInfoDialog
                open={infoOpen}
                onOpenChange={setInfoOpen}
                title={t('event_sustained_viewers')}
                items={SUSTAINED_VIEWERS_INFO}
                testId="event-sustained-viewers-info"
            />
        </>
    )
}
