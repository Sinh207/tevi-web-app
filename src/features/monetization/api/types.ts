import { z } from 'zod'

/**
 * The **creator's** side of membership — the tier they sell, and who is paying for it.
 *
 * Two payloads, both from billy (`v3/subscription/my-packages/` and
 * `v3/subscription/my-channel-subscriptions/`), and neither is the same shape as
 * `features/membership`'s. That feature reads the *reader's* side and its own barrel says so in
 * writing: *"It is not the creator's side of membership (`my-packages/`, `benefits/`,
 * `my-channel-subscriptions/` — those belong to the monetization hub … and no feature here owns them
 * yet)"*. This is that owner.
 *
 * ## Why the DTOs are not shared with `features/membership`
 *
 * They look alike and they are not the same object. `membershipPackageSchema` there models a tier as
 * a **buyer** sees it — the space selling it, the pitch, the price list — and this one models a tier
 * as its **owner** sees it, which adds `sharable_url` (what the Share action needs) and drops
 * `channel` (the owner is the reader). More to the point, sharing would mean importing another
 * feature's barrel for a shape, which is the dependency this repo's boundary rules exist to prevent:
 * a rename on the buying side would then break the selling side for no reason connected to it.
 *
 * The **subscriber** row has no counterpart there at all: `my-subscriptions/` nests `channel` (who I
 * pay), and `my-channel-subscriptions/` nests `user` (who pays me).
 *
 * ## Parsed per field, never thrown
 *
 * The house rule (`features/channel`, `features/donation`, `features/membership` all state it): a
 * `.catch()` per field, so a renamed key costs one line of one row rather than the screen.
 * `looseObject` keeps everything this file does not model — `benefits`, the Stripe half, and
 * whatever the creator dashboard grows next.
 *
 * Field names are legacy's, which is the contract until the API team confirms one — **B103** in
 * [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md) is the open list.
 */

/** The two `status` values the members list filters on. Legacy sends exactly these strings. */
export const SUBSCRIBER_STATUSES = ['active', 'expired'] as const
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number]

/** A string that is present and non-blank, else `null`. `''` is not a name or a URL. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** Upper-cased, for currency codes — the wire is inconsistent about their case (B44). */
const currencyText = z
    .unknown()
    .transform(value => (typeof value === 'string' ? value.trim().toUpperCase() || null : null))
    .catch(null)

/** Ids arrive as a string or a number depending on the service. Normalise to string. */
const id = z.union([z.string(), z.number()]).transform(String).catch('')

/** A money amount that may arrive as a number **or** as a decimal string (`"5.00"`). */
const numeric = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0
        if (typeof value !== 'string') return 0
        const parsed = Number.parseFloat(value.trim())
        return Number.isFinite(parsed) ? parsed : 0
    })
    .catch(0)

/**
 * A moment in time, normalised to an ISO 8601 string — or `null`.
 *
 * Epoch numbers are accepted defensively, for the reason `features/membership`'s own timestamp
 * parser writes down at length: `core` sends epoch **milliseconds as a JSON number** for
 * `created_at`, and a string-only parser silently dropping a date has already shipped in this repo
 * once. The next-charge date is the most useful thing on a member row, so a quiet `null` is the
 * expensive failure.
 */
const nullableTimestamp = z
    .unknown()
    .transform(value => {
        if (typeof value === 'string') {
            const trimmed = value.trim()
            if (!trimmed) return null
            const parsed = new Date(trimmed)
            return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            // Seconds or milliseconds — anything below ~1e11 cannot be a plausible ms timestamp.
            const ms = value < 1e11 ? value * 1000 : value
            const parsed = new Date(ms)
            return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
        }
        return null
    })
    .catch(null)

/** One entry of a package's `prices` array. Legacy writes two: `TVS` (Star) and `USD`. */
export const packagePriceSchema = z.looseObject({
    id: nullableText,
    amount: numeric,
    amount_currency: currencyText,
})

export type PackagePrice = z.infer<typeof packagePriceSchema>

/**
 * The tier this creator sells — one row of `my-packages/`.
 *
 * **`sharable_url` is legacy's spelling**, with one `e` missing, and it is kept verbatim: it is a
 * wire key, not a word. Correcting it here would silently produce `undefined` and a Share action
 * that copies nothing — the class of failure this whole file's per-field parsing exists to avoid.
 * Whether the API also serves `shareable_url` is **B103**.
 */
export const myPackageSchema = z.looseObject({
    id,
    name: nullableText,
    description: nullableText,
    /** What the Share action offers. `null` is a Share row that cannot be pressed, not a crash. */
    sharable_url: nullableText,
    prices: z
        .array(z.unknown())
        .catch([])
        .transform(rows =>
            rows
                .map(row => packagePriceSchema.safeParse(row))
                .filter(result => result.success)
                .map(result => result.data),
        ),
})

export type MyPackage = z.infer<typeof myPackageSchema>

/**
 * The person paying — the `user` block on a subscriber row.
 *
 * `channel_slug` is what makes the row pressable (it is the only address this screen can build), so
 * a row without one renders as a name and nothing else rather than as a link to `/@null`.
 */
export const subscriberUserSchema = z.looseObject({
    id,
    display_name: nullableText,
    channel_slug: nullableText,
    avatar: z.looseObject({ thumb: nullableText }).nullable().catch(null),
    /** The custom verified-badge image, or `null` — the same field `features/channel` reads. */
    channel_verified_tick_badge: z.looseObject({ image: nullableText }).nullable().catch(null),
})

export type SubscriberUser = z.infer<typeof subscriberUserSchema>

/**
 * One member — a row of `my-channel-subscriptions/`.
 *
 * `package_price` + `package_price_currency` are **what that member actually pays**, not the tier's
 * current list price: a creator who raised their price still charges the old members the old amount
 * until they renew, so reading the package here would misreport every grandfathered row.
 */
export const subscriberSchema = z.looseObject({
    id,
    /** When this member's current term ends — the "Next charge" date on the row. */
    end_date: nullableTimestamp,
    package_price: numeric,
    package_price_currency: currencyText,
    user: subscriberUserSchema.nullable().catch(null),
    /** Present so a row whose `user` failed to parse can still name the tier. */
    package: z.looseObject({ name: nullableText }).nullable().catch(null),
})

export type Subscriber = z.infer<typeof subscriberSchema>

/**
 * A DRF page, parsed leniently — **and `received` is not `results.length`**.
 *
 * The two differ exactly when a row fails to parse, and the difference decides whether the list
 * keeps paging: a full page of 20 containing one unreadable row measures 19, which a short-page stop
 * condition reads as "the end" and every page after it disappears silently. `features/membership`
 * carries the same note on the same trap. `received` is what the server actually sent.
 */
export interface ParsedPage<T> {
    results: T[]
    count: number
    next?: string | null
    received: number
}

function parsePage<T>(body: unknown, schema: z.ZodType<T>): ParsedPage<T> {
    const envelope = z
        .looseObject({
            results: z.array(z.unknown()).catch([]),
            count: z.coerce.number().catch(0),
            next: z.union([z.string(), z.null()]).optional().catch(null),
        })
        .safeParse(body)

    if (!envelope.success) return { results: [], count: 0, next: null, received: 0 }

    const rows = envelope.data.results
    const results = rows
        .map(row => schema.safeParse(row))
        .filter(result => result.success)
        .map(result => result.data)

    return {
        results,
        count: envelope.data.count,
        next: envelope.data.next,
        received: rows.length,
    }
}

/** `my-packages/` — the creator's own tiers. Legacy reads `results[0]` and ignores the rest. */
export function normalizeMyPackages(body: unknown): ParsedPage<MyPackage> {
    return parsePage(body, myPackageSchema)
}

/** `my-channel-subscriptions/` — one page of members. */
export function normalizeSubscribers(body: unknown): ParsedPage<Subscriber> {
    return parsePage(body, subscriberSchema)
}
