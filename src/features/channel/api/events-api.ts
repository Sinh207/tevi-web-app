import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { z } from 'zod'

/**
 * The creator's own live events — the Live tab's data.
 *
 * `v4/events/`, not `v3`: this is the events service and it is on its own version line. Legacy keeps
 * it in `@models/events` for the same reason, and its other two methods (`getEvent` by code,
 * `cancelEvent`) belong to screens this feature does not have yet.
 *
 * **Owner-only by construction.** The endpoint answers "my events" for the bearer — there is no slug
 * in the path — which is why the Live tab exists on `my space` and nowhere else. A visitor has no way
 * to ask this question, so nothing here needs an ownership check.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/** Legacy's page size for this list. */
export const EVENTS_PAGE_SIZE = 12

export const eventKeys = {
    all: ['channel', 'events'] as const,
    list: (accountId: string | null, state: string) =>
        [...eventKeys.all, accountId ?? 'anon', state || 'any'] as const,
}

/**
 * The states legacy's filter offers, plus the ones only a card can be in.
 *
 * `status` and `state` are **different fields with overlapping vocabularies**, and legacy uses both:
 * `state` is the query parameter that filters the list, `status` is what comes back on each event and
 * drives its chip. `PUBLISHED` is the one that does not survive the trip — a published event reads as
 * "Coming soon" to its creator, because publishing is what schedules it.
 */
export const EVENT_STATUS = [
    'LIVE',
    'PUBLISHED',
    'PREPARING',
    'PAUSED',
    'ENDED',
    'CANCELLED',
] as const
export type EventStatus = (typeof EVENT_STATUS)[number]

const nullableText = z
    .unknown()
    .transform(v => (typeof v === 'string' && v.trim() ? v.trim() : null))
    .catch(null)

/**
 * `start_at` goes through the same millisecond/ISO normalisation the channel schema needed — see
 * `nullableTimestamp` in `types.ts` for why that exists at all. Duplicated rather than shared because
 * these are two services and neither is evidence for the other's wire format; if `v4/events/` turns
 * out to send ISO, this is where that gets recorded.
 */
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
        if (typeof value !== 'string' || !value.trim()) return null
        const date = new Date(value.trim())
        return Number.isNaN(date.getTime()) ? null : value.trim()
    })
    .catch(null)

export const channelEventSchema = z.looseObject({
    /** The share/deep-link identifier — `/@{slug}/event/{code}` in legacy. */
    code: nullableText,
    title: nullableText,
    start_at: nullableTimestamp,
    /**
     * When the stream actually went on air, as against `start_at`'s *scheduled* time.
     *
     * Legacy's home card prints this one, and it is the honest figure: a stream that starts twenty
     * minutes late otherwise advertises a time that has passed. `null` until it does — a scheduled
     * event has a `start_at` and no `started_at`.
     */
    started_at: nullableTimestamp,
    /**
     * What it costs to unlock, as a **decimal string** (`"3.00"`), in `price_currency` (`TVS`).
     *
     * A string on the wire and left one here: it is money, and `Number("3.00")` is a lossy step to
     * take in a schema when only the formatter needs it. `null` means the payload said nothing,
     * which is **not** the same as free — see `liveAccess`, where legacy conflates the two.
     */
    price: nullableText,
    /** Memberships that unlock this stream. Non-empty ⇒ members-only, whatever `price` says. */
    /**
     * ⚠ **Rows may be ids *or* objects, and dropping the objects silently opens the stream.**
     *
     * This filtered to `typeof id === 'string'`, so a payload carrying
     * `[{ id: '…' }]` — or `[{ package_id: '…' }]` — parsed to `[]`, and `liveAccess` then read a
     * members-only stream as an **open** one and drew no badge at all. Nothing throws and nothing
     * looks broken; the stream is simply advertised as free. It is the array trapdoor
     * `channelCategorySchema` is written up about, one field over: a per-element mismatch became
     * total data loss.
     *
     * So an element is reduced to an id whichever of the three shapes it arrives in, and only what
     * cannot be reduced is dropped. The **length** is all any caller reads, which is why this is
     * worth being generous about: one unparsed element is the difference between "members only" and
     * "free".
     */
    required_packages: z
        .unknown()
        .transform(v =>
            Array.isArray(v)
                ? v
                      .map(row => {
                          if (typeof row === 'string') return row.trim() || null
                          if (row && typeof row === 'object') {
                              const candidate =
                                  (row as { id?: unknown; package_id?: unknown }).id ??
                                  (row as { package_id?: unknown }).package_id
                              if (typeof candidate === 'string') return candidate.trim() || null
                              if (typeof candidate === 'number') return String(candidate)
                          }
                          return null
                      })
                      .filter((id): id is string => id !== null)
                : [],
        )
        .catch([]),
    /** The backend's own answer to "is this reader locked out". */
    need_unlock_package: z.unknown().transform(Boolean).catch(false),
    /** This reader has already paid for it. */
    purchased: z.unknown().transform(Boolean).catch(false),
    /**
     * Platforms this stream may **not** be watched on — `["Website"]` on a real payload.
     *
     * Legacy reads it in one place and turns it into a whole screen: the event page refuses to play
     * and shows `PlatformRestricted` instead. It does **not** filter lists on it, so the stream is
     * still advertised; see `isPlatformRestricted` for what this client does with that, and B74.
     */
    restricted_platforms: z
        .unknown()
        .transform(v => (Array.isArray(v) ? v.filter(p => typeof p === 'string') : []))
        .catch([]),
    /** The canonical share URL — `https://tevi.com/@{slug}/event/{code}/`. */
    shareable_url: nullableText,
    /** The short form — `https://tevi.com/e/{code}/`. Both are app-associated domains. */
    public_url: nullableText,
    /** Upper-cased here so no call site has to remember that the wire is not consistent. */
    status: z
        .unknown()
        .transform(v => (typeof v === 'string' ? v.trim().toUpperCase() : null))
        .catch(null),
    images: z
        .looseObject({ banner: nullableText })
        .catch({ banner: null })
        .transform(v => v ?? { banner: null }),
})

export type ChannelEvent = z.infer<typeof channelEventSchema>

export interface EventsPage {
    results: ChannelEvent[]
    count: number
}

/**
 * Rows that cannot be parsed are dropped, the page is not — the same rule the channel's `categories`
 * had to learn, where an array-level `.catch([])` turned one odd row into an empty list.
 */
function normalizeEvents(body: unknown): EventsPage {
    const raw = body as { results?: unknown; count?: unknown } | null
    const results = Array.isArray(raw?.results) ? raw.results : []
    return {
        results: results
            .map(row => channelEventSchema.safeParse(row))
            .filter(r => r.success)
            .map(r => r.data),
        count: typeof raw?.count === 'number' ? raw.count : 0,
    }
}

export const eventsApi = {
    /**
     * Cancels a published event. Answers the **updated event**, which is what lets the caller
     * replace one row rather than refetch the page — legacy does the same.
     */
    async cancelEvent(code: string, accountId?: string | null): Promise<ChannelEvent | null> {
        const body = await api.post<unknown>(
            `v4/events/${encodeURIComponent(code)}/cancel/`,
            undefined,
            accountId ? { accountId } : undefined,
        )
        const parsed = channelEventSchema.safeParse(body)
        return parsed.success ? parsed.data : null
    },

    async getEvents({
        page,
        state,
        accountId,
        signal,
    }: {
        page: number
        /** `''` means every state — legacy's "All". */
        state: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<EventsPage> {
        const body = await api.get<unknown>(
            'v4/events/',
            {
                page,
                page_size: EVENTS_PAGE_SIZE,
                state,
                // Newest first, legacy's default. Without it the service picks its own order and
                // "load more" can repeat rows across pages.
                ordering: '-created_at',
            },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeEvents(body)
    },
}

/**
 * The five filters legacy's menu offers, mapped to their label key.
 *
 * `''` is "All" — the absent filter, sent as an empty `state` parameter, which is what legacy does.
 * The keys are the wire values; do not localise them.
 */
export type EventState = '' | 'coming_soon' | 'preparing' | 'ended' | 'cancelled'

export const EVENT_STATES: Record<EventState, string> = {
    '': 'channel_live_state_all',
    coming_soon: 'channel_event_coming_soon',
    preparing: 'channel_event_preparing',
    ended: 'channel_event_ended',
    cancelled: 'channel_event_cancelled',
} as const

/** The public link for one event — the Share row copies it and the QR encodes it. */
export function eventShareUrl(slug: string, code: string): string {
    const origin = typeof window === 'undefined' ? '' : window.location.origin
    return `${origin}/@${encodeURIComponent(slug)}/event/${encodeURIComponent(code)}`
}
