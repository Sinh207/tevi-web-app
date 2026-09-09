import { z } from 'zod'

/**
 * The **creator's** side of direct donation — the offer they publish, and who has paid it.
 *
 * Two payloads from billy (`v4/billing/donation/setting/` and `v4/billing/donation/donations/`),
 * plus the one-figure summary beside them. Not the same shapes as `features/donation`'s, which
 * models the *buyer's* view of the same offer (`v1/gifting/direct-donate/{slug}/`) — that one
 * carries `donation_count` and no `is_active`, this one carries `is_active`, `sharable_url` and the
 * two `allow_*` switches the buyer never sees. The same split, for the same reasons, that
 * `api/types.ts` states between this feature's membership DTOs and `features/membership`'s.
 *
 * ## Unusually for this repo, these are **read off the schema**, not off legacy
 *
 * `https://api.tevi.dev/billy/docs/schema/v4/?format=json` describes all four endpoints, and its
 * donation half is byte-identical in `v5`. So the field names below are the API's own rather than
 * legacy's word — which settled four things guessing had got wrong, all recorded as **B104**:
 *
 * | | |
 * |---|---|
 * | `date_range` | the enum is `1m ǀ 30d ǀ 60d ǀ 7d ǀ **thisMonth**` — legacy sends `this_month`, which is in no enum |
 * | `name` | `maxLength: 50`, which legacy's form does not enforce |
 * | `thank_you_msg` | `maxLength: 500`, which legacy's textarea does not enforce either |
 * | `icon` / `button_text` | closed enums (`pizza ǀ coffee ǀ book ǀ rose`, `Donate ǀ Tip`) |
 *
 * Two things the schema is **wrong or silent** about, and both are why the parsing below stays
 * lenient rather than becoming a generated client:
 *
 * - `GET summary/` is annotated as returning `ResponseMyDonationSetting`, which it plainly does not
 *   — legacy reads `unique_supporter_count` off it. A drf-spectacular mis-annotation.
 * - its `User` block is `{ id, display_name, avatar }` and legacy's row reads `channel_slug` and
 *   `channel_verified_tick_badge` off the same object. Both are modelled here as optional, so a row
 *   that carries them is a link with a badge and a row that does not is a name.
 *
 * ## Parsed per field, never thrown
 *
 * The house rule (`features/channel`, `features/donation`, this feature's own `api/types.ts`): a
 * `.catch()` per field, so a renamed key costs one row rather than the screen. `looseObject` keeps
 * everything not modelled here — including `allow_monthly_donation` and `allow_post_donation`, two
 * real switches no screen in either client has ever set.
 */

/** The four metaphors the API's `IconEnum` allows. A fifth value is a schema change, not a payload. */
export const DONATION_UNITS = ['coffee', 'pizza', 'book', 'rose'] as const
export type DonationUnit = (typeof DONATION_UNITS)[number]

/**
 * The API's `ButtonTextEnum` — the word a supporter's contribution is labelled with.
 *
 * Capitalised, because the wire is: these are sent back verbatim as `button_text` and the enum is
 * `["Donate", "Tip"]`. Lower-casing them "for tidiness" is a 400 the form cannot explain.
 */
export const DONATION_TERMS = ['Donate', 'Tip'] as const
export type DonationTerm = (typeof DONATION_TERMS)[number]

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

/**
 * A money amount that may arrive as a number **or** as a decimal string.
 *
 * The schema types every one of these as `format: decimal` — i.e. a *string* — and the summary's
 * count as a bare integer. Both go through this, because the two come from one service and neither
 * is evidence for the other (`features/donation/api/types.ts` states the same at length).
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

const boolish = z.coerce.boolean().catch(false)

/** One price line — `TVS` (Star) or `USD`, picked by currency and never by position. */
export const donationPriceSchema = z.looseObject({
    id: nullableText,
    amount: numeric,
    amount_currency: currencyText,
})

export type DonationPrice = z.infer<typeof donationPriceSchema>

/**
 * The offer this creator publishes — `GET v4/billing/donation/setting/`.
 *
 * **`sharable_url` is the wire's spelling**, one `e` short, and it is kept verbatim for the reason
 * `myPackageSchema` gives about the identical key: it is a wire key, not a word, and "correcting"
 * it produces `undefined` and a Share action that copies nothing.
 *
 * `icon` and `button_text` fall back to the API's own defaults rather than to `null`, because the
 * setup form has to open on *something* and every real payload carries them — the schema marks both
 * `required`. `coffee` and `Donate` are legacy's initial form state too.
 */
export const donationSettingSchema = z.looseObject({
    id,
    /** The unit's display name. Legacy writes the lower-cased icon here; `maxLength: 50`. */
    name: nullableText,
    icon: z
        .unknown()
        .transform(value => {
            const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
            return (DONATION_UNITS as readonly string[]).includes(v)
                ? (v as DonationUnit)
                : 'coffee'
        })
        .catch('coffee' as DonationUnit),
    button_text: z
        .unknown()
        .transform(value => {
            const v = typeof value === 'string' ? value.trim() : ''
            return (DONATION_TERMS as readonly string[]).includes(v)
                ? (v as DonationTerm)
                : 'Donate'
        })
        .catch('Donate' as DonationTerm),
    /** The creator's own line, sent after each donation. Rendered as text, never as HTML. */
    thank_you_msg: nullableText,
    display_supporter_count: boolish,
    /**
     * Whether the offer is live.
     *
     * ⚠ **Defaults to `true`, not `false`** — the one field here that must not fail closed. The
     * schema does not mark it required, so an omitted value reaching a `false` default would show a
     * creator whose offer is live a form saying it is off; pressing Save would then *switch it off*.
     * The failure that matters here is the write, not the read.
     *
     * ⚠ **`z.coerce.boolean().catch(true)` does not do this**, and reads as though it does — which is
     * why it is spelled out. `.catch` fires on a parse *failure*, and `Boolean(undefined)` does not
     * fail: it succeeds as `false`. The fallback was therefore unreachable for the one input it was
     * written for. `donation-setting.test.ts` pins it.
     */
    is_active: z
        .unknown()
        .transform(value => (value === undefined || value === null ? true : Boolean(value)))
        .catch(true),
    /** What the Share action offers. `null` is a Share row that cannot be pressed, not a crash. */
    sharable_url: nullableText,
    prices: z
        .array(z.unknown())
        .catch([])
        .transform(rows =>
            rows
                .map(row => donationPriceSchema.safeParse(row))
                .filter(result => result.success)
                .map(result => result.data),
        ),
})

export type DonationSetting = z.infer<typeof donationSettingSchema>

/**
 * The person who donated — the `user` block on a row.
 *
 * The schema declares only `id`, `display_name` and an untyped `avatar`. `channel_slug` and
 * `channel_verified_tick_badge` are legacy's, read off the same object, and are modelled optional
 * on that evidence: a row with a slug is a link to `/@slug`, a row without one is a plain name. See
 * **B104**.
 */
export const donorSchema = z.looseObject({
    id,
    display_name: nullableText,
    channel_slug: nullableText,
    avatar: z.looseObject({ thumb: nullableText }).nullable().catch(null),
    channel_verified_tick_badge: z.looseObject({ image: nullableText }).nullable().catch(null),
})

export type Donor = z.infer<typeof donorSchema>

/**
 * One donation received — a row of `GET v4/billing/donation/donations/`.
 *
 * `usd_amount` is carried alongside `amount` + `amount_currency`, so unlike the member row this one
 * never has to derive a unit: the API has already done the conversion. `amount` is what the
 * supporter paid in whatever they paid it in; `usd_amount` is the figure the creator's dashboard
 * totals. Legacy prefers `usd_amount` and falls back to `amount`, and so does `donationAmountUsd`.
 */
export const donationRowSchema = z.looseObject({
    id,
    /** The supporter's note. Creator-facing prose with no length the client can rely on. */
    description: nullableText,
    user: donorSchema.nullable().catch(null),
    amount: numeric,
    amount_currency: currencyText,
    usd_amount: numeric,
    /** Free text on the wire — `payoutStatusTone` is what closes it into three known cases. */
    payout_status: nullableText,
    /** Epoch, seconds or milliseconds — see `nullableEpoch`. */
    created_at: z
        .unknown()
        .transform(value => (typeof value === 'number' && Number.isFinite(value) ? value : null))
        .catch(null),
})

export type DonationRow = z.infer<typeof donationRowSchema>

/**
 * `GET v4/billing/donation/summary/` — one figure this screen prints, and whatever else it carries.
 *
 * The schema mis-annotates this endpoint (see the file note), so the field name is legacy's:
 * `unique_supporter_count`. `looseObject` keeps the rest, which is how the next figure the design
 * asks for will already be in hand.
 */
export const donationSummarySchema = z.looseObject({
    unique_supporter_count: numeric,
})

export type DonationSummary = z.infer<typeof donationSummarySchema>

/**
 * The donations page, parsed leniently — **and `received` is not `results.length`**.
 *
 * Identical to `api/types.ts`'s `ParsedPage` and duplicated for the same reason it duplicates
 * everything else: the two lists page differently (this one does not page at all today) and a
 * shared envelope would be a shared assumption. The distinction it preserves still matters even
 * unpaged: `count` is the server's total and `results.length` is what this client could read, so
 * reporting the second as the first would under-report a creator's supporters whenever one row
 * failed to parse.
 */
export interface ParsedDonationPage {
    results: DonationRow[]
    /** The server's own total, which is what the summary card falls back to. */
    count: number
    /** How many rows the server actually sent, parseable or not. */
    received: number
}

export function normalizeDonations(body: unknown): ParsedDonationPage {
    const envelope = z
        .looseObject({
            results: z.array(z.unknown()).catch([]),
            count: z.coerce.number().catch(0),
        })
        .safeParse(body)

    if (!envelope.success) return { results: [], count: 0, received: 0 }

    const rows = envelope.data.results
    const results = rows
        .map(row => donationRowSchema.safeParse(row))
        .filter(result => result.success)
        .map(result => result.data)

    return { results, count: envelope.data.count, received: rows.length }
}

/** `null` when the body is not a setting this client can read — see `donationApi.getSetting`. */
export function normalizeDonationSetting(body: unknown): DonationSetting | null {
    if (!body || typeof body !== 'object') return null
    const parsed = donationSettingSchema.safeParse(body)
    return parsed.success ? parsed.data : null
}

/** `null` rather than a zeroed summary: "not known" and "nobody yet" print different things. */
export function normalizeDonationSummary(body: unknown): DonationSummary | null {
    if (!body || typeof body !== 'object') return null
    const parsed = donationSummarySchema.safeParse(body)
    return parsed.success ? parsed.data : null
}
