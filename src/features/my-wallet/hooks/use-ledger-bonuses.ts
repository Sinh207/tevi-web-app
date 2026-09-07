'use client'

import { useAuth } from '@features/auth'
import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type TeviCoinBonus, teviCoinApi, teviCoinKeys } from '../api/tevi-coin-api'

/**
 * The Tevi Coin bonuses for the ledger rows currently on screen, as a lookup by billy transaction id.
 *
 * This is the join half of **B83**. `tevi-coin-api.ts` fetches; this decides *what to ask about* and
 * hands back something a row can read in O(1).
 *
 * ## One query **per page**, and getting this wrong is what broke the feature
 *
 * `web-app` asks per page: `getTransactionTxIds(results)` is handed *only the rows that just arrived*,
 * so every request carries exactly one page of ids.
 *
 * This hook first did the opposite — one query whose key was the **accumulated** id set, re-keyed as
 * pages loaded, so page two asked about forty ids, page three sixty, and so on. The reasoning was that
 * legacy's growing `txIds` array is the only place its answers live, so a refetch of page one
 * duplicates rows into it and nothing ever evicts a row that has gone.
 *
 * That reasoning was fine and the implementation was wrong: on a real ledger the accumulated list gets
 * long, and the lookup then answers with nothing. Side by side on the same account, legacy drew the
 * bonuses and this drew none — which is the only reason it was found, since the failure is silent by
 * design.
 *
 * `useQueries` gets both: **one request per page, exactly as legacy sends them**, and a separate cache
 * entry per page, so
 *
 * - each request carries one page's ids and stays within whatever the endpoint accepts;
 * - a refetch of page one replaces page one's answer instead of appending to a pile;
 * - a page dropped from the ledger takes its bonuses with it;
 * - and scrolling back up costs nothing, because earlier pages are still cached.
 *
 * ## Pages of ids, not entries
 *
 * The caller passes ids grouped by page because it has them that way — `InfiniteData.pages` — and
 * flattening them here would throw away the one thing this hook needs to get right.
 */
export function useLedgerBonuses(pagesOfBillyTxIds: string[][]) {
    const { isAuthenticated, activeId } = useAuth()

    /*
     * De-duplicated **within** a page and sorted, so a page's key is stable: the same twenty rows must
     * not produce two cache entries because the server returned them in a different order after a
     * refetch. Empty pages are dropped rather than queried.
     *
     * Not de-duplicated *across* pages: an id repeated on two pages is the server having returned it
     * twice, and asking twice is cheaper than the bookkeeping to notice — and safer, since dropping it
     * from the later page would lose the bonus if the earlier page were evicted.
     */
    const pages = useMemo(
        () =>
            pagesOfBillyTxIds
                .map(page => [...new Set(page)].sort())
                .filter(page => page.length > 0),
        [pagesOfBillyTxIds],
    )

    const enabled = isAuthenticated && Boolean(activeId)

    const { bonuses, isLoading, isError, returned } = useQueries({
        queries: pages.map(ids => ({
            queryKey: teviCoinKeys.forIds(activeId, ids),
            queryFn: ({ signal }: { signal: AbortSignal }) =>
                teviCoinApi.getBonuses({ billyTxIds: ids, accountId: activeId, signal }),
            enabled,
            /*
             * An annotation, so a failure is silent and not retried into the ground. `queryClient`'s
             * default already skips 4xx; this drops the 5xx retries too, because the ledger is readable
             * without it and three attempts at a bonus is three requests a reader waits through for
             * nothing.
             */
            retry: false,
        })),
        /*
         * `combine` rather than a `useMemo` over the results array: `useQueries` returns a new array
         * every render, so a memo would need a hand-rolled dependency (a length, a hash) that goes
         * stale the moment a page's *contents* change without its length changing. TanStack memoises
         * `combine` against the query results themselves, which is the identity that actually matters.
         */
        combine: results => {
            const out = new Map<string, TeviCoinBonus>()
            for (const result of results) {
                for (const bonus of result.data ?? []) {
                    // A later page wins a duplicate id — the same billy transaction, so the same bonus.
                    if (isDisplayableBonus(bonus)) out.set(bonus.billyTxId, bonus)
                }
            }
            return {
                bonuses: out,
                isLoading: results.some(result => result.isLoading),
                isError: results.some(result => result.isError),
                /** Every row the lookup returned, before the display rule — for the dev warning below. */
                returned: results.flatMap(result => result.data ?? []),
            }
        },
    })

    /*
     * **Dev-only diagnosis.** Silence is right in production — the bonus is an annotation and a reader
     * must not see a toast about one — but silence is also why "no bonus appears" gives a developer
     * nothing to go on: the request could have failed, or answered with rows whose `billy_tx_id`
     * matches none of the ids asked about, and both look identical on screen.
     *
     * `web-app` shows a bonus on the same rows where this shows none, so the two are worth being able
     * to tell apart in one glance at the console. Stripped from production by the `NODE_ENV` check,
     * which Next inlines and the minifier removes with the branch.
     */
    if (process.env.NODE_ENV !== 'production' && pages.length > 0 && !isLoading) {
        const asked = pages.flat()
        if (isError) {
            console.warn('[tevi-coin] a bonus lookup failed', {
                pages: pages.length,
                askedPerPage: pages.map(page => page.length),
            })
        } else if (returned.length > 0 && bonuses.size === 0) {
            console.warn(
                '[tevi-coin] the lookup answered but nothing joined — every row was either withheld ' +
                    'by isDisplayableBonus (status/amount) or its billy_tx_id matched no ledger id',
                {
                    asked: asked.slice(0, 3),
                    returnedBillyTxIds: returned.slice(0, 3).map(bonus => bonus.billyTxId),
                    returnedStatuses: [...new Set(returned.map(bonus => bonus.status))],
                },
            )
        } else if (returned.length === 0) {
            console.warn('[tevi-coin] the lookup answered with no rows', {
                pages: pages.length,
                askedPerPage: pages.map(page => page.length),
                sample: asked.slice(0, 3),
            })
        }
    }

    return { bonuses, isLoading }
}

/**
 * Whether a bonus row is one to print — **`status === 'success'` and a positive amount**.
 *
 * ## This is the product's rule, given verbatim (B83, 2026-08-28)
 *
 * The question put to the product side was whether `status` ever carries anything but `success`, and
 * whether a `pending` would mean "promised but not yet in the wallet". The answer was to stop asking
 * about the vocabulary and gate on the two conditions above: *success and amount > 0, show it;
 * anything else, do not.* So this deliberately does **not** enumerate the other statuses — it does not
 * need to, and a list of values nobody has confirmed is a list that rots.
 *
 * ## The three cases it withholds, and why each one matters
 *
 * - **A non-`success` status.** Until this rule the client printed the figure regardless, which on a
 *   `pending` row means telling a creator they earned Star they do not have yet. That is the client
 *   saying something untrue about money, and it is the reason this gate exists at all.
 * - **`amount <= 0`.** `"0"` parses fine and is not `null`, so it reached the row and rendered `+0` —
 *   a bonus line claiming the reward was nothing. A zero bonus is the *absence* of a bonus, and the
 *   absence of a line is how to say that. Negative is not a thing this endpoint should send; if it
 *   ever does, it is not a reward and does not belong under a "Bonus" label.
 * - **`amount === null`**, i.e. a figure the payload carried but this client could not read. It would
 *   have to print as `+—`: a reward exists and we cannot say how much, which is worse than silence.
 *
 * Exported so a test can state the rule directly, and so the *row* and the *sheet* cannot drift into
 * two different opinions about when a bonus exists — they both go through the map this builds.
 */
export function isDisplayableBonus(bonus: TeviCoinBonus): boolean {
    return bonus.status === 'success' && bonus.amount !== null && bonus.amount > 0
}
