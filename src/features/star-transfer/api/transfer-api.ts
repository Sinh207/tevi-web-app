import { balanceKeys } from '@features/balance'
import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { createApiModel } from '@shared/lib/api/model'
import {
    normalizeParty,
    normalizeTemplateRows,
    normalizeTransfers,
    type TemplateRow,
    type Transfer,
    type TransferParty,
    type TransferRequest,
} from './types'

/**
 * `/star-transfer`'s five endpoints — four on **billy**, one on **auth**.
 *
 * ```
 * billy  v5/billing/transfer-out-history/                        the history
 * billy  v5/billing/balance/transfer-star/                       the write
 * billy  v5/billing/balance/transfer-star/template/              the CSV template
 * billy  v5/billing/balance/transfer-star/template/validation/   the CSV check
 * auth   v1/users/{id}/                                          who is this Tevi ID
 * ```
 *
 * Two models in one file because they serve **one** question — "move Star to that person" — and the
 * recipient lookup is meaningless outside it. The alternative, a second api file for a single `GET`,
 * would put this feature's two halves in two places and hide that they share a key namespace.
 *
 * ## Every call pins `accountId`
 *
 * The bearer decides whose Star moves, and this app holds up to ten of them. A request that does not
 * name the account gets whichever bearer happened to be active when it left — filed under the key of
 * the one the reader was looking at. On a ledger that is one person's history under another person's
 * name; **here it is one person's money leaving another person's balance**, so the rule is not a
 * convention on this screen, it is the correctness argument.
 */
const billy = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })
const auth = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/auth` })

/** Legacy's page size on this endpoint, kept so a page boundary lands where it always has. */
export const TRANSFER_HISTORY_PAGE_SIZE = 20

/**
 * Query keys, nested **under** `balanceKeys.all`.
 *
 * The agreement the wallet features share, stated on `balanceKeys`: a spend invalidates `['balance']`
 * and refreshes the figure *and* the histories that explain it. That is what makes a completed
 * transfer land on this screen's own list without this feature having to know that `useBalance`
 * exists — `refresh()` covers both.
 *
 * The recipient lookup is nested here too, and account-scoped like everything else, because the ETag
 * store is: two accounts sharing a key would let one replay the other's cached body.
 */
export const transferKeys = {
    all: [...balanceKeys.all, 'transfer'] as const,
    history: (accountId: string | null) =>
        [...balanceKeys.all, 'transfer', 'history', accountId ?? 'anon'] as const,
    recipient: (accountId: string | null, teviId: string) =>
        [...balanceKeys.all, 'transfer', 'recipient', accountId ?? 'anon', teviId] as const,
}

export const transferApi = {
    /**
     * One page of transfers **out**, newest first.
     *
     * `page` is 1-based, as legacy sends it. There is no `count` and no `next` on this endpoint
     * either (B38), so "is there more" is inferred from a full page — the same rule, and the same
     * one-extra-request cost on an exact multiple of 20, that `useStarLedger` writes down.
     */
    async getHistory({
        page,
        accountId,
        signal,
    }: {
        page: number
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<Transfer[]> {
        const body = await billy.get<unknown>(
            'v5/billing/transfer-out-history/',
            { page, page_size: TRANSFER_HISTORY_PAGE_SIZE },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeTransfers(body)
    },

    /**
     * Who owns this Tevi ID.
     *
     * **A 404 is an answer, not a failure** — "no such ID" is exactly what the field needs to be told,
     * and swallowing it here rather than at the hook makes the contract `TransferParty | null` for
     * every consumer: the query resolves `success`, so it raises no toast and enters no error state.
     * Same shape, and the same reasoning, as `donationApi.getOffer`.
     *
     * Any other status is left to reject. A 500 means the ID's existence is *unknown*, and answering
     * `null` there would tell a reader their friend's ID is invalid because the service was down.
     */
    async getRecipient(
        teviId: string,
        { accountId, signal }: { accountId?: string | null; signal?: AbortSignal } = {},
    ): Promise<TransferParty | null> {
        try {
            const body = await auth.get<unknown>(
                `v1/users/${encodeURIComponent(teviId)}/`,
                undefined,
                { signal, ...(accountId ? { accountId } : {}) },
            )
            return normalizeParty(body)
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) return null
            throw error
        }
    },

    /**
     * The CSV template, as text.
     *
     * `responseType: 'text'` is explicit rather than left to axios's sniffing: the body is
     * `text/csv`, and a template whose first column happens to parse as JSON would otherwise arrive
     * as an object and be written to disk as `[object Object]`.
     */
    getTemplate(accountId?: string | null): Promise<string> {
        return billy.get<string>('v5/billing/balance/transfer-star/template/', undefined, {
            responseType: 'text',
            ...(accountId ? { accountId } : {}),
        })
    },

    /**
     * Have the backend read the uploaded CSV and say what it found.
     *
     * ## ⚠ `Content-Type` must be set here, and it is not decoration
     *
     * `apiClient` declares `Content-Type: application/json` as an instance default, and axios's
     * default `transformRequest` reads that header *before* the adapter runs: with a JSON content
     * type and a `FormData` body it calls `formDataToJSON` and posts `{"file":{}}` — the file
     * silently gone, the request a 200 with an empty result. Naming `multipart/form-data` here is
     * what takes that branch out; the browser then replaces the value with one carrying the real
     * boundary (axios's XHR adapter clears it for `FormData`), so the missing boundary below is not
     * a bug.
     *
     * Legacy passes the same header for the same reason, without saying why.
     */
    async validateTemplate(
        file: File,
        { accountId, signal }: { accountId?: string | null; signal?: AbortSignal } = {},
    ): Promise<TemplateRow[]> {
        const form = new FormData()
        form.append('file', file)
        const body = await billy.post<unknown>(
            'v5/billing/balance/transfer-star/template/validation/',
            form,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                signal,
                ...(accountId ? { accountId } : {}),
            },
        )
        return normalizeTemplateRows(body)
    },

    /**
     * Move the Star. The array is the request body — one element per receiver.
     *
     * ⚠ **Not retried, and that is deliberate.** `apiClient` replays a POST only with
     * `{ retry: true }` and only where the backend deduplicates; this one debits a balance, so a 502
     * arriving *after* the debit landed would send the Star twice. See `shared/lib/api/client.ts`,
     * and `donationApi.donateStars`, which carries the same warning about the same risk.
     *
     * B55: whether the response is the created records (what the receipt prints) or something else, and
     * whether a batch is atomic across its rows.
     */
    transferStars(rows: TransferRequest[], accountId?: string | null): Promise<Transfer[]> {
        return billy
            .post<unknown>(
                'v5/billing/balance/transfer-star/',
                rows,
                accountId ? { accountId } : undefined,
            )
            .then(normalizeTransfers)
    },
}
