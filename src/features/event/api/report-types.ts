import { z } from 'zod'

/**
 * The DTOs for the **creator's** view of one event — its bill, its analytics summary, and the
 * individual orders behind the money.
 *
 * Three endpoints on **three different services**, which is why they are one file rather than one
 * schema: they agree about nothing except the event code.
 *
 * | | endpoint | service |
 * |---|---|---|
 * | the bill | `GET billy/v5/billing/event-bill/{code}/` | billing |
 * | the analytics | `GET report/v1/event/{code}/summary/` | report |
 * | the orders | `GET billy/v1/ecom/event-orders/{code}/?kind=…` | billing (ecom) |
 *
 * ⚠ Three services also answer questions about a creator's money and it is easy to land on the
 * wrong one — `balanceApi`'s own doc names the trap. `/billy` is the wallet, `/report` is the
 * report, `/analytics` is the public stats block on a channel page.
 *
 * ## Every figure here is money, and every one of them is a **string** on the wire
 *
 * Left as strings through the schema and parsed only by the formatter. `Number("3.00")` is a lossy
 * step to take in a parser, and the one thing worse than an unformatted figure on a revenue screen
 * is a silently rounded one. `lib/event-revenue.ts` owns the arithmetic and states the precision
 * rule.
 *
 * Contract questions still open on all three: **B107**.
 */

const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** A figure that may arrive as a string or a number. Kept as a **string**, or `null`. */
const money = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** A count. `null` is *unknown*, which reads differently from `0` on a report. */
const count = z
    .unknown()
    .transform(value => {
        const n = typeof value === 'string' ? Number(value.trim()) : value
        return typeof n === 'number' && Number.isFinite(n) ? n : null
    })
    .catch(null)

const nullableTimestamp = z
    .unknown()
    .transform(value => {
        const raw =
            typeof value === 'number'
                ? value
                : typeof value === 'string' && /^\d+$/.test(value.trim())
                  ? Number(value.trim())
                  : null
        if (raw !== null) {
            if (!Number.isFinite(raw) || raw <= 0) return null
            const date = new Date(raw < 1e11 ? raw * 1000 : raw)
            return Number.isNaN(date.getTime()) ? null : date.toISOString()
        }
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed
    })
    .catch(null)

/** `{ amount, currency }` — the shape every nested figure on the bill arrives in. */
const amountObject = z
    .unknown()
    .transform(value => {
        if (!value || typeof value !== 'object') return null
        const row = value as { amount?: unknown; currency?: unknown }
        const parsed = money.safeParse(row.amount)
        return { amount: parsed.success ? parsed.data : null }
    })
    .catch(null)

/**
 * One line of a bill — *Tickets ×3, $60*.
 *
 * `type` is the wire vocabulary and the two halves of the bill use **different sets** of it:
 * the `LIVE` category sends `ticket` / `gift` / `consumables`, the `ACTION` category sends
 * `live_chat` / `view_cost`. Upper-casing is deliberately *not* done here — `lib/event-revenue.ts`
 * lower-cases at the comparison, exactly as legacy does, because the two vocabularies are matched
 * against literals rather than being a closed union.
 */
export const billLineSchema = z.looseObject({
    type: nullableText,
    quantity: count,
    /** The unit price — only `ticket` carries one, and only the ticket row prints it. */
    price: amountObject,
    /** The line total. ⚠ Falls back to `amount` — see `billLineTotal`. */
    subtotal: amountObject,
    amount: amountObject,
})

export type BillLine = z.infer<typeof billLineSchema>

/**
 * One category of the bill. **Two arrive** and they are found by `category`, not by index:
 * `LIVE` (tickets, gifts, interactive games) and `ACTION` (live chats, sustained viewers).
 */
export const eventBillSchema = z.looseObject({
    /** Upper-cased here because it is matched against `'LIVE'` / `'ACTION'` in one place. */
    category: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim().toUpperCase() : null))
        .catch(null),
    /** The subtotal before the fee and any MCN commission. */
    amount: money,
    /** The platform's cut. Printed as a negative. */
    fee: money,
    /** What the creator actually earns — the figure in the accordion header. */
    net_amount: money,
    bill_detail: z
        .unknown()
        .transform(value => {
            const row = (value ?? {}) as { revenue?: unknown; commission?: unknown }
            const revenue = Array.isArray(row.revenue)
                ? row.revenue
                      .map(line => billLineSchema.safeParse(line))
                      .filter(r => r.success)
                      .map(r => r.data)
                : []
            const mcn = (row.commission as { mcn?: unknown } | null | undefined)?.mcn
            const parsed = amountObject.safeParse(mcn)
            return { revenue, commissionMcn: parsed.success ? parsed.data : null }
        })
        .catch({ revenue: [], commissionMcn: null }),
})

export type EventBill = z.infer<typeof eventBillSchema>

/**
 * `report/v1/event/{code}/summary/` — the analytics block and the maintenance-fee count.
 *
 * Durations are **seconds** on the wire. Legacy converts with
 * `new Date(seconds * 1000).toISOString().substring(11, 19)`, which silently wraps at 24 hours —
 * a 25-hour stream reads as `01:00:00`. `formatDuration` in `lib/event-analytics.ts` does not.
 */
export const eventSummarySchema = z.looseObject({
    /** The highest number of concurrent viewers. */
    peak_ccu: count,
    /** Distinct viewers over the whole broadcast. */
    unique_view_count: count,
    /** How long the stream was on air, in **seconds**. */
    live_duration: count,
    /** Every viewer's watch time added together, in **seconds**. */
    total_view_duration: count,
    /** Memberships bought during the broadcast. */
    new_member_count: count,
    /** How many maintenance-fee periods were charged. Legacy's own field name. */
    go_live_total_display: count,
})

export type EventSummary = z.infer<typeof eventSummarySchema>

/**
 * One order behind the money — a ticket bought, a gift sent, an interactive game played.
 *
 * The **same row shape for all three kinds**, and the difference is which side of it is populated:
 * a ticket and a gift name a `user`, a game names a `product`. Legacy has three components that are
 * otherwise identical; here it is one row that reads whichever half is there
 * (`event-order-row.tsx`).
 */
export const eventOrderSchema = z.looseObject({
    /** What the creator earns from this one order. */
    net_amount: money,
    created_at: nullableTimestamp,
    user: z
        .unknown()
        .transform(value => {
            if (!value || typeof value !== 'object') return null
            const row = value as Record<string, unknown>
            const text = (key: string) => {
                const parsed = nullableText.safeParse(row[key])
                return parsed.success ? parsed.data : null
            }
            const avatar = (row.avatar ?? null) as { thumb?: unknown } | null
            const badge = (row.channel_verified_tick_badge ?? null) as { image?: unknown } | null
            return {
                display_name: text('display_name'),
                /** The buyer's space, so the row can link to it. `null` ⇒ not a link. */
                channel_slug: text('channel_slug'),
                thumb: typeof avatar?.thumb === 'string' ? avatar.thumb : null,
                verifiedBadge: typeof badge?.image === 'string' ? badge.image : null,
            }
        })
        .catch(null),
    product: z
        .unknown()
        .transform(value => {
            if (!value || typeof value !== 'object') return null
            const row = value as { name?: unknown; images?: { thumb?: unknown } | null }
            return {
                name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : null,
                thumb: typeof row.images?.thumb === 'string' ? row.images.thumb : null,
            }
        })
        .catch(null),
})

export type EventOrder = z.infer<typeof eventOrderSchema>

/**
 * The three order lists, and their wire values.
 *
 * `access` / `donation` / `consumable` are legacy's `kind` parameter verbatim — **do not localise
 * them and do not tidy them**: they are not the same words the tabs show (*Tickets* / *Gifts* /
 * *Interactive games*), and they are not the same words the bill's `type` field uses
 * (`ticket` / `gift` / `consumables`). Three vocabularies for three things, which is the API's
 * doing; the mapping lives here so nowhere else has to hold it.
 */
export const ORDER_KINDS = {
    tickets: 'access',
    gifts: 'donation',
    games: 'consumable',
} as const

export type OrderTab = keyof typeof ORDER_KINDS
export type OrderKind = (typeof ORDER_KINDS)[OrderTab]

/** Rows that cannot be parsed are dropped; the page is not. */
export function normalizeOrders(body: unknown): EventOrder[] {
    const raw = (body ?? {}) as { results?: unknown }
    const results = Array.isArray(raw.results) ? raw.results : []
    return results
        .map(row => eventOrderSchema.safeParse(row))
        .filter(r => r.success)
        .map(r => r.data)
}

/**
 * The bill, as the two categories it actually is.
 *
 * An **array** on the wire, found by `category` rather than by position — legacy does the same, and
 * it matters: a payload that lists `ACTION` first would otherwise put sustained-viewer earnings
 * under *Live revenue*.
 */
export function normalizeBill(body: unknown): EventBill[] {
    const rows = Array.isArray(body) ? body : []
    return rows
        .map(row => eventBillSchema.safeParse(row))
        .filter(r => r.success)
        .map(r => r.data)
}

/** `null` when the body does not describe a summary — the analytics card then draws *No data*. */
export function normalizeSummary(body: unknown): EventSummary | null {
    if (!body || typeof body !== 'object') return null
    const parsed = eventSummarySchema.safeParse(body)
    return parsed.success ? parsed.data : null
}
