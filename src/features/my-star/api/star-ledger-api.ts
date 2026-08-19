import { balanceKeys, type LedgerEntry, normalizeLedger } from '@features/balance'
import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'

/**
 * The Star ledger — `billy/v5/billing/tvs-transactions/`.
 *
 * ## One endpoint, because this feature is one screen
 *
 * `features/my-star` owns `/my-star` and nothing else. The account's *balance* is
 * `features/balance`'s (a provider, mounted above every route); the **currency** ledger is
 * `features/my-wallet`'s. All three sit on the `/billy` base URL and each builds its own model on it,
 * which is the two-file model pattern working as intended — a model is the surface one feature needs,
 * not a wrapper around a service.
 *
 * The `LedgerEntry` DTO and its parser come from `@features/balance`: the shape of a movement in the
 * balance is that feature's subject, and both ledgers answer with it. Which endpoint, which filters
 * and which unit are this feature's.
 *
 * **Derived from the bearer, never passed** — so every request must pin `accountId`, or a reader with
 * ten accounts gets whichever bearer happened to be active when the request left, filed under the key
 * of the one they were looking at. This is money; that is one person's history under another person's
 * name.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

/** Legacy's page size, kept so a page boundary lands where it always has. */
export const STAR_LEDGER_PAGE_SIZE = 20

/**
 * Query keys, nested **under** `balanceKeys.all`.
 *
 * That is the one thing the three wallet features agree on, and it is stated on `balanceKeys`: a spend
 * invalidates `['balance']` and refreshes the figure *and* the history that explains it. A creator who
 * has just sent a gift should not see a new balance above a ledger that has not heard about it.
 *
 * The `type` filter is part of the key, so switching to "Donate" and back to "All transaction" is
 * instant rather than two reloads — and an in-flight request for the old filter cannot resolve into
 * the new list.
 */
export const starLedgerKeys = {
    all: [...balanceKeys.all, 'ledger', 'star'] as const,
    list: (accountId: string | null, type: string) =>
        [...balanceKeys.all, 'ledger', 'star', accountId ?? 'anon', type || 'all'] as const,
}

export const starLedgerApi = {
    /**
     * One page of the Star ledger, newest first.
     *
     * `page` is 1-based, as legacy sends it. `type` is **omitted when empty** — `createApiModel` strips
     * empty params, so "All transaction" is the absence of the parameter rather than a magic value.
     */
    async getLedger({
        page,
        type = '',
        accountId,
        signal,
    }: {
        page: number
        type?: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<LedgerEntry[]> {
        const body = await api.get<unknown>(
            'v5/billing/tvs-transactions/',
            { page, page_size: STAR_LEDGER_PAGE_SIZE, type },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeLedger(body)
    },
}
