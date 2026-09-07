/**
 * The DTOs behind the two **setup** screens — countries, methods, and the methods this account has
 * already configured.
 *
 * Sibling of `./types.ts`, which reads the payout *requests*. Split because they are two contracts
 * that happen to share a service: a request is a movement of money and a config is a destination for
 * one, and the request parser is already 400 lines of its own reasoning.
 *
 * ## What the published schema does not say
 *
 * `billy/docs/schema/v5` declares `PayoutMethodConfigForm` as `{ field, display_name }` — and the
 * live payload carries a third key, `choices`, an array of `{ id, name, logo }`. That array *is* the
 * form for two methods: USDT's `network` and Bank Transfer's `bank` are both picked from it, and
 * legacy reads `config.form[i].choices` directly. So it is parsed here as an optional array rather
 * than trusted from the schema, and a method whose choices arrive in a shape this client cannot read
 * degrades to a free-text field instead of an empty dropdown. **B89** asks for it to be published.
 *
 * `looseObject` everywhere, for `./types.ts`'s reason: a key this client has not been told about must
 * never cost the reader the row it appeared on.
 */
import { epochMs } from '@features/balance'
import { z } from 'zod'
import { numeric } from './types'

/**
 * A dropped or surprising row, in the console, in development only.
 *
 * Every parser in this feature drops a row it cannot read and keeps the page — the right trade for a
 * reader, and a **silent** one for whoever has to explain why `count` says 5 and the screen shows 4.
 * That question was asked about `payout-methods/` and could only be answered by reading the payload by
 * hand; this is what makes the next one a console line.
 *
 * `NODE_ENV` and not a feature flag: it is a diagnostic for whoever is building the screen, and a
 * production console is not a place to publish what a backend sent.
 */
function warnRow(message: string, detail: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') console.warn(`[payout] ${message}`, detail)
}

/** Best effort at naming the row in a warning — an id if it has one, its index otherwise. */
function rowLabel(row: unknown, index: number): string {
    const id = (row as { id?: unknown } | null)?.id
    return id == null ? `#${index}` : String(id)
}

/* ============================== countries ============================== */

/** One country the reader may pick as their billing country. */
export interface PayoutCountry {
    /** ISO alpha-2, **upper-cased** — the value `payout-methods/?countryCode=` takes. */
    code: string
    name: string
}

const countrySchema = z.looseObject({
    alpha_2: z.string().nullish(),
    name: z.string().nullish(),
    allow_payout: z.boolean().nullish(),
})

/**
 * The countries a payout may be sent to, `allow_payout` only.
 *
 * The filter is legacy's (`countries.filter(country => country.allow_payout)`) and it is not
 * cosmetic: a country the backend has switched off returns an empty method list, so offering it is
 * offering a dead end. A row with no `alpha_2` is dropped for the same reason — the code is what the
 * next request is made with.
 *
 * Sorted by name in the reader's own locale, which legacy does not do: billy returns them in ISO
 * order (`AF`, `AX`, `AL`, …), so "United States" sits between two countries nobody was looking for.
 * The comparison is `localeCompare`, so `Åland` files under A in Swedish and after Z in nothing.
 */
export function normalizePayoutCountries(body: unknown, locale = 'en'): PayoutCountry[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown } | null)?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const out: PayoutCountry[] = []
    for (const row of rows) {
        const parsed = countrySchema.safeParse(row)
        if (!parsed.success) continue
        const value = parsed.data
        if (value.allow_payout !== true) continue
        const code = (value.alpha_2 ?? '').trim().toUpperCase()
        if (!code) continue
        out.push({ code, name: (value.name ?? '').trim() || code })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, locale))
}

/* ============================== methods ============================== */

/** One option of a `choices` field — a network, a bank. */
export interface PayoutFormChoice {
    /** Billy's own id. Carried because it is a stable identity; the *name* is what is submitted. */
    id: string
    name: string
    /** The choice's own mark, backend-served. `''` when it has none. */
    logo: string
}

/** One field the backend says this method needs. */
export interface PayoutFormField {
    /** The wire key — `wallet_address`, `network`, `bank`, `account_number`. */
    field: string
    /** The backend's own label, used when this client has no translation for the key. */
    displayName: string
    /** Empty for a free-text field; non-empty makes it a picker. See the note on `choices` above. */
    choices: PayoutFormChoice[]
}

/** A payout method on offer for a country — the rows on `/my-wallet/setup-payouts`. */
export interface PayoutMethodOption {
    id: string
    name: string
    /** Lower-cased: `usdt`, `vai_wallet`, `payoneer`, `bank_transfer`, `zelle`, `stripe`, … */
    slug: string
    logo: string
    /** What the method settles in — printed after the name, `Bank Transfer 24/7 (VND)`. */
    currency: string
    countryName: string
    /** How long the method itself takes, in the backend's words. `''` when it says nothing. */
    processingTimeNote: string
    /** `null` when billy sent no readable figure — never `0`, which would read as "no limit left". */
    dailyLimit: number | null
    minimumAmount: number | null
    form: PayoutFormField[]
}

const choiceSchema = z.looseObject({
    id: z.union([z.string(), z.number()]).nullish(),
    name: z.string().nullish(),
    logo: z.string().nullish(),
})

const formFieldSchema = z.looseObject({
    field: z.string().nullish(),
    display_name: z.string().nullish(),
    // Absent from the published schema, present in the payload — see the file header.
    choices: z.array(choiceSchema).nullish(),
})

const methodSchema = z.looseObject({
    id: z.union([z.string(), z.number()]).transform(String),
    name: z.string().nullish(),
    slug: z.string().nullish(),
    logo: z.string().nullish(),
    currency: z.string().nullish(),
    processing_time_note: z.string().nullish(),
    daily_limit: numeric,
    minimum_amount: numeric,
    is_active: z.boolean().nullish(),
    country: z.looseObject({ name: z.string().nullish() }).nullish(),
    config: z.looseObject({ form: z.array(formFieldSchema).nullish() }).nullish(),
})

function readForm(fields: z.infer<typeof formFieldSchema>[] | null | undefined): PayoutFormField[] {
    const out: PayoutFormField[] = []
    for (const field of fields ?? []) {
        const key = (field.field ?? '').trim()
        // A field with no wire key cannot be submitted, so it cannot be asked for either.
        if (!key) continue
        out.push({
            field: key,
            displayName: (field.display_name ?? '').trim(),
            choices: (field.choices ?? []).flatMap(choice => {
                const name = (choice.name ?? '').trim()
                // The **name** is what legacy submits, so a nameless choice is unsubmittable.
                if (!name) return []
                return [
                    {
                        id: choice.id == null ? name : String(choice.id),
                        name,
                        logo: (choice.logo ?? '').trim(),
                    },
                ]
            }),
        })
    }
    return out
}

/**
 * The methods on offer, in the order billy sent them — **all of them**.
 *
 * ## `is_active` is not filtered on, and that is a correction
 *
 * This dropped `is_active === false`, on the reasoning that an inactive method is one whose form
 * submits to a 400. It was the wrong call and it showed up exactly as you would expect: a live
 * `?countryCode=VN` answering `count: 5` with four rows on screen, and **nothing anywhere saying
 * why** — the missing one was a second Bank Transfer the backoffice had switched off.
 *
 * Three reasons it is gone:
 *
 * - **legacy renders what the endpoint returns.** It never reads the flag, so what production shows
 *   today is all five. `web-app` is the spec for these screens.
 * - **the flag's meaning is not established.** "Inactive" could mean unusable, or not-promoted, or
 *   mid-configuration. Hiding a payout method on a guess means a creator cannot be paid the way they
 *   want and no screen explains it. **B89** asks.
 * - **a client-invented gate must fail open.** That is the opposite of the permission rule
 *   (`features/permission`, fail closed) and deliberately so: there the backend answers "may they",
 *   here it is listing what exists.
 *
 * An inactive row still gets a dev warning, so if these do turn up the answer to B89 is one reload
 * away rather than a payload read.
 *
 * `order` is **not** sorted on. Billy already orders the list by it, and re-sorting client-side on a
 * field two methods can share would reshuffle equal rows on every render.
 */
export function normalizePayoutMethods(body: unknown): PayoutMethodOption[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown } | null)?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const out: PayoutMethodOption[] = []
    for (const [index, row] of rows.entries()) {
        const parsed = methodSchema.safeParse(row)
        if (!parsed.success) {
            /*
             * The only way a method can vanish now. Every field but `id` is `nullish`, so this fires
             * for a row with no id — or one whose `config`/`country` arrived as something other than
             * an object, which is the shape change a `looseObject` cannot absorb.
             */
            warnRow('a payout method could not be read and was dropped', {
                row: rowLabel(row, index),
                issues: parsed.error.issues.map(
                    issue => `${issue.path.join('.')}: ${issue.message}`,
                ),
            })
            continue
        }
        const value = parsed.data
        if (value.is_active === false) {
            // Rendered anyway — see the note above. This is the line that answers B89.
            warnRow('the backend offered a method flagged is_active: false', {
                row: rowLabel(row, index),
                slug: value.slug,
            })
        }
        out.push({
            id: value.id,
            name: (value.name ?? '').trim(),
            slug: (value.slug ?? '').trim().toLowerCase(),
            logo: (value.logo ?? '').trim(),
            currency: (value.currency ?? '').trim().toUpperCase(),
            countryName: (value.country?.name ?? '').trim(),
            processingTimeNote: (value.processing_time_note ?? '').trim(),
            dailyLimit: value.daily_limit,
            minimumAmount: value.minimum_amount,
            form: readForm(value.config?.form),
        })
    }
    return out
}

/* ============================== configured methods ============================== */

/**
 * One payout method this account has saved — a row on `/my-wallet/payout-method`.
 *
 * `detail` is the same method-dependent bag `PayoutConfig.detail` carries on the request detail, and
 * it is read by the same rule: only the keys with a value, labelled from
 * `lib/payout-config-labels.ts` so one method reads identically on both screens.
 */
export interface PayoutConfigRow {
    id: string
    /** `active` · `error` · `deleted`, lower-cased. `''` when absent. */
    status: string
    createdAt: number
    contactName: string
    contactEmail: string
    /**
     * What is left of today's limit, in the **method's** currency.
     *
     * `null` when billy sent nothing readable, and the row then says so rather than printing `0` —
     * a zero here reads as "you cannot withdraw today", which is a claim about somebody's money.
     */
    dailyLimitRemainder: number | null
    methodName: string
    methodSlug: string
    methodLogo: string
    methodCurrency: string
    /**
     * `payout_method.minimum_amount` — the **smallest withdrawal this method takes**, or `null`.
     *
     * Live payload: `"15.00"` on VAI Wallet, `null` on bank transfer. Legacy does not read it and
     * validates everything against its own hard-coded 10, so a 12 USDT VAI withdrawal passes its form
     * and comes back a 4xx. Read here so the form can refuse it where the reader can see why.
     */
    methodMinimumAmount: number | null
    /**
     * `payout_method.exchange_rate` — for the `$1.00 ≈ …` line **before a quote exists**.
     *
     * The quote's rate wins once there is one (see `usePayoutRequestForm.exchangeRate`); this is what
     * fills the header on arrival. Not the *root* `exchange_rate` of a payout request — that one is a
     * different number, and `payoutComputeRate` carries the arithmetic that proved it.
     */
    methodExchangeRate: number | null
    countryName: string
    detail: Record<string, string>
}

const configRowSchema = z.looseObject({
    id: z.union([z.string(), z.number()]).transform(String),
    status: z.string().nullish(),
    created_at: epochMs,
    contact_name: z.string().nullish(),
    contact_email: z.string().nullish(),
    daily_limit_remainder: numeric,
    payout_method: z
        .looseObject({
            name: z.string().nullish(),
            slug: z.string().nullish(),
            logo: z.string().nullish(),
            currency: z.string().nullish(),
            // Both arrive as decimal **strings** — `"15.00"`, `"25429.8526"`. See the fields.
            minimum_amount: numeric,
            exchange_rate: numeric,
            country: z.looseObject({ name: z.string().nullish() }).nullish(),
        })
        .nullish(),
    payout_detail: z.record(z.string(), z.unknown()).nullish(),
})

/** Only the keys with a usable value — the same rule `readDetailBag` follows in `./types.ts`. */
function readDetail(bag: Record<string, unknown> | null | undefined): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(bag ?? {})) {
        if (typeof value === 'string' && value.trim() !== '') out[key] = value.trim()
        else if (typeof value === 'number' && Number.isFinite(value)) out[key] = String(value)
    }
    return out
}

/**
 * One page of configured methods.
 *
 * Returned in the `PagedList` shape `shared/lib/api/paged-list.ts` defines, because this list has a
 * **removal**: pressing Remove has to take one row out of the cache without refetching, which is that
 * module's `removeListRow`. `count` falls back to the page's own length when billy omits it — the
 * field is required by the serializer, and a total this client made up is only ever used to
 * decrement, never to display.
 */
export function normalizePayoutConfigPage(body: unknown): {
    results: PayoutConfigRow[]
    count: number
    next?: string | null
} {
    const envelope = (body ?? null) as { results?: unknown; count?: unknown; next?: unknown } | null
    const rows = Array.isArray(body)
        ? body
        : Array.isArray(envelope?.results)
          ? (envelope.results as unknown[])
          : []

    const results: PayoutConfigRow[] = []
    for (const [index, row] of rows.entries()) {
        const parsed = configRowSchema.safeParse(row)
        // One malformed row does not cost the reader the rest of their methods — but it does not go
        // unmentioned either: a saved payout destination missing from this list is the worst kind of
        // quiet, since `count` and the screen then disagree about how many ways they can be paid.
        if (!parsed.success) {
            warnRow('a saved payout method could not be read and was dropped', {
                row: rowLabel(row, index),
                issues: parsed.error.issues.map(
                    issue => `${issue.path.join('.')}: ${issue.message}`,
                ),
            })
            continue
        }
        const value = parsed.data
        results.push({
            id: value.id,
            status: (value.status ?? '').toLowerCase(),
            createdAt: value.created_at ?? 0,
            contactName: (value.contact_name ?? '').trim(),
            contactEmail: (value.contact_email ?? '').trim(),
            dailyLimitRemainder: value.daily_limit_remainder,
            methodName: (value.payout_method?.name ?? '').trim(),
            methodSlug: (value.payout_method?.slug ?? '').trim().toLowerCase(),
            methodLogo: (value.payout_method?.logo ?? '').trim(),
            methodCurrency: (value.payout_method?.currency ?? '').trim().toUpperCase(),
            methodMinimumAmount: value.payout_method?.minimum_amount ?? null,
            methodExchangeRate: value.payout_method?.exchange_rate ?? null,
            countryName: (value.payout_method?.country?.name ?? '').trim(),
            detail: readDetail(value.payout_detail),
        })
    }

    return {
        results,
        count: typeof envelope?.count === 'number' ? envelope.count : results.length,
        // `undefined` and `null` are different answers here — see `PagedList.next`.
        next: typeof envelope?.next === 'string' ? envelope.next : (envelope?.next as null),
    }
}

/* ============================== creating one ============================== */

/** The body `POST payout-configs/` takes. `payout_detail`'s keys depend on the method. */
export interface PayoutConfigCreation {
    payout_method_id: string
    payout_detail: Record<string, string>
    contact_name: string
    contact_email: string
}

/** What `POST payout/stripe-onboard-link/` answers — the URL to send the reader to. */
export interface StripeOnboardLink {
    url: string
    /** Epoch **seconds**, as billy sends it. `null` when absent; nothing depends on it yet. */
    expiresAt: number | null
}

const stripeLinkSchema = z.looseObject({
    url: z.string().nullish(),
    expires_at: numeric,
})

/**
 * The onboarding URL, or `null` when the body carries none.
 *
 * `null` rather than a throw, because the caller's answer to both is the same sentence — legacy's
 * `res?.data?.data?.url` check with a "Something went wrong" beside it. What is *not* reproduced is
 * legacy's `window.open(url, '_seft')`: that is a typo for `_self`, and an unknown window name opens
 * a **popup**, which every blocker eats. See `useStripeOnboard`.
 */
export function normalizeStripeOnboardLink(body: unknown): StripeOnboardLink | null {
    const parsed = stripeLinkSchema.safeParse(body)
    if (!parsed.success) return null
    const url = (parsed.data.url ?? '').trim()
    if (!url) return null
    return { url, expiresAt: parsed.data.expires_at }
}
