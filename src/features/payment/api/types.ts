import { z } from 'zod'

/**
 * The payments service's DTOs — `paymee`.
 *
 * Five payloads, one file, because they are read together: a checkout screen needs the gateway list,
 * the price list, the saved cards, and the shape of what `checkout/` answers, and none of them means
 * anything without the others.
 *
 * ## Parsed per field, never thrown
 *
 * Same rule as `features/membership/api/types.ts` and `features/donation/api/types.ts`: a
 * `.catch()` per field so one renamed key costs one row rather than the screen, and `looseObject` so
 * the half of the payload this client does not model stays visible to whoever needs it next.
 *
 * ## Wire names are kept, with two exceptions
 *
 * `fee_percent_rate`, `min_unit`, `bonus_amount` stay as they arrive — a DTO that echoes the wire is
 * one less mapping to get wrong, and every comparison against **B**-numbers in
 * [`docs/BACKEND_QUESTIONS.md`](../../../../docs/BACKEND_QUESTIONS.md) reads directly. The two
 * exceptions are the ones that are *configuration* rather than data — `StripeConfig.publishableKey`
 * and `SetupIntent.clientSecret` — renamed once here so no consumer of a secret carries wire casing
 * around.
 *
 * Field names come from legacy (`models/{stripe,payment}.js` and its call sites); the contract is not
 * confirmed. See §7 of [`docs/PAYMENT.md`](../../../../docs/PAYMENT.md).
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

/** Lower-cased, for the fields compared against a vocabulary (`brand`, `type`). */
const slugText = z
    .unknown()
    .transform(value => (typeof value === 'string' ? value.trim().toLowerCase() || null : null))
    .catch(null)

/** Ids arrive as a string or a number depending on the endpoint. Normalise to string. */
const id = z.union([z.string(), z.number()]).transform(String).catch('')

/**
 * A money amount or a rate, arriving as a number **or** a decimal string.
 *
 * `fee_percent_rate` is `"2.9"` on the wire and `price` has been seen both ways, from the same
 * service — so neither is evidence for the other. `0` for anything unusable, and `0` is meaningful
 * here: a gateway with no percentage fee genuinely has `0`, and `gatewayTotal` treats a `0`
 * conversion rate as "cannot convert" rather than as "free".
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

/** A whole number ≥ 0, for card expiry parts. `0` means "not stated" — never a valid month or year. */
const intish = z
    .unknown()
    .transform(value => {
        const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
        return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
    })
    .catch(0)

/** Digits only, as a string — `last4` arrives as `"4242"` on Stripe's side and as `4242` elsewhere. */
const digits = z
    .unknown()
    .transform(value => {
        if (typeof value !== 'string' && typeof value !== 'number') return null
        const only = String(value).replace(/\D/g, '')
        return only === '' ? null : only
    })
    .catch(null)

const boolish = z.coerce.boolean().catch(false)

/** Optional and absent both mean `null`, never `undefined`, so a consumer writes one check. */
function nullable<T extends z.ZodType>(schema: T) {
    return schema
        .nullish()
        .transform(value => value ?? null)
        .catch(null)
}

// ── Stripe config ────────────────────────────────────────────────────────────────────────────────

/**
 * `payment/v3/stripe/config/`.
 *
 * The publishable key is **fetched, not built in** (no `NEXT_PUBLIC_STRIPE_*`): it differs per
 * environment and the backend already owns which Stripe account a request settles into, so a key
 * inlined at build time is a key that can disagree with the intent it is confirming.
 */
export interface StripeConfig {
    publishableKey: string
}

const stripeConfigSchema = z.looseObject({ publishable_key: z.string().catch('') })

/**
 * `null` when the service answered without a key.
 *
 * The caller must then say Stripe is unavailable rather than mount Elements with an empty string —
 * legacy renders nothing at all in that case, which reads as a broken dialog.
 */
export function normalizeStripeConfig(body: unknown): StripeConfig | null {
    if (!body || typeof body !== 'object') return null
    const parsed = stripeConfigSchema.safeParse(body)
    if (!parsed.success || !parsed.data.publishable_key.trim()) return null
    return { publishableKey: parsed.data.publishable_key.trim() }
}

// ── Saved cards ──────────────────────────────────────────────────────────────────────────────────

/**
 * One row of `payment/v3/my-payment-methods/` — a Stripe PaymentMethod this account has saved.
 *
 * `card` is **nullable and the type is kept**, even though every row legacy has ever rendered is a
 * card: a saved `link` or `paypal` method carries no `card` block, and legacy's UI would print
 * `*undefined` for it. Keeping both means `lib/card-brand.ts` can decide what a row without card
 * details says, instead of the parser deciding it does not exist.
 */
export const savedCardSchema = z.looseObject({
    id: z.string().catch(''),
    /** Stripe's own flag for the account's default method. Legacy's `item.default`. */
    default: boolish,
    /** `card`, `link`, … Legacy never reads it; the row label needs it. */
    type: slugText,
    card: nullable(
        z.looseObject({
            /** `visa`, `mastercard`, `amex`, … lower-cased. */
            brand: slugText,
            last4: digits,
            exp_month: intish,
            exp_year: intish,
            /** `credit` / `debit` / `prepaid`. Not rendered yet; kept because the payload has it. */
            funding: slugText,
        }),
    ),
})

export type SavedCard = z.infer<typeof savedCardSchema>

/**
 * The saved methods, in the order the service sent them.
 *
 * Rows without an `id` are dropped — the id is what `DELETE`, `set-as-default/` and
 * `confirmCardPayment({ payment_method })` all take, so a row without one is a row that cannot be
 * selected, deleted, or paid with. Everything else is kept and left to the row to render.
 *
 * ⚠ **Order is not authority.** Legacy takes `data[0]` as the default whenever no row is flagged;
 * that is `pickDefaultCard`'s job below, stated once, rather than an index guessed at three call
 * sites.
 */
export function normalizeSavedCards(body: unknown): SavedCard[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown })?.results)
          ? (body as { results: unknown[] }).results
          : []
    const cards: SavedCard[] = []
    for (const row of rows) {
        const parsed = savedCardSchema.safeParse(row)
        if (parsed.success && parsed.data.id) cards.push(parsed.data)
    }
    return cards
}

/**
 * The account's default method: the flagged one, else the first, else `null`.
 *
 * Legacy's `findIndex(item => item.default)` with a `[0]` fallback, kept because it is the right
 * behaviour — but kept **once**.
 *
 * ⚠ **Not what a checkout should start on.** This says nothing about whether the card can be *paid
 * with*: an expired card is a legitimate default and a guaranteed decline, so a payment surface asks
 * `pickPayableCard` (`lib/card-brand.ts`) instead. This one is for the management screen, where the
 * expired default is the row the reader is there to fix.
 */
export function pickDefaultCard(cards: readonly SavedCard[]): SavedCard | null {
    return cards.find(card => card.default) ?? cards[0] ?? null
}

// ── A SetupIntent, for adding a card ─────────────────────────────────────────────────────────────

/**
 * What `POST my-payment-methods/` answers: a Stripe SetupIntent to confirm with
 * `stripe.confirmSetup` / `confirmCardSetup`.
 *
 * It is a **secret**, and the one rule that follows is stated here because this is where it enters
 * the app: it never goes into a query key, localStorage, a URL, or a log line. It lives in the
 * dialog's own state for as long as the dialog is open.
 */
export interface SetupIntent {
    id: string | null
    clientSecret: string
}

const setupIntentSchema = z.looseObject({
    id: nullableText,
    client_secret: z.string().catch(''),
})

/** `null` when there is no usable secret — the caller shows an error rather than an empty form. */
export function normalizeSetupIntent(body: unknown): SetupIntent | null {
    if (!body || typeof body !== 'object') return null
    const parsed = setupIntentSchema.safeParse(body)
    if (!parsed.success || !parsed.data.client_secret.trim()) return null
    return { id: parsed.data.id, clientSecret: parsed.data.client_secret.trim() }
}

// ── Gateways ─────────────────────────────────────────────────────────────────────────────────────

/** The gateway id every checkout body carries as `payment_method`. Legacy hard-codes this string. */
export const STRIPE_GATEWAY_ID = 'gw.stripe'

/**
 * The currency a gateway charges in.
 *
 * `id` is a **symbol or a code** depending on the row (`'$'`, `'VND'`) — that is legacy's own
 * `currency.id`, and it is why `lib/gateway-fee.ts` compares against `'$'` rather than `'USD'`.
 * `min_unit` is the smallest amount the gateway will take (1 for VND, 0.01 for USD); `0` means the
 * service did not say, and the total then stays in USD rather than being converted with a guess.
 */
export const gatewayCurrencySchema = z.looseObject({
    id: z.string().catch(''),
    usd_conversion_rate: numeric,
    min_unit: numeric,
})

export type GatewayCurrency = z.infer<typeof gatewayCurrencySchema>

/**
 * One row of `payment/v3/payment-methods/` — a way to pay, not a saved card.
 *
 * A real row, for reference (`gw.stripe`, from a settle response):
 *
 * ```json
 * { "id": "gw.stripe", "name": "Credit or Debit Card (USD)", "gateway": "gw.stripe",
 *   "images": ["…ic_colored_mastercard.svg", "…ic_colored_visa.svg"],
 *   "fee_flat_amount": "0.60", "fee_percent_rate": "25.00", "currency": null,
 *   "payment_info": null, "min_payment_amount": "0.00", "max_payment_amount": null }
 * ```
 *
 * Three things that payload settles, and they were all guesses before it:
 * `fee_*` really are decimal **strings**; `currency` really can be `null` on a live gateway (so
 * `gatewayTotal`'s "stays in USD and says so" branch is the normal case, not a defensive one); and
 * `id` duplicates a `gateway` field, which nothing here reads — one name for one thing.
 */
export const gatewaySchema = z.looseObject({
    /** `gw.stripe`, `gw.coda`, … Sent back as `payment_method` on the checkout body. */
    id: z.string().catch(''),
    name: nullableText,
    /** Logos. Legacy reads `images[0]` unguarded; an empty array is normal for a new gateway. */
    images: z
        .unknown()
        .transform(value =>
            Array.isArray(value)
                ? value.filter((url): url is string => typeof url === 'string' && url.trim() !== '')
                : [],
        )
        .catch([]),
    /** Percentage, **not** a fraction: `2.9` means 2.9%. */
    fee_percent_rate: numeric,
    fee_flat_amount: numeric,
    currency: nullable(gatewayCurrencySchema),
    /**
     * The band this gateway will accept, in **USD** (the currency `price` and `donation_usd_amount`
     * are in).
     *
     * `min_payment_amount` arrives as `"0.00"` for a gateway with no floor and `max_payment_amount` as
     * `null` for one with no ceiling, so both are read as "no limit" at those values — a `0` maximum
     * would otherwise mean nothing can be paid, which is not what an absent ceiling says.
     *
     * Modelled because a gateway that refuses an amount refuses it at the **checkout POST**: without
     * this the sheet happily offers a $0.99 package to a wallet with a $5 floor, and the reader presses
     * Pay to get a 400 with no explanation. See `gatewayAccepts`.
     */
    min_payment_amount: numeric,
    max_payment_amount: nullable(
        z.unknown().transform(value => {
            if (typeof value === 'number') return Number.isFinite(value) ? value : null
            if (typeof value !== 'string') return null
            const parsed = Number.parseFloat(value.trim())
            return Number.isFinite(parsed) ? parsed : null
        }),
    ),
})

export type Gateway = z.infer<typeof gatewaySchema>

/** Rows without an `id` are dropped: the id is what the checkout body is built from. */
export function normalizeGateways(body: unknown): Gateway[] {
    const rows = Array.isArray(body) ? body : []
    const gateways: Gateway[] = []
    for (const row of rows) {
        const parsed = gatewaySchema.safeParse(row)
        if (parsed.success && parsed.data.id) gateways.push(parsed.data)
    }
    return gateways
}

// ── Star packages ────────────────────────────────────────────────────────────────────────────────

/**
 * One row of `stars/v3/conversion-packages/` — an amount of Star at a USD price.
 *
 * ⚠ **`amount` is what the checkout body sends**, as `quantity`. Legacy never sends the package id
 * at all (`useGetStar.handlePayNow`), which means the price is derived server-side from the Star
 * count. If that is wrong, every Star purchase is wrong — **B63**.
 */
export const starPackageSchema = z.looseObject({
    id,
    /** Star granted, before the bonus. */
    amount: numeric,
    /** Extra Star on top. `0` for an ordinary package; `> 0` is what earns the "bonus" badge. */
    bonus_amount: numeric,
    /** USD, before the gateway's fee. `lib/gateway-fee.ts` turns this into what is charged. */
    price: numeric,
    /**
     * Backoffice tags on the row — in practice `["Most popular"]` on exactly one package.
     *
     * Parsed the same defensive way as a gateway's `images`, because it is the same shape of field:
     * an array the backend may extend, on a `looseObject` this client does not own. It is read only to
     * **locate** the recommended tile (`recommendedIndex`); the words on the badge stay ours, because
     * the payload's are English and this app ships in nine languages.
     */
    labels: z
        .unknown()
        .transform(value =>
            Array.isArray(value)
                ? value.filter((label): label is string => typeof label === 'string')
                : [],
        )
        .catch([]),
})

export type StarPackage = z.infer<typeof starPackageSchema>

/**
 * The packages, dropping any row that cannot be bought.
 *
 * Stricter than the other parsers on purpose: a package is two facts — how much Star and how much
 * money — and a row missing either is a tile that either sells nothing or costs nothing. On a screen
 * that takes money, a `$0` tile is the expensive failure.
 *
 * Accepts a bare array **or** billy's `{ results }` envelope: legacy reads `data.data.results`, and
 * an endpoint that stops paginating should not empty the sheet.
 */
export function normalizeStarPackages(body: unknown): StarPackage[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown })?.results)
          ? (body as { results: unknown[] }).results
          : []
    const packages: StarPackage[] = []
    for (const row of rows) {
        const parsed = starPackageSchema.safeParse(row)
        if (parsed.success && parsed.data.amount > 0 && parsed.data.price > 0) {
            packages.push(parsed.data)
        }
    }
    return packages
}

// ── Settling ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The backend code for **"received, not settled yet"** — `payment/v3/stripe/callback/` answers a
 * non-2xx carrying it while the bank is still deciding.
 *
 * It is not an error, and treating it as one is the single most consequential mistake available on
 * this path: the money has left and the screen would say it failed. It arrives as `ApiError.code`
 * because the response is non-2xx (see `shared/lib/api/errors.ts`).
 */
export const PENDING_SETTLEMENT_CODE = 'PM0003'

/**
 * What one poll of the callback endpoint means. Three answers, and the third one is not a failure of
 * the *request* — see `api/checkout-api.ts` for which HTTP statuses map where.
 */
export type SettleOutcome =
    /** Money moved. `purchaseType` is the response's `type`, used only to pick the success copy. */
    | { status: 'settled'; purchaseType: string | null }
    /** `PM0003`. Ask again later; the caller owns the schedule (`lib/settle-poll.ts`). */
    | { status: 'pending' }
    /**
     * The gateway or the backend refused it, terminally. `text` is the backend's own sentence and is
     * only ever taken from a **4xx** body — the same narrow rule `signInErrorText` documents in
     * `features/auth`, for the same reason: a 5xx body is where stack fragments live.
     */
    | { status: 'rejected'; text: string | null; code: string | null }

// ── The reader's own top-ups ─────────────────────────────────────────────────────────────────────

/**
 * One row of `GET checkout/v3/checkout/` — a Star purchase this account has made.
 *
 * ## Not the Star ledger, and the difference is the point
 *
 * `/my-star` lists **balance movements** from billy: Star arriving and leaving, whatever the reason.
 * This lists **payments** from paymee: what was paid, through which gateway, and **whether it went
 * through**. A top-up that failed or is still pending has no ledger entry at all — it is exactly the
 * row somebody opens this list to find, having been charged and not credited.
 *
 * ## Every field is optional to the parser, including the ones the row is built from
 *
 * `payment` is a nested object legacy reads unguarded (`item.payment.payment_method?.images[0]` — the
 * `payment` itself never checked), and a `null` there is one `TypeError` away from an empty dialog.
 * Same rule as the rest of this file: a `.catch()` per field, `looseObject` so the half nobody models
 * stays readable.
 *
 * The **status vocabulary is not confirmed** (B87). It is kept as the lower-cased wire string and
 * mapped to a label by `lib/transaction-status.ts`, which fails to "pending" rather than printing a
 * backend token at somebody.
 */
export const starTransactionSchema = z.looseObject({
    id,
    /** Star bought, before any bonus. Legacy prints it as `{n} STAR`. */
    top_up_quantity: numeric,
    /** `succeeded` / `pending` / … — see `lib/transaction-status.ts` and **B87**. */
    status: slugText,
    created_at: nullableText,
    payment: nullable(
        z.looseObject({
            /** What was charged, in `amount_currency`. */
            amount: numeric,
            amount_currency: nullableText,
            payment_method: nullable(
                z.looseObject({
                    id,
                    name: nullableText,
                    images: z
                        .unknown()
                        .transform(value =>
                            Array.isArray(value)
                                ? value.filter(
                                      (url): url is string =>
                                          typeof url === 'string' && url.trim() !== '',
                                  )
                                : [],
                        )
                        .catch([]),
                }),
            ),
        }),
    ),
})

export type StarTransaction = z.infer<typeof starTransactionSchema>

/** One page of top-ups, plus the total the backend reports. */
export interface StarTransactionPage {
    rows: StarTransaction[]
    /**
     * Total across all pages, or `null` when the payload does not say.
     *
     * Worth carrying because this endpoint **has** one, where billy's ledger does not — so paging can
     * stop exactly rather than by inferring from a short page, which is the compromise
     * `use-star-ledger.ts` documents (and B38 asks to remove).
     */
    count: number | null
}

/**
 * The rows, dropping any that carries no id — the id is the list key and the reference somebody
 * quotes to support.
 *
 * Accepts the paginated envelope (`{ results, count }`) or a bare array, the same latitude
 * `normalizeStarPackages` allows: this client does not own the shape and a backend that stops
 * paginating should not empty the dialog.
 */
export function normalizeStarTransactions(body: unknown): StarTransactionPage {
    const source = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown } | null)?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []
    const rawCount = (body as { count?: unknown } | null)?.count
    const count = typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : null

    const rows: StarTransaction[] = []
    for (const row of source) {
        const parsed = starTransactionSchema.safeParse(row)
        if (parsed.success && parsed.data.id) rows.push(parsed.data)
    }
    return { rows, count }
}
