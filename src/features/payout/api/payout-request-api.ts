import { balanceKeys } from '@features/balance'
import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import { z } from 'zod'

/**
 * The **withdraw request** flow — `payout-options/`, `payout/quote/` and `POST payout-request/`.
 *
 * Its own file rather than more methods on `payout-api.ts`, for two reasons and only one of them is
 * about merge conflicts. `payout-api.ts` is the *reading* surface the tracking and method screens share;
 * this is the one place in the feature that **spends money**, and it has a contract of its own — a quote
 * that must be taken before a request, and a 4xx vocabulary the read endpoints do not have.
 *
 * Contract read off the live OpenAPI schema (`api.tevi.dev/billy/docs/schema/v5/?format=json`,
 * 2026-08-28) and cross-checked against `web-app`'s `usePayoutRequest.js`. Where the two disagree, the
 * disagreement is written down rather than resolved silently — see `createRequest`.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

/**
 * Legacy's page size for both lists on this screen — `getPayoutConfigs(1, 50)` and
 * `getPayoutOptions(1, 50)`.
 *
 * 50 and not 20: these are *pickers*, not feeds. A second page of withdraw methods behind a "load more"
 * on a screen whose whole job is to choose one would be a way to hide the method somebody wanted, and
 * nobody has fifty payout methods.
 */
export const PAYOUT_PICKER_PAGE_SIZE = 50

/**
 * The floor when the method states none — legacy's, hard-coded there as `minAmount = 10`.
 *
 * ⚠ **A fallback, not the rule.** The live `payout-configs/` payload carries
 * `payout_method.minimum_amount` per method (`"15.00"` on VAI Wallet, `null` on bank transfer), and
 * legacy ignores it entirely: it validates every method against 10 and lets the server refuse the ones
 * that need more. So a VAI withdrawal of 12 passes the form and comes back a 4xx.
 *
 * `payoutAmountError` takes the method's figure when there is one and falls back to this.
 */
export const PAYOUT_MIN_AMOUNT = 10

/**
 * Query keys, under `balanceKeys.all` like everything else in the wallet: a successful withdrawal moves
 * the balance, so whatever invalidates the figure invalidates these too.
 *
 * The quote is keyed on **all three inputs** because it is priced from all three — a cached quote for a
 * different amount is a wrong number on a confirmation screen.
 */
export const payoutRequestKeys = {
    all: [...balanceKeys.all, 'payout-request'] as const,
    options: (accountId: string | null) =>
        [...balanceKeys.all, 'payout-request', 'options', accountId ?? 'anon'] as const,
    quote: (accountId: string | null, configId: string, optionId: string, amount: string) =>
        [
            ...balanceKeys.all,
            'payout-request',
            'quote',
            accountId ?? 'anon',
            configId,
            optionId,
            amount,
        ] as const,
}

/* ============================== payout options ============================== */

/**
 * A withdraw speed — `saving` or `fast`.
 *
 * The **id is the vocabulary**: legacy switches on it (`case 'saving'` / `case 'fast'`) to pick which
 * card to draw, and the OpenAPI schema types `payout_option_id` as exactly that enum. So an id this
 * client does not know is a card it cannot draw, and `payoutOptionKind` says so rather than guessing.
 */
export type PayoutOptionKind = 'saving' | 'fast'

export interface PayoutOption {
    id: string
    /** `null` for an id this client has no card for — the caller then skips it. */
    kind: PayoutOptionKind | null
    /**
     * The option's own fee rate, as a percentage — `0.5` means 0.5%.
     *
     * Shown on the card (*"Fee: 0.5%"*) and **not** used to compute anything: the charge comes back on
     * the quote. Legacy prints the rate and multiplies nothing, which is the right split — the server
     * prices the payout.
     */
    percentFeeRate: number
    flatFeeAmount: number
    /**
     * `metadata.payout_duration` — **days for `saving`, and also days for `fast`**, which legacy then
     * renders as hours (`× 24`). The unit is the same; only the sentence differs. Same trap as
     * `payoutEta`, which already carries the reasoning.
     */
    durationDays: number | null
    /**
     * Whether the platform is offering this speed at all.
     *
     * **The live payload has `fast` with `is_active: false`**, which this client was ignoring — so the
     * card was offered, selectable, and would have submitted an option the server has switched off.
     * Legacy ignores the field too; that is not a reason to.
     *
     * Absent is treated as **active**, which is the only safe default in that direction: a payload that
     * stops sending the flag must not empty the picker.
     */
    isActive: boolean
}

const numeric = z
    .unknown()
    .optional()
    .transform(value => {
        const parsed = typeof value === 'number' ? value : Number(value)
        return Number.isFinite(parsed) ? parsed : 0
    })

const optionSchema = z.looseObject({
    id: z.union([z.string(), z.number()]).nullish(),
    percent_fee_rate: numeric,
    flat_fee_amount: numeric,
    is_active: z.boolean().nullish(),
    metadata: z.looseObject({ payout_duration: z.unknown().optional() }).nullish(),
})

/** `saving` / `fast` only — see `PayoutOptionKind`. */
export function payoutOptionKind(id: string): PayoutOptionKind | null {
    const slug = id.trim().toLowerCase()
    return slug === 'saving' || slug === 'fast' ? slug : null
}

export function normalizePayoutOptions(body: unknown): PayoutOption[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown } | null)?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const out: PayoutOption[] = []
    for (const row of rows) {
        const parsed = optionSchema.safeParse(row)
        if (!parsed.success) continue
        const id =
            parsed.data.id === null || parsed.data.id === undefined ? '' : String(parsed.data.id)
        // No id, no option: `payout_option_id` is required on both POSTs, so it could not be submitted.
        if (!id) continue

        const raw = parsed.data.metadata?.payout_duration
        const days = typeof raw === 'number' ? raw : Number(raw)
        out.push({
            id,
            kind: payoutOptionKind(id),
            percentFeeRate: parsed.data.percent_fee_rate,
            flatFeeAmount: parsed.data.flat_fee_amount,
            durationDays: Number.isFinite(days) && days > 0 ? days : null,
            // Absent ⇒ active. See the field: the other default would empty the picker on a payload change.
            isActive: parsed.data.is_active !== false,
        })
    }
    return out
}

/* ============================== the quote ============================== */

/**
 * What a withdrawal would actually cost — `POST payout/quote/`.
 *
 * The **server prices the payout**, and this is the one figure the confirmation screen may show. The
 * client computes nothing: legacy's `subReceiveAmount` (`amount × rate`) is a *preview* drawn before the
 * quote lands, never the number somebody confirms.
 *
 * `id` is what makes it a quote rather than an estimate — it goes back on the request as `quote_id`, so
 * the server can hold the price it stated. Legacy sends `payoutSummary?.id || ''`; the schema has the
 * field as optional, which means a request without it is priced fresh.
 */
export interface PayoutQuote {
    id: string
    /**
     * **The amount this quote priced**, and the reason it is parsed: it is the only way to know a
     * `quote_id` belongs to the figure being submitted.
     *
     * The quote query is keyed on a *debounced* amount, so for up to a second after a keystroke
     * `quoteQuery.data` is the answer for the **previous** figure. Sending that id alongside the new
     * amount asks the server to honour a price it quoted for a different sum — see
     * `usePayoutRequestForm.submit`, which now compares the two.
     */
    amount: number | null
    /** The unit `amount` is in — `TEVI` on the live payload, i.e. **not** the settlement currency. */
    amountCurrency: string
    /** In the **settlement** currency (`netAmountCurrency`), which is not the wallet's unit. */
    netAmount: number | null
    netAmountCurrency: string
    /** Total fee, in the amount's own currency. */
    fee: number | null
    feeCurrency: string
    /** The rate this quote was priced at. `null` when the payload states none. */
    exchangeRate: number | null
    /**
     * Epoch ms at which the held price stops being valid — the live payload gives **300 seconds** past
     * `created_at`.
     *
     * This client was not reading it, which means a reader who left the tab open would submit a
     * `quote_id` the server has already dropped, and the 4xx that comes back is the one
     * `payout-request-errors.ts` classifies as `quote-expired`. Reading it lets the screen re-quote
     * *before* the press instead of after the failure.
     *
     * `null` when the payload states none — the quote is then treated as not expiring, which is the
     * behaviour this client had all along.
     */
    expiresAt: number | null
    /** Per-fee breakdown, keyed by `type` — legacy reduces the array into exactly this. */
    fees: Record<string, PayoutQuoteFee>
}

export interface PayoutQuoteFee {
    type: string
    /**
     * The figures to **print**, which come from `original` when there is one — see `isWaived`.
     *
     * So on a waived fee these are the *pre*-waiver numbers, and the amount actually taken is zero.
     * That split is deliberate and it is legacy's: the reader is shown what the fee *would* have been,
     * struck through, next to *Free*.
     */
    subtotal: number | null
    subtotalCurrency: string
    flatFeeAmount: number
    percentFeeRate: number
    /**
     * **This fee was waived** — `original` is present on the wire.
     *
     * The waiver is expressed by *nesting*, not by a flag: when a fee is free the top level holds the
     * charged figures (zero) and `original` holds what it would have been. So `Boolean(original)` is
     * the whole test, which is exactly what legacy's `isFree` is
     * (`withdrawDetail/.../detail/index.js`: `isFree: Boolean(payoutFee?.original)`).
     *
     * The first free transaction is the case that produces it — `payout/free-first-transaction-fee/`
     * answers `is_used` for the same reason.
     */
    isWaived: boolean
}

const nullableNumeric = z
    .unknown()
    .optional()
    .transform(value => {
        if (value === null || value === undefined || value === '') return null
        const parsed = typeof value === 'number' ? value : Number(value)
        return Number.isFinite(parsed) ? parsed : null
    })

const currencyCode = z
    .unknown()
    .optional()
    .transform(value => (typeof value === 'string' ? value.trim().toUpperCase() : ''))

const feeFiguresSchema = z.looseObject({
    subtotal: z.looseObject({ amount: nullableNumeric, currency: currencyCode }).nullish(),
    flat_fee_amount: numeric,
    percent_fee_rate: numeric,
})

/**
 * A fee row, with the **waived** variant nested inside it.
 *
 * `original` carries the same three figures one level down, and its mere presence means the fee was
 * not charged. Same schema on both levels so a shape change is one edit — and so `original.original`,
 * if the backend ever nested twice, is simply ignored rather than parsed into something.
 */
const quoteFeeSchema = feeFiguresSchema.extend({
    type: z.string().nullish(),
    original: feeFiguresSchema.nullish(),
})

const quoteSchema = z.looseObject({
    id: z.union([z.string(), z.number()]).nullish(),
    amount: nullableNumeric,
    amount_currency: currencyCode,
    net_amount: nullableNumeric,
    net_amount_currency: currencyCode,
    fee: nullableNumeric,
    fee_currency: currencyCode,
    exchange_rate: nullableNumeric,
    expires_at: nullableNumeric,
    fee_details: z.array(quoteFeeSchema).nullish(),
})

export function normalizePayoutQuote(body: unknown): PayoutQuote | null {
    const parsed = quoteSchema.safeParse(body)
    if (!parsed.success) return null

    const fees: Record<string, PayoutQuoteFee> = {}
    for (const fee of parsed.data.fee_details ?? []) {
        const type = (fee.type ?? '').trim().toLowerCase()
        // A fee with no type cannot be labelled, and an unlabelled charge on a fee breakdown is worse
        // than one line fewer — the caller falls back to billy's slug when it has one.
        if (!type) continue
        /*
         * **`original` first, and its presence is the waiver.** Legacy reads
         * `payout_fee?.original?.flat_fee_amount || payout_fee?.flat_fee_amount || 0` for all three
         * figures, at seven call sites across two screens.
         *
         * `??` and not `||` for `subtotal`, which is the one that matters: a genuinely-zero original
         * subtotal is a real value, and `||` would fall through to the charged figure and print the
         * wrong number. Legacy uses `||` throughout and gets away with it because a waived fee's
         * original is never zero — that is a property of the data, not of the code.
         */
        const shown = fee.original ?? fee
        fees[type] = {
            type,
            subtotal: shown.subtotal?.amount ?? null,
            subtotalCurrency: shown.subtotal?.currency ?? '',
            flatFeeAmount: shown.flat_fee_amount,
            percentFeeRate: shown.percent_fee_rate,
            isWaived: fee.original !== null && fee.original !== undefined,
        }
    }

    return {
        id: parsed.data.id === null || parsed.data.id === undefined ? '' : String(parsed.data.id),
        amount: parsed.data.amount,
        amountCurrency: parsed.data.amount_currency,
        netAmount: parsed.data.net_amount,
        netAmountCurrency: parsed.data.net_amount_currency,
        fee: parsed.data.fee,
        feeCurrency: parsed.data.fee_currency,
        exchangeRate: parsed.data.exchange_rate,
        expiresAt: parsed.data.expires_at,
        fees,
    }
}

/* ============================== the request ============================== */

/** What the server answers with on a created request — only the id is read. */
export interface CreatedPayout {
    id: string
}

export const payoutRequestApi = {
    /**
     * The withdraw speeds on offer. **Not** filtered here: which of them a given account may use is a
     * product rule (`fast` is gated on Premium + a verified badge in legacy), and a model that dropped
     * rows would hide the reason from the screen that has to explain it.
     */
    async getOptions({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<PayoutOption[]> {
        const body = await api.get<unknown>(
            'v5/billing/payout-options/',
            { page: 1, page_size: PAYOUT_PICKER_PAGE_SIZE },
            /*
             * An hour, not a day, and the shorter tier is the whole point: this body carries fee
             * rates *and* `is_active`, which is the platform switching a speed off. The ETag is
             * what makes even that safe — the client still asks on every read and a changed body
             * comes back as a `200` — so the TTL only bounds how long a validator is worth
             * keeping. An hour is what that is worth for a switch somebody flips deliberately.
             */
            {
                signal,
                ...(accountId ? { accountId } : {}),
                cache: { persist: true, shared: true, ttlMs: CACHE_TTL.hour },
            },
        )
        return normalizePayoutOptions(body)
    },

    /**
     * Price a withdrawal — `POST payout/quote/`.
     *
     * A **POST that reads**, so it must never be retried by the transport: `client.ts` only replays a
     * POST given `{ retry: true }`, which this deliberately does not pass. Quoting twice is harmless in
     * itself, but a quote holds a price server-side and duplicating them is not this screen's business.
     *
     * `amount` goes over as a **string**, because the schema types it `decimal`. Sending a JS number
     * would hand the server whatever `JSON.stringify` makes of a float, and on money that is not a
     * detail — `0.1 + 0.2` is the standard example.
     */
    async getQuote({
        configId,
        optionId,
        amount,
        accountId,
        signal,
    }: {
        configId: string
        optionId: string
        amount: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<PayoutQuote | null> {
        const body = await api.post<unknown>(
            'v5/billing/payout/quote/',
            {
                payout_config_id: configId,
                payout_option_id: optionId,
                amount,
            },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizePayoutQuote(body)
    },

    /**
     * Create the withdrawal — `POST payout-request/`.
     *
     * **Never retried.** It is not idempotent as far as this client knows (B-series question below), and
     * a 502 arriving after the write landed would duplicate somebody's withdrawal. `client.ts` will not
     * replay a POST without `{ retry: true }`, so this is safe by default — stated because the safety
     * comes from an omission, and an omission is easy to add to by accident.
     *
     * ## `passcode`, and where this diverges from the schema
     *
     * Legacy sends five fields: `amount`, `payout_config_id`, `payout_option_id`, `quote_id`, and
     * **`passcode`**. The OpenAPI schema documents only the first four. `passcode` is legacy's 2FA hook
     * (`open.twoFa` in `usePayoutRequest.js`), and the flow that would collect one is **not built here**
     * — no screen in this app asks for a payout passcode yet.
     *
     * So it is accepted as an optional argument and simply not sent when absent. That is the honest
     * middle: the field is not invented into every request, and the day a 2FA step lands it has a
     * parameter waiting rather than a signature change.
     *
     * `quote_id` is likewise omitted rather than sent empty. Legacy sends `''`, and an empty string is a
     * value — a server validating the field would reject it where an absent field is priced fresh.
     * `createApiModel` strips empty params on a GET; a POST body is passed through as given, so this
     * builds the object field by field.
     */
    async createRequest({
        configId,
        optionId,
        amount,
        quoteId,
        passcode,
        accountId,
        signal,
    }: {
        configId: string
        optionId: string
        amount: string
        quoteId?: string
        passcode?: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<CreatedPayout> {
        const payload: Record<string, string> = {
            payout_config_id: configId,
            payout_option_id: optionId,
            amount,
        }
        if (quoteId) payload.quote_id = quoteId
        if (passcode) payload.passcode = passcode

        const body = await api.post<unknown>('v5/billing/payout-request/', payload, {
            signal,
            ...(accountId ? { accountId } : {}),
        })

        const parsed = z
            .looseObject({ id: z.union([z.string(), z.number()]).nullish() })
            .safeParse(body)
        const id =
            parsed.success && parsed.data.id !== null && parsed.data.id !== undefined
                ? String(parsed.data.id)
                : ''
        return { id }
    },
}
