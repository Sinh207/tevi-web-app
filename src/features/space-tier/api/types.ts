import { z } from 'zod'

/**
 * `core/v3/channel/my-channel/space-tier/` and `report/v1/interaction/space-tier-estimate/`.
 *
 * Neither endpoint declares a response schema (core's OpenAPI says "No response body" for both
 * verbs), so the field list is legacy's — `components/spaceTier/index.js` reads exactly these.
 * Every field is optional and parsed leniently: the screen has a fallback for each, which is the
 * same posture legacy takes (`all_tiers?.length ? … : SPACE_TIERS`, `can_change || cooldownEnded`).
 */

/** Legacy's ladder, used when the payload carries none (`constant/index.js`'s `SPACE_TIERS`). */
export const FALLBACK_TIERS: readonly number[] = [0, 1, 2, 5, 10]

const tierNumber = z.coerce.number().int().nonnegative()

const tierList = z.array(z.unknown()).transform(rows =>
    rows.flatMap(row => {
        const parsed = tierNumber.safeParse(row)
        return parsed.success ? [parsed.data] : []
    }),
)

const wire = z.looseObject({
    space_tier: tierNumber.nullish().catch(null),
    all_tiers: tierList.nullish().catch(null),
    available_tiers: tierList.nullish().catch(null),
    tier_images: z.record(z.string(), z.unknown()).nullish().catch(null),
    can_change: z.boolean().nullish().catch(null),
    next_change_allowed_at: z.union([z.number(), z.string()]).nullish().catch(null),
})

export interface SpaceTierState {
    /** The tier the Space is on now. `0` when the payload omits it, as legacy defaults. */
    current: number
    /** The ladder to offer, in order. Never empty. */
    tiers: number[]
    /** Which of `tiers` this account may switch to. Tiers 5 and 10 need an unlock (BE-135). */
    available: number[]
    /** Badge art per tier, as the backend serves it. */
    images: Record<number, string>
    /** The backend's word on whether the 24h cooldown has passed. Can go stale; see `cooldownEndsAt`. */
    canChange: boolean
    /** Epoch ms the next change is allowed at, or `null` when there is no cooldown to show. */
    cooldownEndsAt: number | null
}

/**
 * An epoch, in ms. Legacy subtracts `Date.now()` from it directly, so the wire unit is
 * milliseconds; a value under 1e12 would be 2001 in ms and is read as seconds instead, and an ISO
 * string is accepted — a cooldown that renders as "Available in 00:00:00" forever is the failure
 * this is guarding against, and both of those shapes would produce it silently.
 */
function epochMs(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'string') {
        const asNumber = Number(value)
        if (Number.isFinite(asNumber)) return epochMs(asNumber)
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    if (!Number.isFinite(value) || value <= 0) return null
    return value < 1e12 ? value * 1000 : value
}

export function normalizeSpaceTier(body: unknown): SpaceTierState {
    const parsed = wire.safeParse(body)
    const data = parsed.success ? parsed.data : {}

    const images: Record<number, string> = {}
    for (const [key, url] of Object.entries(data.tier_images ?? {})) {
        const tier = Number(key)
        if (Number.isInteger(tier) && typeof url === 'string' && url) images[tier] = url
    }

    const tiers = data.all_tiers?.length ? [...new Set(data.all_tiers)] : [...FALLBACK_TIERS]

    return {
        current: data.space_tier ?? 0,
        tiers,
        available: data.available_tiers ?? [],
        images,
        canChange: data.can_change ?? false,
        cooldownEndsAt: epochMs(data.next_change_allowed_at),
    }
}

/**
 * The POST answers with the new state, but not all of it — legacy *merges* it over what it had
 * (`setMySpaceTier(prev => ({ ...prev, ...res.data.data }))`) because "the update endpoint omits
 * tier_images, all_tiers…". This is that merge, on the wire shape, so a missing field keeps the
 * previous value rather than falling back to a default.
 */
export function mergeSpaceTier(previous: unknown, update: unknown): unknown {
    const prev = previous && typeof previous === 'object' ? previous : {}
    const next = update && typeof update === 'object' ? update : {}
    return { ...prev, ...next }
}

const estimateWire = z.looseObject({
    estimates: z
        .array(
            z.looseObject({
                tier: tierNumber,
                revenue: z.coerce.number().nullish().catch(null),
            }),
        )
        .catch([]),
    based_on_days: z.coerce.number().int().positive().nullish().catch(null),
})

export interface SpaceTierEstimate {
    /** USD per month by tier. A tier absent from the map has no estimate. */
    revenueByTier: Record<number, number>
    /** The window the estimate is drawn from. Legacy's fallback is 30. */
    basedOnDays: number
}

export const ESTIMATE_WINDOW_FALLBACK_DAYS = 30

export function normalizeSpaceTierEstimate(body: unknown): SpaceTierEstimate {
    const parsed = estimateWire.safeParse(body)
    const revenueByTier: Record<number, number> = {}
    if (parsed.success) {
        for (const row of parsed.data.estimates) {
            if (typeof row.revenue === 'number' && Number.isFinite(row.revenue)) {
                revenueByTier[row.tier] = row.revenue
            }
        }
    }
    return {
        revenueByTier,
        basedOnDays:
            (parsed.success ? parsed.data.based_on_days : null) ?? ESTIMATE_WINDOW_FALLBACK_DAYS,
    }
}
