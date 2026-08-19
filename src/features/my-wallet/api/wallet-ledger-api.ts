import { balanceKeys, type LedgerEntry, normalizeLedger } from '@features/balance'
import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'

/**
 * The currency ledger and the payout-fee flag — `billy/v5/billing/…`.
 *
 * ## Two endpoints, because this feature is one screen
 *
 * `features/my-wallet` owns `/my-wallet` and nothing else. The account's *balance* is
 * `features/balance`'s (a provider, above every route); the **Star** ledger is `features/my-star`'s. All
 * three sit on the `/billy` base URL and each builds its own model on it — a model is the surface one
 * feature needs, not a wrapper around a service.
 *
 * The `LedgerEntry` DTO and its parser come from `@features/balance`: the shape of a movement in the
 * balance is that feature's subject, and both ledgers answer with it.
 *
 * **Derived from the bearer, never passed** — so every request must pin `accountId`, or a reader with ten
 * accounts gets whichever bearer happened to be active when the request left, filed under the key of the
 * one they were looking at.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

/** Legacy's page size, kept so a page boundary lands where it always has. */
export const WALLET_LEDGER_PAGE_SIZE = 20

/**
 * Query keys, nested **under** `balanceKeys.all` — the one agreement the three wallet features share, so
 * a spend invalidates the figure and the history that explains it together. Stated on `balanceKeys`.
 *
 * `firstPayoutFree` sits under the same root for the same reason: the flag flips *as a result of a
 * withdrawal*, so whatever refreshes the balance after one must refresh this too.
 */
export const walletLedgerKeys = {
    all: [...balanceKeys.all, 'ledger', 'currency'] as const,
    list: (accountId: string | null, type: string) =>
        [...balanceKeys.all, 'ledger', 'currency', accountId ?? 'anon', type || 'all'] as const,
    firstPayoutFree: (accountId: string | null) =>
        [...balanceKeys.all, 'first-payout-free', accountId ?? 'anon'] as const,
}

export const walletLedgerApi = {
    /**
     * One page of the currency ledger, newest first.
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
            'v5/billing/transactions/',
            { page, page_size: WALLET_LEDGER_PAGE_SIZE, type },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeLedger(body)
    },

    /**
     * Whether this account's next withdrawal has its fee waived.
     *
     * A separate query from the ledger, and from the balance, for two reasons — the second is the real
     * one: it is a different endpoint, so folding it in would make a failure read as "no history"; and it
     * is a **promise about money**, so it must fail closed. Kept separate, the ledger renders while this
     * one errors, and the parse defaults to `false` — the banner appears only when the backend has
     * actually said so. Telling somebody a withdrawal is free when it is not is the one error on this
     * screen that costs them money.
     */
    async getFirstPayoutFree({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<boolean> {
        const body = await api.get<unknown>(
            'v5/billing/payout/free-first-transaction-fee/',
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        if (body === null || typeof body !== 'object') return false
        const value = (body as { is_free?: unknown }).is_free
        if (typeof value === 'boolean') return value
        // Legacy reads `Boolean(is_free)`, so these two have always counted as true. Nothing else is
        // coerced — see B39 for what the endpoint answers once the fee is spent.
        return value === 1 || value === 'true'
    },
}
