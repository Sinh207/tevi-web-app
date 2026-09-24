import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import {
    type EventBill,
    type EventOrder,
    type EventSummary,
    normalizeBill,
    normalizeOrders,
    normalizeSummary,
    type OrderKind,
} from './report-types'

/**
 * The **creator's** three reads for one event: the bill, the analytics, the orders.
 *
 * Two services, so two models — `report-types.ts` has the table and the warning about which of the
 * three money services answers what. Legacy splits these across `BillingModel`,
 * `AnalyticsReportModel` and `EcomModel` for the same reason.
 *
 * ## Owner-only, and enforced by the **backend**
 *
 * None of the three takes a slug or an owner id: each answers for the bearer, about an event the
 * bearer must own. So there is no client-side ownership check *in the request* — what
 * `useEventOwnership` decides is whether to **ask at all**, which is a rendering decision, not a
 * security one. A stranger who forced these queries would get a 403, and that is the guarantee that
 * matters.
 *
 * ## The account is pinned on every call
 *
 * `accountId`, for the reason `balanceApi` states at length: a reader with ten accounts must not get
 * whichever bearer happened to be active, filed under the key of the one they were looking at. This
 * is a creator's revenue, so that is not a stale-data annoyance — it is one person's earnings shown
 * under another person's name.
 *
 * **Never persisted.** No `cache: { persist: true }` anywhere here: a revenue report on the disk of
 * a shared device is the class of leak `interceptors/etag.ts` records as **B72**, and this payload is
 * more sensitive than the one that caused it.
 */
const billing = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })
const report = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/report` })

export const eventReportKeys = {
    all: ['event', 'report'] as const,
    bill: (code: string, accountId: string | null) =>
        [...eventReportKeys.all, 'bill', code, accountId ?? 'anon'] as const,
    summary: (code: string, accountId: string | null) =>
        [...eventReportKeys.all, 'summary', code, accountId ?? 'anon'] as const,
    orders: (code: string, kind: OrderKind, accountId: string | null) =>
        [...eventReportKeys.all, 'orders', code, kind, accountId ?? 'anon'] as const,
}

/**
 * Legacy's page size for the order lists, and it is **the whole list** rather than a first page:
 * `page: 1, page_size: 50`, no *load more* anywhere in its dialog. Kept as-is — a creator with more
 * than fifty ticket buyers on one broadcast sees the first fifty in both clients, and inventing
 * pagination here would be a behaviour change on a money screen with no design to back it. The
 * `count` the endpoint returns is deliberately not read, for the same reason.
 */
export const ORDERS_PAGE_SIZE = 50

export const eventReportApi = {
    /**
     * The bill — two categories, `LIVE` and `ACTION`. An **array**, not a page.
     *
     * `[]` for an event that earned nothing, which is an ordinary answer and not an error: a free
     * stream with no gifts has no bill. The card draws *No data* on it.
     */
    async getBill({
        code,
        accountId,
        signal,
    }: {
        code: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<EventBill[]> {
        const body = await billing.get<unknown>(
            `v5/billing/event-bill/${encodeURIComponent(code)}/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeBill(body)
    },

    /**
     * The analytics summary. `null` when the body does not describe one — which is the *normal*
     * answer for an event that has not gone on air yet, and is why the analytics and maintenance-fee
     * cards each draw *No data* rather than an error.
     */
    async getSummary({
        code,
        accountId,
        signal,
    }: {
        code: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<EventSummary | null> {
        const body = await report.get<unknown>(
            `v1/event/${encodeURIComponent(code)}/summary/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeSummary(body)
    },

    /** One of the three order lists. `kind` is the wire value — see `ORDER_KINDS`. */
    async getOrders({
        code,
        kind,
        accountId,
        signal,
    }: {
        code: string
        kind: OrderKind
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<EventOrder[]> {
        const body = await billing.get<unknown>(
            `v1/ecom/event-orders/${encodeURIComponent(code)}/`,
            { page: 1, page_size: ORDERS_PAGE_SIZE, kind },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeOrders(body)
    },
}
