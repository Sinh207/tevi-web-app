/**
 * The payout DTOs, and the parse that stands between billy and the screens.
 *
 * ## Why these are parsed rather than cast
 *
 * `net_amount` arrives as a **string** (`"12.50"`), `status` is an open-ended slug, and both
 * `request_number` and `net_amount_currency` have been seen absent. Legacy handles each of those at
 * the call site — `parseFloat(payout?.net_amount) || 0`, `payout?.status || ''`,
 * `payout?.request_number || ''` — which is four screens each doing its own coercion and each free to
 * do it differently. Parsing once here means a component takes a number and a slug it can trust.
 *
 * `looseObject`, not `object`: a field this client has not been told about must not fail the row. A
 * payout the reader cannot see because a new key appeared is worse than one rendered without it.
 */
import { epochMs } from '@features/balance'
import { z } from 'zod'

/**
 * Billy's own status values, as legacy's `STATUS_MAP` enumerates them.
 *
 * Kept as a plain union rather than an enum so an unknown value stays readable — see
 * `payoutStatus()` in `lib/payout-status.ts`, which is where an unrecognised slug is handled rather
 * than dropped.
 */
export const PAYOUT_STATUSES = ['pending', 'completed', 'failed', 'waiting', 'on_hold'] as const

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

/**
 * A number from whatever billy sent, or **`null` when it did not send a readable one**.
 *
 * `z.unknown()` and not a union, so a value of an unexpected *type* cannot fail the row — a payout the
 * reader cannot see is worse than one with a figure missing, and a row still carries an id, a date and
 * a status they can quote to support.
 *
 * `null` rather than `0`, which is where this leaves legacy behind (`parseFloat(...) || 0`). A zero is
 * a **claim about somebody's money** — the same rule `TotalBalanceCard` states for `isKnown`, printing
 * `—` rather than a balance it does not have. "You were paid nothing" is not a safer guess than "we
 * cannot show this"; it is a wrong one.
 *
 * Exported for `config-types.ts`, which parses the *same* backend's figures — `daily_limit`,
 * `daily_limit_remainder` and `minimum_amount` all arrive as decimal **strings** off the identical
 * serializers. Deliberately not in the barrel: it is this feature's wire-reading rule, not an API.
 */
export const numeric = z
    /*
     * `.optional()` is load-bearing, and its absence is a zod **4** trap: `z.unknown()` alone accepts
     * a missing key, but putting a `.transform()` on it makes the field `nonoptional`, so
     * `{ id: '7' }` failed to parse and the row vanished. Verified against this repo's zod — the issue
     * reads *"expected nonoptional, received undefined"*. Zod 3 does not behave this way, so the
     * pattern copied from older code is wrong here.
     */
    .unknown()
    .optional()
    .transform(value => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null
        if (typeof value !== 'string') return null
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) ? parsed : null
    })

const payoutRequestSchema = z.looseObject({
    id: z.union([z.string(), z.number()]).transform(String),
    request_number: z.union([z.string(), z.number()]).nullish(),
    status: z.string().nullish(),
    /*
     * **`epochMs`, not a string.** `billing/payout-request/` sends milliseconds as a *number*
     * (`1780291984000`), and this field was declared `z.string()` — so every row failed the parse and
     * the screen showed "No payouts yet" against three real requests. The shared parser answers all
     * three wire shapes billy has been seen to use (B37) and is `features/balance`'s, which had
     * already solved it.
     */
    created_at: epochMs,
    net_amount: numeric,
    net_amount_currency: z.string().nullish(),
})

/** One payout request, as the screens use it. */
export interface PayoutRequest {
    id: string
    /** `#1234` in the row's title. `''` when billy did not send one. */
    requestNumber: string
    /** Lower-cased slug, `''` when absent. Resolved by `payoutStatus()`. */
    status: string
    /** Epoch **milliseconds**, `0` when unparseable — the same convention `LedgerEntry` uses. */
    createdAt: number
    /**
     * What actually reaches the bank, after fees — legacy shows this figure, not the gross.
     *
     * `null` when billy sent nothing readable, and the row then prints `—`. See `numeric`.
     */
    netAmount: number | null
    /** Upper-cased ISO code, `''` when absent. */
    netAmountCurrency: string
}

/** A page, and whether the endpoint says there is another one. */
export interface PayoutRequestPage {
    rows: PayoutRequest[]
    /**
     * From the payload's own `next`, not inferred from a full page.
     *
     * `billing/payout-request/` **does** send `count` / `next` / `previous` — confirmed against a live
     * response — which the two ledgers' endpoints do not, and which B38 asks for on their behalf. So
     * this list does not pay the cost B38 describes: no spinner for one extra request on a total that
     * is an exact multiple of the page size.
     */
    hasMore: boolean
}

/**
 * A page of payout requests.
 *
 * Accepts the `{ results }` envelope *and* a bare array: the axios interceptor unwraps billy's outer
 * `{ data }`, and a bare array is what a future version of this endpoint would most likely send.
 * Anything else — a string, `null` — becomes an empty page rather than a thrown render, which is the
 * rule `normalizeLedger` follows.
 */
export function normalizePayoutRequestPage(body: unknown): PayoutRequestPage {
    const envelope = body as { results?: unknown; next?: unknown } | null
    return {
        rows: normalizePayoutRequests(body),
        // A `next` of `null` is the last page; any string is a URL to one more.
        hasMore: typeof envelope?.next === 'string' && envelope.next.length > 0,
    }
}

export function normalizePayoutRequests(body: unknown): PayoutRequest[] {
    const rows = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown } | null)?.results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : []

    const out: PayoutRequest[] = []
    for (const row of rows) {
        const parsed = payoutRequestSchema.safeParse(row)
        // One malformed row does not cost the reader the rest of the page.
        if (!parsed.success) continue
        const value = parsed.data
        out.push({
            id: value.id,
            requestNumber: value.request_number == null ? '' : String(value.request_number),
            status: (value.status ?? '').toLowerCase(),
            createdAt: value.created_at ?? 0,
            netAmount: value.net_amount,
            netAmountCurrency: (value.net_amount_currency ?? '').toUpperCase(),
        })
    }
    return out
}

/* ============================== the detail ============================== */

/**
 * One fee line off `fee_details`.
 *
 * ## `original` is how a **waived** fee is expressed
 *
 * When a fee is discounted the backend keeps the fee it *would* have charged in `original` and puts
 * the charged one — usually zero — in `subtotal`. Legacy reads that as
 * `isFree: Boolean(payoutFee?.original)` and, everywhere it prints a rate, reads
 * `original?.flat_fee_amount || flat_fee_amount`: the **stated rate** comes from `original` when there
 * is one, so the row can say "Withdraw fee: 1 USD + 5%" *and* charge nothing. Reproduced, because a
 * waived fee that silently prints `0%` tells the creator the fee does not exist rather than that it
 * was waived for them.
 */
export interface PayoutFee {
    /** `payout_fee` · `payout_transaction_fee` · `payout_option_fee`, lower-cased. */
    type: string
    /** What was actually charged, in `amount_currency` (TEVI). */
    charged: number | null
    /** The flat component of the **stated** rate — `original`'s when the fee was waived. */
    flatAmount: number
    /** The percentage component of the stated rate. */
    percentRate: number
    /** `true` when `original` is present: the rate stands, the charge does not. */
    isWaived: boolean
}

const feeSchema = z.looseObject({
    type: z.string().nullish(),
    subtotal: z.looseObject({ amount: numeric }).nullish(),
    flat_fee_amount: numeric,
    percent_fee_rate: numeric,
    original: z.looseObject({ flat_fee_amount: numeric, percent_fee_rate: numeric }).nullish(),
})

/**
 * The method the money leaves by, and the account it lands in.
 *
 * `payout_detail` is a **bag whose keys depend on the method** — a USDT wallet has
 * `wallet_address` + `network`, a US bank transfer has `holder_name` / `account_number` /
 * `bank_name` / `individual_ssn` / `corp_ein` / `corp_name` / `zipcode`, Zelle has
 * `email_phone_number`. Legacy renders a fixed list of fourteen possible rows and drops the empty
 * ones; that is the shape reproduced here, because the alternative is a per-method schema for eight
 * methods this client cannot yet enumerate. **B84** asks for the real list.
 */
export interface PayoutConfig {
    /** The method's display name — `"Bank Transfer 24/7"` in the live payload. */
    methodName: string
    /**
     * Lower-cased slug — `usdt`, `bank_transfer`, `zelle`.
     *
     * Read for one thing only: `payoutConfigLabelKey` labels a **USDT** `wallet_address` *"Address"*
     * and every other method's *"Wallet address"*, which is legacy's own split between its two
     * screens. Carried here so both screens can make the same call.
     */
    methodSlug: string
    /** The method's own mark, served by the backend. `''` when it has none. */
    methodLogo: string
    /**
     * The currency this method settles in — legacy prints it in brackets after the name,
     * `Bank Transfer 24/7 (VND)`.
     */
    methodCurrency: string
    /** The method's country. `"Viet Nam"` in the live payload. */
    countryName: string
    /**
     * The method's own rate, `amountCurrency` → `methodCurrency`.
     *
     * **This is the rate the fee lines and the sub-receive figure use**, not the request's root
     * `exchange_rate`. The two differ — `25457.6849` against `25622.3426` in the live payload — and
     * legacy is explicit about which goes where: `roundToTwo(parseFloat(payout_method.exchange_rate))`
     * for anything it computes, while the **net** figure comes from the backend already converted at
     * the root rate. Using the root rate for a fee prints `-1,281,117` where the screen should say
     * `-1,272,884`.
     */
    methodExchangeRate: number | null
    /** How long the method itself takes, in the backend's words — `"1 business day"`. */
    processingTimeNote: string
    /** The method-specific fields, empty values stripped. Keys are billy's. */
    detail: Record<string, string>
}

const payoutConfigSchema = z.looseObject({
    payout_method: z
        .looseObject({
            name: z.string().nullish(),
            slug: z.string().nullish(),
            logo: z.string().nullish(),
            currency: z.string().nullish(),
            exchange_rate: numeric,
            processing_time_note: z.string().nullish(),
            country: z.looseObject({ name: z.string().nullish() }).nullish(),
        })
        .nullish(),
    payout_detail: z.record(z.string(), z.unknown()).nullish(),
})

/** One payout request in full — what `/payout-request/{id}/` answers. */
export interface PayoutRequestDetail extends PayoutRequest {
    /** The gross, before fees, in `amountCurrency`. */
    amount: number | null
    /**
     * The unit the request is *made* in, not the one it settles in.
     *
     * **`TEVI` is displayed as `USD`.** Legacy maps it explicitly
     * (`amount_currency === 'TEVI' ? 'USD' : …`) because TEVI is the internal name for the
     * dollar-denominated earnings balance — a creator has never seen the word "TEVI" and it is not a
     * currency they can look up. Done in the parser so no screen can forget it.
     */
    amountCurrency: string
    /** Total fee charged, in `amountCurrency`. */
    fee: number | null
    fees: PayoutFee[]
    /** `saving` · `fast`, lower-cased. `''` when absent. */
    option: string
    /**
     * How long the chosen option takes, as billy states it — days for `saving`, days for `fast`
     * (legacy multiplies by 24 to print hours). `null` when absent.
     */
    optionDuration: number | null
    /** `amountCurrency` → `netAmountCurrency`. `null` when absent; never assume 1. */
    exchangeRate: number | null
    config: PayoutConfig | null
    /** The status timestamps, epoch ms. `null` for a state this request has not reached. */
    pendingAt: number | null
    onHoldAt: number | null
    completedAt: number | null
    failedAt: number | null
    /** Why it failed, in the backend's own words. `''` when there is none. */
    failReason: string
}

const payoutDetailSchema = payoutRequestSchema.extend({
    amount: numeric,
    amount_currency: z.string().nullish(),
    fee: numeric,
    fee_details: z.array(feeSchema).nullish(),
    payout_option: z
        .union([
            z.string(),
            z.looseObject({
                id: z.string().nullish(),
                metadata: z.looseObject({ payout_duration: numeric }).nullish(),
            }),
        ])
        .nullish(),
    exchange_rate: numeric,
    payout_config: z.union([z.string(), payoutConfigSchema]).nullish(),
    pending_at: epochMs,
    on_hold_at: epochMs,
    completed_at: epochMs,
    failed_at: epochMs,
    fail_reason: z.string().nullish(),
})

/**
 * The code a reader sees. `TEVI` is the internal name of the dollar-denominated earnings balance, and
 * legacy prints `USD` for it everywhere — see `PayoutRequestDetail.amountCurrency`.
 */
function displayCurrency(code: string | null | undefined): string {
    const upper = (code ?? '').toUpperCase()
    return upper === 'TEVI' ? 'USD' : upper
}

/** Only the keys with a non-empty string value — legacy drops the empty rows too. */
function readDetailBag(bag: Record<string, unknown> | null | undefined): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(bag ?? {})) {
        if (typeof value === 'string' && value.trim() !== '') out[key] = value.trim()
        else if (typeof value === 'number' && Number.isFinite(value)) out[key] = String(value)
    }
    return out
}

/**
 * One payout request in full, or `null` when the payload is not one.
 *
 * `null` rather than a partial object: this screen is *about* one request, so a body it cannot read is
 * a not-found rather than a page with blanks in it. The list's parser drops a bad row and keeps the
 * page; here there is nothing else to keep.
 *
 * ## Two fields change shape between the list and the detail
 *
 * In the list, `payout_option` is the string `"saving"` and `payout_config` is the id `"po_…"`. In the
 * detail both are **objects** (legacy reads `payout_option.metadata.payout_duration` and
 * `payout_config.payout_method.name`). Both shapes are accepted here, because a client that only
 * handles one of them breaks on whichever endpoint it did not see first — and the string form still
 * carries the option's *name*, which is the half this screen needs most.
 */
export function normalizePayoutRequestDetail(body: unknown): PayoutRequestDetail | null {
    const parsed = payoutDetailSchema.safeParse(body)
    if (!parsed.success) return null
    const value = parsed.data

    const option = value.payout_option
    const config = value.payout_config

    return {
        id: value.id,
        requestNumber: value.request_number == null ? '' : String(value.request_number),
        status: (value.status ?? '').toLowerCase(),
        createdAt: value.created_at ?? 0,
        netAmount: value.net_amount,
        netAmountCurrency: (value.net_amount_currency ?? '').toUpperCase(),

        amount: value.amount,
        amountCurrency: displayCurrency(value.amount_currency),
        fee: value.fee,
        fees: (value.fee_details ?? []).map(fee => ({
            type: (fee.type ?? '').toLowerCase(),
            charged: fee.subtotal?.amount ?? null,
            // The **stated** rate: `original`'s when the fee was waived. See `PayoutFee`.
            flatAmount: fee.original?.flat_fee_amount ?? fee.flat_fee_amount ?? 0,
            percentRate: fee.original?.percent_fee_rate ?? fee.percent_fee_rate ?? 0,
            isWaived: Boolean(fee.original),
        })),
        option: (typeof option === 'string' ? option : (option?.id ?? '')).toLowerCase(),
        optionDuration:
            typeof option === 'string' ? null : (option?.metadata?.payout_duration ?? null),
        exchangeRate: value.exchange_rate,
        config:
            config && typeof config !== 'string'
                ? {
                      methodName: config.payout_method?.name ?? '',
                      methodSlug: (config.payout_method?.slug ?? '').toLowerCase(),
                      methodLogo: config.payout_method?.logo ?? '',
                      methodCurrency: (config.payout_method?.currency ?? '').toUpperCase(),
                      /*
                       * Rounded to two before anything multiplies by it, which is legacy's
                       * `roundToTwo(parseFloat(...))`. Rounding after instead drifts the fee by a few
                       * dong on a rate this size, and the screen then disagrees with legacy's figure.
                       */
                      methodExchangeRate:
                          config.payout_method?.exchange_rate === null ||
                          config.payout_method?.exchange_rate === undefined
                              ? null
                              : Math.round(config.payout_method.exchange_rate * 100) / 100,
                      countryName: config.payout_method?.country?.name ?? '',
                      processingTimeNote: config.payout_method?.processing_time_note ?? '',
                      detail: readDetailBag(config.payout_detail),
                  }
                : null,
        pendingAt: value.pending_at ?? null,
        onHoldAt: value.on_hold_at ?? null,
        completedAt: value.completed_at ?? null,
        failedAt: value.failed_at ?? null,
        failReason: (value.fail_reason ?? '').trim(),
    }
}
