'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { eventReportApi, eventReportKeys } from '../api/event-report-api'
import type { EventBill, EventSummary } from '../api/report-types'
import { billTotal, interactiveBill, liveBill } from '../lib/event-revenue'

/**
 * The creator's report for one event — **the bill and the analytics, as two independent queries.**
 *
 * ## Two queries, not one sequential pair
 *
 * Legacy's `useCreator` awaits them in order (`await getEventBill(); await getAnalyticsSummary()`)
 * behind a single `isLoading`, which costs two round trips end to end and makes either failure hide
 * the other's data: a 500 from the report service leaves the revenue cards on a skeleton although
 * the bill arrived. They are on different services and neither needs the other, so here they run in
 * parallel and each card reads its own state.
 *
 * That is also why there is no combined `isLoading` returned. The cards ask about what they draw —
 * `bill.isLoading` for the revenue summary, `summary.isLoading` for the analytics and the
 * maintenance fee — because a shared flag is what produced legacy's coupling in the first place.
 *
 * ## `enabled` is the ownership gate, and it is a **rendering** decision
 *
 * All three endpoints answer for the bearer about an event the bearer must own, so a stranger who
 * forced these queries would get a 403 — the backend is the guarantee. What this flag avoids is two
 * pointless requests on every visitor's page view, and a `'unknown'` ownership state issuing them
 * before the answer is in.
 */
export interface EventReport {
    /** Both categories, or `[]`. */
    bills: EventBill[]
    /** Tickets, gifts, interactive games — or `null` when the bill has no `LIVE` category. */
    live: EventBill | null
    /** Live chats and sustained viewers. */
    interactive: EventBill | null
    /**
     * Both `net_amount`s added — **only when the bill actually arrived**.
     *
     * ⚠ `null` here means *not a figure yet*, and the caller must not print it as `$0`. It covers
     * three cases that are all the same to a renderer and none of which is "earned nothing": the
     * request is in flight, the request failed, or it landed with no figure on either side
     * (`billTotal`). A real zero is `0`.
     *
     * This is the sharpest edge in the whole report. `formatRevenue(null)` answers `$0`, which is
     * right for a **line** inside a bill that arrived (a line with no figure earned nothing) and
     * catastrophic for the **headline**: a creator whose billing request 500s was being told, in the
     * page's largest number, that they made nothing. Read `totalState` instead of this.
     */
    total: number | null
    /** The same figure, with the two states a number cannot carry. What the headline reads. */
    totalState: TotalState
    summary: EventSummary | null
    isBillLoading: boolean
    isSummaryLoading: boolean
    isBillError: boolean
    isSummaryError: boolean
    /** Re-ask for the bill. The revenue summary's and the total's retry. */
    refetchBill: () => void
    /** Re-ask for the analytics. The analytics and maintenance-fee cards' retry. */
    refetchSummary: () => void
}

/**
 * What the headline figure is allowed to say, as a union rather than a nullable number.
 *
 * A union because the renderer has to tell three things apart that a `number | null` cannot:
 * `loading` (say nothing yet), `error` (say it failed), `ready` (print the money). The bug this
 * replaces is the middle one collapsing into a confident `$0`.
 */
export type TotalState =
    | { kind: 'loading' }
    | { kind: 'error' }
    | { kind: 'ready'; amount: number | null }

export function useEventReport({
    code,
    enabled = true,
}: {
    code: string
    enabled?: boolean
}): EventReport {
    const { activeId } = useAuth()

    const bill = useQuery({
        queryKey: eventReportKeys.bill(code, activeId),
        queryFn: ({ signal }) => eventReportApi.getBill({ code, accountId: activeId, signal }),
        enabled: enabled && Boolean(code),
    })

    const summary = useQuery({
        queryKey: eventReportKeys.summary(code, activeId),
        queryFn: ({ signal }) => eventReportApi.getSummary({ code, accountId: activeId, signal }),
        enabled: enabled && Boolean(code),
    })

    const bills = bill.data ?? []

    return {
        bills,
        live: liveBill(bills),
        interactive: interactiveBill(bills),
        total: billTotal(bills),
        totalState: bill.isLoading
            ? { kind: 'loading' }
            : bill.isError
              ? { kind: 'error' }
              : { kind: 'ready', amount: billTotal(bills) },
        summary: summary.data ?? null,
        isBillLoading: bill.isLoading,
        isSummaryLoading: summary.isLoading,
        isBillError: bill.isError,
        isSummaryError: summary.isError,
        refetchBill: () => void bill.refetch(),
        refetchSummary: () => void summary.refetch(),
    }
}
