import { z } from 'zod'

/**
 * A membership this account **holds** — one row of `billy/v3/subscription/my-subscriptions/`.
 *
 * Read from the *subscriber's* side. The same service answers the creator's side
 * (`my-channel-subscriptions/`, `my-packages/`, `benefits/`) and none of that is modelled here:
 * this feature is one screen, and the screen is "what am I paying for".
 *
 * ## Parsed per field, never thrown
 *
 * Same rule, and the same reasoning, as `features/channel/api/types.ts` and
 * `features/donation/api/types.ts`: a `.catch()` per field, so one renamed key costs one line of
 * one row instead of taking the screen down. `looseObject` keeps what this file does not model —
 * the cash/Stripe half of the payload (`stripe_subscription_id`, the invoice block) is real and
 * belongs to a checkout pass that does not exist yet, and stripping it here would make it
 * invisible to whoever writes that.
 *
 * Field names are legacy's, since that is the contract until the API team confirms one — see
 * **B51**–**B53** and **B61** in [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md).
 */

/** The two `status` values the screen filters on. Legacy sends exactly these strings. */
export const MEMBERSHIP_STATUSES = ['active', 'expired'] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

/** A string that is present and non-blank, else `null`. `''` is not a name or a URL. */
const nullableText = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed === '' ? null : trimmed
    })
    .catch(null)

/** Lower-cased, for the two fields the client compares against a vocabulary. */
const slugText = z
    .unknown()
    .transform(value => (typeof value === 'string' ? value.trim().toLowerCase() || null : null))
    .catch(null)

/** Upper-cased, for currency codes — the wire is inconsistent about their case (see B44). */
const currencyText = z
    .unknown()
    .transform(value => (typeof value === 'string' ? value.trim().toUpperCase() || null : null))
    .catch(null)

/** Ids arrive as a string or a number depending on the service. Normalise to string. */
const id = z.union([z.string(), z.number()]).transform(String).catch('')

/**
 * A money amount that may arrive as a number **or** as a decimal string.
 *
 * `package_price` is `"5.00"` on the wire today and `donation_count` on the neighbouring endpoint
 * is a bare number, from the same service — so neither is evidence for the other. `0` for anything
 * unusable; `membershipPrice()` treats `0` as "no price to show" rather than as free.
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

/**
 * A moment in time, normalised to an ISO 8601 string — or `null`.
 *
 * Epoch **milliseconds as a JSON number** is what `core`'s channel endpoint sends for `created_at`,
 * and that arriving through a string-only parser is a bug this repo has already shipped once
 * (`features/channel/api/types.ts` has the post-mortem: the field arrived, was discarded, and the
 * row silently dropped itself). Billy's `end_date` has only been seen as an ISO string, so seconds
 * and milliseconds are accepted here **defensively** rather than from observation — and the dates on
 * this screen are the whole point of it, so a silent `null` is the expensive failure.
 *
 * The threshold is unambiguous for any real date: a millisecond epoch below `1e11` is 1973, and a
 * second epoch above it is the year 5138.
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

        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        if (trimmed === '') return null
        return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed
    })
    .catch(null)

/**
 * Optional and absent both mean `null`, never `undefined` — so a consumer writes one check.
 * Lifted from `features/channel/api/types.ts`, which explains why at length.
 */
function nullable<T extends z.ZodType>(schema: T) {
    return schema
        .nullish()
        .transform(value => value ?? null)
        .catch(null)
}

/** The Premium clip, in the shape `resolveAvatarSource` wants. */
const avatarVideoSchema = nullable(
    z.looseObject({
        playback: nullable(z.looseObject({ url: nullableText })),
        thumbnail: nullableText,
    }),
)

/**
 * The creator being paid.
 *
 * **Not `features/channel`'s `Channel`**, and not a cast of one: this payload carries seven fields
 * where that has forty, and the two features must not depend on each other's DTOs — the same call
 * `DonationTarget` makes, for the same reason (`features/channel` already imports this app's other
 * money features, so importing back would be a cycle between barrels).
 */
export const membershipChannelSchema = z.looseObject({
    id,
    name: nullableText,
    /** Never carries the leading `@`, same as `Channel.slug`. */
    slug: z.string().catch(''),
    images: nullable(z.looseObject({ thumb: nullableText, avatar_video: avatarVideoSchema })),
    verified_tick_badge: nullable(z.looseObject({ image: nullableText })),
    is_premium: boolish,
})

export type MembershipChannel = z.infer<typeof membershipChannelSchema>

/** One price line on the package — the offer carries one per currency (`TVS`, `USD`). */
export const membershipPriceSchema = z.looseObject({
    id: nullableText,
    amount: numeric,
    amount_currency: currencyText,
})

export type MembershipPrice = z.infer<typeof membershipPriceSchema>

/**
 * The tier itself. `prices` is kept whole even though this screen renders the **paid** figure
 * (`package_price`) rather than the list price: a renewal that is about to be charged is charged at
 * the package's current price, which is what the detail sheet will need when it lands.
 */
export const membershipPackageSchema = z.looseObject({
    id,
    name: nullableText,
    /**
     * The space selling the tier — **when the payload carries it**, which is not established.
     *
     * `my-subscriptions/` puts `channel` beside `package`, so the shape is this service's own; whether
     * `channel/{slug}/packages/{id}/` repeats it is **B85**. Legacy's webview checkout does not rely on
     * it either way: it fetches `core`'s `channels/{slug}/` separately for the avatar and the name.
     *
     * Modelled here rather than fetched a second time because this feature must not depend on
     * `features/channel`'s DTO (the reason `membershipChannelSchema` exists at all), and because the
     * one screen that wants it — the webview checkout header — already has the slug from its own URL
     * to fall back to. So it is `null` or it is a bonus, never a blocker.
     */
    channel: nullable(membershipChannelSchema),
    /**
     * The creator's own pitch for the tier, shown on the join dialog.
     *
     * Untranslated by nature and rendered verbatim — the same narrow exception `button_text` and
     * `thank_you_msg` document in `features/donation`. `/my-membership` never asked for it, which is
     * why it was not modelled until the join flow needed it.
     */
    description: nullableText,
    prices: z
        .array(z.unknown())
        .catch([])
        .transform(rows =>
            rows
                .map(row => membershipPriceSchema.safeParse(row))
                .filter(result => result.success)
                .map(result => result.data),
        ),
})

export type MembershipPackage = z.infer<typeof membershipPackageSchema>

export const membershipSchema = z.looseObject({
    /** The **subscription's** id — what `cancel/` and `payment-histories/` take, not the package's. */
    id,
    /** `active` / `expired`. Kept as free text: the client filters server-side and only reads this
     *  back to decide which date label a row shows, so an unknown value must not drop the row. */
    status: slugText,
    /** `star` · `card` · `vip_pass` · whatever ships next. See `lib/payment-methods.ts`. */
    payment_method: slugText,
    /**
     * Set when the reader has cancelled but the term has not run out. **Presence is the fact**, and
     * it is what flips the row's date line from "Next charge" to "Expiry date" — a cancelled
     * membership is still active, it simply will not renew.
     */
    canceled_at: nullableTimestamp,
    /** When the current term ends: the next charge date while renewing, the last day once cancelled. */
    end_date: nullableTimestamp,
    /** What was actually paid, in `package_price_currency`. */
    package_price: numeric,
    package_price_currency: currencyText,
    channel: nullable(membershipChannelSchema),
    package: nullable(membershipPackageSchema),
})

export type Membership = z.infer<typeof membershipSchema>

/**
 * One charge against a membership — `my-subscriptions/{id}/payment-histories/`.
 *
 * The detail dialog's second half: when money moved, and how much. Legacy reads `res.data.data` and
 * tests it with `.length`, i.e. the payload is a **bare array** rather than a paginated envelope — so
 * there is no `count`, no `next`, and nothing to page through. Taken at face value; if it grows a
 * wrapper this is the one function to change.
 *
 * `package_price` / `package_price_currency` are the same pair the list row carries, so the same
 * `membershipPrice` helper renders both and a Star charge cannot print as dollars in one place and
 * Star in the other.
 */
export const paymentHistorySchema = z.looseObject({
    id,
    created_at: nullableTimestamp,
    package_price: numeric,
    package_price_currency: currencyText,
})

export type PaymentHistory = z.infer<typeof paymentHistorySchema>

/**
 * Parse the history, dropping rows with no usable date **or** no readable price.
 *
 * Stricter than `normalizeMemberships`, and deliberately so: a membership row without a date still
 * says who and how much, but a *charge* is only two facts, and a line that has lost one of them is a
 * blank row in a list of payments — which reads as a missing transaction rather than as a display
 * problem. On a money list that is the worse failure.
 *
 * `id` may be empty; the row is not actionable and React can key on the index of a list that never
 * reorders. It is kept in the type because the payload carries it and a future receipt view will want
 * it.
 */
export function normalizePaymentHistories(body: unknown): PaymentHistory[] {
    if (!Array.isArray(body)) return []
    const rows: PaymentHistory[] = []
    for (const row of body) {
        const parsed = paymentHistorySchema.safeParse(row)
        if (parsed.success && parsed.data.created_at !== null && parsed.data.package_price > 0) {
            rows.push(parsed.data)
        }
    }
    return rows
}

/**
 * One page as this feature needs it.
 *
 * `received` is the number of rows the **server** sent, and it is not decoration: `results` may be
 * shorter, because `normalizeMemberships` drops rows it cannot render, and the "is there more"
 * question is answered by comparing a page's length against `page_size` (billy pages by number and
 * carries no `next` — see B38). Inferring it from `results.length` would end pagination early the
 * first time a single row in a full page failed to parse, silently hiding every page after it.
 */
export interface MembershipsPage {
    results: Membership[]
    /** The server's total across all pages. `results.length` when the payload carried none. */
    count: number
    /** How many rows the server put in **this** page, before any were dropped. */
    received: number
}

/**
 * Parse a page, dropping only rows that cannot be **acted on**.
 *
 * One filter: **no `id`**. Nothing in the cache, the detail sheet or the cancel call could refer to
 * such a row, so it is a dead end — legacy renders it and its buttons 404. Everything else degrades
 * field by field: no avatar becomes initials, no `end_date` drops the date line, an unreadable price
 * drops the figure.
 *
 * ## ⚠ A row with **no `channel`** is kept, and dropping it was a real bug
 *
 * This used to drop them too, on the reading that "the row *is* a creator you pay, and without one it
 * is a price with no payee". That is wrong twice.
 *
 * **It is wrong about the payload.** `channel` is nullable in practice — legacy's row does
 * `packageInfo?.channel || null` and renders an empty name for it, which is a client anticipating the
 * `null` rather than defending against one it has never seen. It shows up most on **expired**
 * memberships, whose space may since have been unpublished or deleted.
 *
 * **It is wrong about the screen.** The symptom was a tab reading `Expired (15)` over an empty panel:
 * `count` is the server's total and the rows were all being thrown away here, so the screen contradicted
 * itself and the empty state blamed the reader's filter for it. And there was real information in those
 * rows — what was paid, when it ended, how — for a membership the reader is entitled to see a record of.
 *
 * `MembershipRow` already renders this correctly with no changes: the name falls through to the handle
 * and then to "Unknown creator", the identity block drops its link rather than pointing at `/@`, and
 * the avatar falls back to initials. That it needed none is the evidence the drop was never load-bearing.
 *
 * The count/rows mismatch is guarded a second time in `useMyMemberships` — a parser that silently eats
 * a whole page must not be able to look like an empty list again. See `isUnreadable` there, and **B61**.
 */
export function normalizeMemberships(results: unknown): Membership[] {
    if (!Array.isArray(results)) return []
    const rows: Membership[] = []
    for (const row of results) {
        const parsed = membershipSchema.safeParse(row)
        if (parsed.success && parsed.data.id !== '') rows.push(parsed.data)
    }
    return rows
}

/** The creator's display name, or `''` when the payload carried none. */
export function membershipChannelName(channel: MembershipChannel | null): string {
    return channel?.name ?? ''
}

/**
 * The **subject** of a join — what the flow needs to know about the space being joined, and nothing
 * about where the reader pressed.
 *
 * Deliberately the same shape as `features/donation`'s `DonationTarget`, and for the same reason.
 * The join flow is not the channel page's: a locked post, a live room and a direct message all sell
 * the same tier, and none of them holds a `Channel` to do it with. Passing five loose props instead
 * put that decision at every call site — legacy wires `becomeAMember` by hand in five places
 * (`layoutPost/provider`, `postDetail/provider`, DM `chat`, live `exclusive/actionButtons`,
 * `myMembershipItem`) and each one spells the creator's identity slightly differently.
 *
 * It carries **identity only**. The member count is a live figure from the stats service, so it
 * stays a separate prop on the dialogs — a target assembled once and held would otherwise go stale
 * on the one number that changes.
 */
export interface MembershipTarget {
    slug: string
    /** `null` falls back to the slug. A handle in "Become a member of …" reads like a database row. */
    name: string | null
    /**
     * The channel's **id**, which only the "am I already a member?" query needs —
     * `my-subscriptions/?channel_id=` takes an id while `subscribe/` posts to the slug's endpoint.
     *
     * Optional, because a target assembled where the id is not to hand (a post, a message) can still
     * open the flow: without it the activated state simply is not known, and the invitation shows.
     */
    id?: string | null
    /** The creator's picture, badged onto the dialogs' illustration tile. */
    avatarUrl?: string | null
}
