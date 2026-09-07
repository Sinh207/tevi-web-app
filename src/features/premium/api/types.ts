import { DEFAULT_CURRENCY } from '@shared/lib/money'
import { z } from 'zod'

/**
 * The Premium service's DTOs — `premium`.
 *
 * Three payloads, and the screen is built from all three at once: the **packages** are what can be
 * bought, the **benefits** are what buying it unlocks, and **user/info** is what this account
 * already has. None of them means much without the others, so they share a file.
 *
 * ## Parsed per field, never thrown
 *
 * Same rule as `features/payment/api/types.ts` and `features/membership/api/types.ts`: a `.catch()`
 * per field so one renamed key costs one line of the screen rather than the screen, and
 * `looseObject` so the half of the payload this client does not model stays visible to whoever
 * needs it next.
 *
 * That matters more here than usual, because **the benefits are content**. The backoffice adds a
 * benefit, writes its copy and points it at a banner without anybody deploying this app; a parser
 * that rejected an unfamiliar row would turn "we launched a new perk" into "the Premium page is
 * empty".
 *
 * ## Read from a real payload, not from legacy's call sites
 *
 * The first version of this file was inferred from `containers/premium` and
 * `postForm/provider/permission.js`, because the service publishes no schema
 * (`/premium/docs/schema/` is a 404) and every endpoint needs a bearer. A captured response later
 * corrected **four** things it had guessed, and each one failed silently:
 *
 * | guessed | actually | what it cost |
 * |---|---|---|
 * | a detail row's label is `name` | **`title`** | every comparison row rendered with no label |
 * | benefits and packages are all live | **`is_active`** | the backoffice's off switch did nothing |
 * | the payload's array order is the order | **`sort_order`** | the list's order was the server's to change |
 * | `price` is USD by convention | **`currency: "USD"`** | a localised price would convert twice |
 *
 * What is left open is narrow, and it is **B93** in
 * [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md).
 */

/** A string that is present and non-blank, else `null`. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** Lower-cased, for the fields compared against a vocabulary (`slug`). */
const slugText = z
    .unknown()
    .transform(value => (typeof value === 'string' ? value.trim().toLowerCase() || null : null))
    .catch(null)

/** Ids arrive as a string or a number depending on the endpoint. Normalise to string. */
const id = z.union([z.string(), z.number()]).transform(String).catch('')

/**
 * A money amount arriving as a number **or** a decimal string — the same field helper
 * `features/payment` documents, and the same reason: `price` has been seen both ways from the
 * billing side, so neither is evidence for the other. `0` for anything unusable, and `0` is not a
 * price: `normalizePremiumPackages` drops the row.
 */
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
 * ISO 4217, upper-cased, defaulting to USD.
 *
 * The default is the honest one rather than a guess: every package seen says `USD`, the checkout
 * charges in it, and a *missing* currency on a figure the screen is about to convert has to resolve
 * to something. `usePremiumPrice` treats USD as "convert into the reader's display unit" and
 * anything else as "already priced, print as-is", so a wrong default is a conversion and a wrong
 * *value* is not — which is the safer way round for it to be wrong.
 */
const currencyCode = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return DEFAULT_CURRENCY.code
        const trimmed = value.trim().toUpperCase()
        return trimmed === '' ? DEFAULT_CURRENCY.code : trimmed
    })
    .catch(DEFAULT_CURRENCY.code)

/**
 * `is_active`, defaulting to **`true`**.
 *
 * `z.coerce.boolean()` is the wrong tool here and it matters: it makes `"false"` truthy. So the wire
 * value is read for what it is, and anything that is not a recognisable "no" is a yes — a payload
 * from before the flag existed returned only live rows, so absent must not hide the catalogue.
 */
const activeFlag = z
    .unknown()
    .transform(value => {
        if (typeof value === 'boolean') return value
        if (typeof value === 'number') return value !== 0
        if (typeof value !== 'string') return true
        const trimmed = value.trim().toLowerCase()
        return trimmed !== 'false' && trimmed !== '0' && trimmed !== 'no'
    })
    .catch(true)

/** A whole number ≥ 0. `0` means "not stated" — never a valid duration. */
const intish = z
    .unknown()
    .transform(value => {
        const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
        return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
    })
    .catch(0)

/**
 * An absolute `http(s)` URL, or `null`.
 *
 * Stricter than `nullableText` because these two fields (`icon`, `banner`) are **image `src`
 * values from a payload this client does not own**, and the two ways that goes wrong are both
 * silent-until-real-data: a relative path renders as a request against our own origin, and a
 * `javascript:` or `data:` string is a sink `next/image` should never be handed. A benefit whose
 * art cannot be read still renders — its name and description are the row — so `null` costs a
 * picture, never the perk.
 */
const httpUrl = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        try {
            const url = new URL(trimmed)
            return url.protocol === 'https:' || url.protocol === 'http:' ? trimmed : null
        } catch {
            return null
        }
    })
    .catch(null)

/* ============================== packages ============================== */

/**
 * One subscription package — `premium/v1/packages/?platform=web`.
 *
 * ⚠ **`product_id` is the price, not the product.** It is what legacy sends as `price_id` on
 * `checkout/v3/checkout/premium/`, i.e. a Stripe **Price** id, wearing the wrong name on the wire.
 * The DTO keeps the wire spelling (this repo's rule) and `lib/plans.ts` is where a package becomes
 * an order, so exactly one line knows about the mismatch.
 *
 * **`currency` is on the wire**, and it is read rather than assumed: `"USD"` in every package seen,
 * which is what the checkout charges and what legacy's `formatCurrency(price * exchangeRate, …)`
 * relies on. `usePremiumPrice` converts **only** when it says USD — an already-localised figure put
 * through a USD→display rate is converted twice, and the result is still a plausible number with a
 * plausible symbol in front of it, which is why this field is worth carrying rather than trusting.
 *
 * `duration_days` is the *only* thing that says which plan a row is: 7, 30 and 365 are the three
 * legacy knows, and it matches on those numbers rather than on a name. `lib/plans.ts` owns that
 * mapping and answers `null` for anything else, so a fourth cadence is a row the screen ignores
 * rather than a card with no label.
 */
export const premiumPackageSchema = z.looseObject({
    id,
    /** The Stripe **Price** id — `price_1Sh…` in the real payload. See the warning above. */
    product_id: nullableText,
    /** Per `duration_days`, in `currency`. */
    price: numeric,
    /** ISO 4217, upper-cased. `USD` in every package seen; read, never assumed. */
    currency: currencyCode,
    /** 7 | 30 | 365 in every payload seen. */
    duration_days: intish,
    /**
     * The backoffice's off switch, and **the client must honour it**: a deactivated package that
     * still renders is a price somebody can press, and `checkout/` would be asked to charge for it.
     * Absent ⇒ `true`, because every payload carries it and an older one that does not is a
     * payload from before the flag existed — where everything returned *was* live.
     */
    is_active: activeFlag,
    /** The order the backoffice put them in. Ascending, with gaps where a row was removed. */
    sort_order: intish,
})

export type PremiumPackage = z.infer<typeof premiumPackageSchema>

/**
 * The packages, dropping any row that cannot be bought.
 *
 * Stricter than the benefit parser on purpose, and for the reason `normalizeStarPackages` states: a
 * package is three facts — what it costs, how long it lasts and what to charge against — and a row
 * missing any of them is a card that either sells nothing, costs nothing, or takes money against an
 * empty `price_id`. On a screen that takes money, a `$0` tile is the expensive failure.
 *
 * Accepts the service's `{ packages }` envelope, a bare array, or DRF's `{ results }`: legacy reads
 * `data.data.packages`, and a list that starts paginating should not empty the screen.
 */
export function normalizePremiumPackages(body: unknown): PremiumPackage[] {
    const packages: PremiumPackage[] = []
    for (const row of listOf(body, 'packages')) {
        const parsed = premiumPackageSchema.safeParse(row)
        if (
            parsed.success &&
            // `is_active` first, because it is the only one of the four that is somebody's decision
            // rather than a broken row: a deactivated package must not be sellable.
            parsed.data.is_active &&
            parsed.data.price > 0 &&
            parsed.data.duration_days > 0 &&
            parsed.data.product_id !== null
        ) {
            packages.push(parsed.data)
        }
    }
    return bySortOrder(packages)
}

/* ============================== benefits ============================== */

/**
 * One row of a benefit's comparison table — "Free: 5 minutes / Premium: 60 minutes".
 *
 * `free_value` / `prem_value` are **display strings** the backoffice writes, and `metadata` is the
 * same pair as numbers. Legacy reads the strings on the Premium screen and the numbers in the post
 * composer (`DURATION_MAX`, `FILE_SIZE_MAX` off `metadata.free` / `metadata.prem`), which is why
 * both are carried: they are one field for the eye and one for the arithmetic, and this client
 * must not compute the first from the second — "Unlimited" is a legitimate `prem_value` with no
 * number behind it.
 */
export const benefitDetailSchema = z.looseObject({
    slug: slugText,
    /**
     * ⚠ **`title`, not `name`.** The benefit itself has a `name`; its rows have a `title`, and this
     * file said `name` for both — so every comparison row rendered with its label dropped and
     * nothing failed. The two live one nesting level apart, which is exactly why it survived review.
     *
     * `description` is on the wire too and is deliberately **not** modelled: in the captured payload
     * the three storage rows have each other's descriptions ("Video Length" is described as
     * "Maximum resolution for video uploads"), so it is a field the backoffice has not kept true.
     * The title and the two values are what the table needs.
     */
    title: nullableText,
    free_value: nullableText,
    prem_value: nullableText,
    metadata: z.looseObject({ free: numeric, prem: numeric }).nullable().catch(null),
    /** The order within the table. Ascending, per benefit. */
    sort_order: intish,
})

export type BenefitDetail = z.infer<typeof benefitDetailSchema>

/**
 * One benefit — `premium/v1/benefits/`.
 *
 * `name` and `description` are English on the wire and are localised **by lookup**, not by
 * translation: see `lib/benefit-copy.ts`, which is a port of legacy's `handleKey` and carries the
 * reasoning for why the server's own sentence is the key.
 *
 * **`details` decides how a benefit is drawn**, not `slug`. Legacy branches its detail slide on
 * `slug === 'star-purchase-bonus'`, which was true when that was the only benefit carrying a
 * comparison — the captured payload has **two**, and `enhanced-storage-upload`'s three rows (video
 * length, file size, quality) are content legacy has never displayed. So the table is rendered for
 * whatever has readable rows, and the magic slug is gone.
 */
export const premiumBenefitSchema = z.looseObject({
    slug: slugText,
    name: nullableText,
    description: nullableText,
    /** The backoffice's off switch. Absent ⇒ `true` — see the package's own note. */
    is_active: activeFlag,
    /** The order the backoffice put them in. Ascending, with gaps where a row was removed. */
    sort_order: intish,
    /** A small mark, drawn 28px in the list. */
    icon: httpUrl,
    /** The full-width picture in the detail carousel. */
    banner: httpUrl,
    /** "New" and friends — a backoffice label, shown beside the name. */
    tag: nullableText,
    details: z.array(benefitDetailSchema).catch([]),
})

export type PremiumBenefit = z.infer<typeof premiumBenefitSchema>

/**
 * The benefits, dropping only the rows that could not be *shown*.
 *
 * A benefit needs a name; that is the whole bar. No `icon`, no `banner`, no `description` and no
 * `details` are all survivable — the row is a name with a chevron, which is still a true statement
 * about what Premium includes. This is the opposite call from the packages above, and it is the
 * right one for content: the cost of dropping a real perk is that people do not know they get it.
 */
export function normalizePremiumBenefits(body: unknown): PremiumBenefit[] {
    const benefits: PremiumBenefit[] = []
    for (const row of listOf(body, 'benefits')) {
        const parsed = premiumBenefitSchema.safeParse(row)
        if (parsed.success && parsed.data.is_active && parsed.data.name !== null) {
            benefits.push({ ...parsed.data, details: bySortOrder(parsed.data.details) })
        }
    }
    return bySortOrder(benefits)
}

/* ============================== user info ============================== */

/**
 * A timestamp as epoch **milliseconds**, or `null`.
 *
 * The three wire shapes `features/balance/api/types.ts` documents at length — a number, a numeric
 * string, an ISO 8601 string — including the seconds→milliseconds promotion below the year-2001
 * mark, without which a seconds feed renders every Premium grant as expiring in 1970.
 */
const SECONDS_CUTOFF_MS = 1_000_000_000_000

const epochMs = z
    .unknown()
    .transform(value => {
        if (typeof value === 'number') {
            if (!Number.isFinite(value) || value <= 0) return null
            return value < SECONDS_CUTOFF_MS ? Math.round(value * 1000) : Math.round(value)
        }
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        // A bare numeric string is an epoch, not a date to parse: `Date.parse('1739923200')` is
        // the *year* 1739923200 in V8, which is not a number anybody meant.
        if (/^\d+$/.test(trimmed)) {
            const n = Number(trimmed)
            if (!Number.isFinite(n) || n <= 0) return null
            return n < SECONDS_CUTOFF_MS ? Math.round(n * 1000) : Math.round(n)
        }
        const parsed = Date.parse(trimmed)
        return Number.isFinite(parsed) ? parsed : null
    })
    .catch(null)

/**
 * `premium/v1/user/info/` — what this account's Premium standing is.
 *
 * Two fields, and the app already has one of them from somewhere better: `useMyChannel().isPremium`
 * is read on every route and is refreshed by the `premium_info` socket event, so **nothing gates a
 * screen on this payload's `isPremium`**. What only this endpoint knows is `expiresAt`, which is
 * the date on the receipt line.
 *
 * Legacy fetches this on the Premium screen and never renders any of it (`premiumInfo` is returned
 * from the hook and read by no component). The date is the reason to keep the call.
 */
export interface PremiumInfo {
    isPremium: boolean
    /** Epoch ms, or `null` when the service did not say. */
    expiresAt: number | null
}

const premiumInfoSchema = z.looseObject({
    is_premium: z.coerce.boolean().catch(false),
    expires_at: epochMs,
})

/**
 * `null` when the body is not something this client can read — the screen then says only what it
 * already knows from the channel. It never guesses a date.
 */
export function toPremiumInfo(body: unknown): PremiumInfo | null {
    if (!body || typeof body !== 'object') return null
    const parsed = premiumInfoSchema.safeParse(body)
    if (!parsed.success) return null
    return { isPremium: parsed.data.is_premium, expiresAt: parsed.data.expires_at }
}

/* ============================== shared ============================== */

/**
 * Ascending by `sort_order`, ties keeping the payload's own order.
 *
 * The captured payload *is* already ordered — 1, 2, 4, 5 … 15, with gaps where a row was removed —
 * so this changes nothing today. It is here because the field exists: an order the backoffice sets
 * and the client ignores is an order that survives only as long as the server keeps sorting, and a
 * list of thirteen perks silently reshuffling after a backoffice edit is the kind of regression
 * nobody can attribute. `toSorted` is not used — Node 20 in CI predates it.
 */
function bySortOrder<T extends { sort_order: number }>(rows: T[]): T[] {
    return rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => a.row.sort_order - b.row.sort_order || a.index - b.index)
        .map(({ row }) => row)
}

/**
 * The rows out of a list body, whatever it is wrapped in.
 *
 * Three shapes are accepted and each has been seen on this backend: the service's own named field
 * (`{ benefits: [] }`, `{ packages: [] }` — what legacy reads), a bare array, and DRF's
 * `{ results: [] }`. Anything else yields nothing, which the callers already render as an empty
 * state rather than an error: a list that came back holding nothing is a legitimate answer.
 */
function listOf(body: unknown, field: 'benefits' | 'packages'): unknown[] {
    if (Array.isArray(body)) return body
    if (!body || typeof body !== 'object') return []
    const named = (body as Record<string, unknown>)[field]
    if (Array.isArray(named)) return named
    const results = (body as { results?: unknown }).results
    return Array.isArray(results) ? results : []
}
