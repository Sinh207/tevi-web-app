import { balanceKeys } from '@features/balance'
import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { z } from 'zod'

/**
 * The Tevi Coin bonus attached to a currency-ledger movement — `dapp-wallet/v1/t/transactions/`.
 *
 * This is the second half of **B83** in `docs/BACKEND_QUESTIONS.md`, and the payload that answered it
 * arrived from the product side rather than from a spec, so what it says is written down here.
 *
 * ## Same host as billy, despite the name
 *
 * Legacy's model is `${W_API_DOMAIN}/dapp-wallet` (`models/apiDAppWallet.js`) — a **path prefix on
 * W_API**, not a separate service. That matters twice over, and both were wrong in my first reading of
 * it: the bearer *is* sent (`origins.ts` matches the parsed origin, and this is that origin), and the
 * `{ data }` envelope *is* unwrapped, because unwrapping is scoped to W_API too. So this needs no
 * `unwrapEnvelope` flag and no exception anywhere — it is an ordinary `createApiModel`.
 *
 * ## The wire shape, and the two traps in it
 *
 * ```json
 * { "success": true, "message": null, "errors": null,
 *   "data": { "results": [ { "id": "…", "amount": "10", "currency": "TEVI",
 *                            "created_at": 1756959786.734602, "billy_tx_id": "050f97bf-…" } ] } }
 * ```
 *
 * 1. **`amount` is a string** (`"10"`), like every other figure billy sends. Parsed to a number here so
 *    no component multiplies a string.
 * 2. **`created_at` is epoch *seconds* with a fraction** — `1756959786.734602`, i.e. 2025-09-04. Billy's
 *    own `created_at` on the very rows this joins to is epoch **milliseconds** (`epochMs` in
 *    `features/balance`). Read one as the other and you get 1970 or the year 57000, and neither throws.
 *    This client does not render the dApp timestamp — the row's time is billy's — so the field is
 *    parsed, converted to ms and kept, rather than dropped: it is the thing a future reader will reach
 *    for, and leaving it unconverted is how the trap gets laid again.
 *
 * There is **no `count` and no `next`** — the endpoint answers for the ids you asked about, so it is a
 * lookup rather than a list. Nothing here pages.
 *
 * ## `bonus` is not a field on the wire
 *
 * Legacy's `transaction.bonus` is the result of its own join: it fetches a page of billy rows, asks this
 * endpoint about `ids.join(',')`, then matches `dapp.billy_tx_id === billyRow.id`
 * (`transactionHistory/hooks/useTransactionHistory.js:29-42`). So a "bonus" is simply the dApp row whose
 * `billy_tx_id` points back. The join lives in `use-ledger-bonuses.ts`; this file only fetches.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/dapp-wallet` })

/**
 * Epoch **seconds** (fractional), converted to ms — the opposite unit from billy's `epochMs`.
 *
 * Unreadable values become `null` rather than `0`: a zero here would print as January 1970 next to a
 * real figure, which reads as data rather than as absence.
 */
const epochSecondsToMs = z
    .unknown()
    .optional()
    .transform(value => {
        const seconds = typeof value === 'number' ? value : Number(value)
        return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null
    })

/** A string figure, as billy and this service both send. `null` when it cannot be read. */
const numericString = z
    .unknown()
    .optional()
    .transform(value => {
        const amount = typeof value === 'number' ? value : Number(value)
        return Number.isFinite(amount) ? amount : null
    })

/**
 * `looseObject`, so a field this client has not been told about survives the parse — the payload is the
 * dApp team's and grows on their schedule, not ours.
 */
const teviCoinTransactionSchema = z.looseObject({
    id: z.string().optional(),
    /** The billy transaction this bonus belongs to. **The join key** — a row without it is unusable. */
    billy_tx_id: z.string().optional(),
    type: z.string().optional(),
    amount: numericString,
    currency: z.string().optional(),
    status: z.string().optional(),
    created_at: epochSecondsToMs,
})

const teviCoinListSchema = z.looseObject({
    results: z.array(teviCoinTransactionSchema).optional(),
})

export interface TeviCoinBonus {
    /** The dApp transaction's own id. */
    id: string
    /** The billy transaction it is a bonus on. */
    billyTxId: string
    /** How much, as a number. `null` when the payload's string could not be read. */
    amount: number | null
    /** `TEVI` in every payload seen so far, kept because the figure is printed beside a mark. */
    currency: string
    /** Epoch **ms**, converted from the service's seconds. See the note above. */
    createdAt: number | null
    /** `success` in every payload seen so far. Carried so a caller can withhold a pending bonus. */
    status: string
}

/**
 * The bonuses for a set of billy transaction ids.
 *
 * A row with **no `billy_tx_id` is dropped**: it cannot be joined to anything, so keeping it would put
 * an unattached figure in the map for a `undefined` key.
 */
export function normalizeTeviCoinBonuses(body: unknown): TeviCoinBonus[] {
    const parsed = teviCoinListSchema.safeParse(body)
    if (!parsed.success) return []

    const out: TeviCoinBonus[] = []
    for (const row of parsed.data.results ?? []) {
        if (!row.billy_tx_id) continue
        out.push({
            id: row.id ?? row.billy_tx_id,
            billyTxId: row.billy_tx_id,
            amount: row.amount,
            currency: row.currency ?? 'TEVI',
            createdAt: row.created_at,
            status: row.status ?? '',
        })
    }
    return out
}

/**
 * Nested under `balanceKeys.all`, like the ledger it annotates — so whatever invalidates the balance
 * and its history invalidates the bonuses on that history too, rather than leaving a figure from
 * before the movement.
 *
 * Keyed on the **ids asked about**, joined: the endpoint is a lookup, so two different id sets are two
 * different answers and must not share a cache entry.
 */
export const teviCoinKeys = {
    all: [...balanceKeys.all, 'tevi-coin-bonus'] as const,
    forIds: (accountId: string | null, ids: string[]) =>
        [...balanceKeys.all, 'tevi-coin-bonus', accountId ?? 'anon', ids.join(',')] as const,
}

export const teviCoinApi = {
    /**
     * The bonuses for `billyTxIds`.
     *
     * One param, `billy_tx_id`, whose value is the ids joined by commas — legacy's own call
     * (`ids.map(item => item.id)?.join(',')`). An empty list is not sent at all; the caller's query is
     * disabled instead, because a lookup for nothing is a request for nothing.
     */
    async getBonuses({
        billyTxIds,
        accountId,
        signal,
    }: {
        billyTxIds: string[]
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<TeviCoinBonus[]> {
        if (billyTxIds.length === 0) return []
        const body = await api.get<unknown>(
            'v1/t/transactions/',
            { billy_tx_id: billyTxIds.join(',') },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeTeviCoinBonuses(body)
    },
}
