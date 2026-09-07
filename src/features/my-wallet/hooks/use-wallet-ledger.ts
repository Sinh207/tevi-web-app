'use client'

import { useAuth } from '@features/auth'
import { formatLedgerAmount, isStarEntry, type LedgerEntry } from '@features/balance'
import type { LedgerGroupModel } from '@shared/components/ledger'
import { TEVI_STAR_SRC } from '@shared/components/star-mark'
import { TEVI_COIN_SRC } from '@shared/components/tevi-coin-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime, formatLedgerMonth, ledgerMonthKey } from '@shared/lib/ledger-time'
import { type Currency, formatPlainAmount } from '@shared/lib/money'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { TeviCoinBonus } from '../api/tevi-coin-api'
import {
    WALLET_LEDGER_PAGE_SIZE,
    walletLedgerApi,
    walletLedgerKeys,
} from '../api/wallet-ledger-api'
import {
    ALL_WALLET_TRANSACTIONS,
    isWalletTransactionFilter,
    walletTransactionIcon,
    walletTransactionLabelKey,
} from '../lib/wallet-transaction-types'
import { useLedgerBonuses } from './use-ledger-bonuses'

export interface UseWalletLedgerResult {
    groups: LedgerGroupModel[]
    /**
     * The rows behind `groups`, unformatted — what the detail sheet needs.
     *
     * `groups` holds finished strings, because `shared/components/ledger` takes finished strings; the
     * sheet needs the DTO (the id, the raw amount, the type slug). Rather than parse the display row
     * back, the hook hands out both views of the same page cache.
     */
    entries: LedgerEntry[]
    /**
     * `billyTxId → Tevi Coin bonus`, for the rows currently loaded — **B83**.
     *
     * Handed out as well as applied to `groups`, because the **detail sheet** needs it too and asking
     * for it a second time there would be a second request per page. Empty until the lookup answers,
     * and empty for good if it fails: the bonus is an annotation, so its absence costs a figure and
     * never the history.
     */
    bonuses: Map<string, TeviCoinBonus>
    /** The active filter slug. `''` is "All transaction". */
    filter: string
    setFilter: (type: string) => void
    isLoading: boolean
    isError: boolean
    /** Came back empty with **no** filter applied. */
    isEmpty: boolean
    /** Came back empty **because of** the filter. A different message. */
    isFilteredEmpty: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
    refetch: () => void
}

/**
 * The currency ledger, paginated, filtered, grouped by month and mapped to display rows.
 *
 * The sibling of `features/my-star`'s `useStarLedger`, and the differences are the whole reason the two
 * screens are separate features: a different endpoint, a different filter vocabulary, and — the one that
 * shows — **a unit that the reader chooses**. This hook takes the currency and rate as arguments rather
 * than reading `useCurrency` itself, so the screen decides once and the ledger cannot disagree with the
 * card above it.
 *
 * ## Where the mapping happens, and why here
 *
 * `shared/components/ledger` is props-only and knows nothing about billy, currencies or transaction types —
 * which is what lets the two screens share one copy of the layout without depending on each other. The
 * cost is a mapping step, and it belongs in the hook: this is the only place with the DTO, the vocabulary,
 * the unit *and* the locale at once.
 *
 * Legacy is the counter-example. Its two ledger components are ~300 near-identical lines each and have
 * already drifted — the currency one reuses the Star one's resize-observer id.
 *
 * ## Page numbers, not a cursor
 *
 * Billy takes `?page&page_size` and answers with `results`, so "is there more" is *inferred* —
 * `results.length === page_size`, which is legacy's rule. One known cost: a ledger whose total is an exact
 * multiple of 20 shows a spinner for one extra request that comes back empty. That beats stopping early on
 * a full last page and silently hiding rows. B38 asks for a `count` or a `next`.
 */
export function useWalletLedger({
    displayCurrency,
    rate,
}: {
    displayCurrency: Currency
    rate: number
}): UseWalletLedgerResult {
    const { activeId, isAuthenticated } = useAuth()
    /*
     * `t` is used **here**, not in the view: `shared/components/ledger` takes finished strings, so a row's
     * title has to be resolved before it gets there. That is the trade for the shared layout, and it is the
     * right side of it — the alternative is each screen re-implementing the panel.
     */
    const { t, currentLanguage } = useTranslation()
    const [filter, setFilterState] = useState<string>(ALL_WALLET_TRANSACTIONS)

    /** Memoised because `walletLedgerKeys.list` builds a new array every call. */
    const queryKey = useMemo(() => walletLedgerKeys.list(activeId, filter), [activeId, filter])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            walletLedgerApi.getLedger({
                page: pageParam,
                type: filter,
                accountId: activeId,
                signal,
            }),
        /*
         * `lastPageParam + 1` rather than `pages.length + 1`: the same number today, and they stop being
         * the same the moment a page is dropped or the list is seeded, at which point counting pages asks
         * for the wrong one.
         */
        getNextPageParam: (lastPage, _pages, lastPageParam) =>
            lastPage.length === WALLET_LEDGER_PAGE_SIZE ? lastPageParam + 1 : undefined,
        /*
         * Five minutes, not the 60s default, and the socket is why. Every movement of Star or money
         * emits `balance_change`, which invalidates `balanceKeys.all` — and this list's key is
         * *under* that, so it refetches the moment the figure it explains moves. A `staleTime` here
         * buys no freshness the socket does not already provide; all it does is re-request on a
         * remount, and this is an infinite list, so that costs **every page the reader scrolled**.
         */
        staleTime: 5 * 60_000,
        enabled: isAuthenticated && Boolean(activeId),
    })

    /*
     * A synchronous latch beside the query's own flag, because that flag is **last render's**.
     * `isFetchingNextPage` only becomes true after a re-render, so two calls in the *same* tick both
     * read `false` and both fetch — which is exactly what an intersection observer does when it
     * reports several entries for one crossing. Measured before this latch: three calls in one act
     * produced three requests for page 2.
     *
     * A ref rather than state: it must be true for the next caller *now*, and it must not cause a
     * render of its own.
     */
    const isAdvancing = useRef(false)

    const entries = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

    /*
     * The Tevi Coin bonus on each loaded row — **B83**, answered. A separate query on purpose: it is an
     * annotation, so a dApp outage must cost the reader the figure and not their history. See
     * `use-ledger-bonuses.ts`, which also explains why the ids are re-asked as pages accumulate.
     */
    /*
     * The ids to ask the bonus lookup about, **grouped by page and never flattened**.
     *
     * One request per page is what `web-app` sends, and sending the accumulated set instead is what
     * stopped the bonuses appearing at all — see `useLedgerBonuses`. `InfiniteData.pages` already has
     * the grouping; flattening it here would throw away the only thing that mattered.
     *
     * **`txId`, never `id`.** `id` is the list key and falls back to `type + timestamp` when billy sent
     * none, so mapping it put a fabricated id into `?billy_tx_id=` — a lookup for a transaction that
     * does not exist. `filter(Boolean)` drops rows with no real id: they cannot carry a bonus, and
     * asking about them is asking about nothing.
     */
    const billyTxIdPages = useMemo(
        () =>
            (query.data?.pages ?? []).map(page =>
                page.map(entry => entry.txId).filter((id): id is string => Boolean(id)),
            ),
        [query.data],
    )
    const { bonuses } = useLedgerBonuses(billyTxIdPages)

    const groups = useMemo(() => {
        const out: LedgerGroupModel[] = []
        for (const entry of entries) {
            const key = ledgerMonthKey(entry.createdAt)
            const labelKey = walletTransactionLabelKey(entry.type)
            const row = {
                id: entry.id,
                /*
                 * The backend's sentence, then our label, then the raw slug. Each step is one degree worse
                 * and none of them is blank: a reader who can see `space_tier_bonus` can ask about it, and
                 * a reader looking at an empty line cannot.
                 */
                title: entry.description || (labelKey ? t(labelKey) : entry.type),
                subtitle: formatLedgerDateTime(entry.createdAt, currentLanguage),
                /*
                 * The unit is the **row's**, not the screen's. A currency ledger can contain a Star row — a
                 * `conversion` has a leg in each — and showing that with a dollar sign would misreport it
                 * by a factor of a hundred. `formatLedgerAmount` branches on `entry.currency` first.
                 */
                amount: formatLedgerAmount({
                    amount: entry.amount,
                    currency: entry.currency,
                    displayCurrency,
                    rate,
                    locale: currentLanguage,
                }),
                isCredit: entry.amount >= 0,
                icon: walletTransactionIcon(entry.type, isStarEntry(entry.currency)),
                amountMark: isStarEntry(entry.currency)
                    ? { src: TEVI_STAR_SRC, size: 20 }
                    : undefined,
                /*
                 * `undefined` for the rows without one, which is most of them — see `LedgerRowModel`.
                 *
                 * The figure is formatted **here** rather than in the row, for the reason the whole
                 * mapping step exists: this is the only place with the payload, the locale and the
                 * vocabulary at once. `+` is prepended because a bonus is only ever a credit — the
                 * endpoint's rows are all `type: 'deposit'` — so unlike `amount` the sign is not in
                 * the number.
                 */
                bonus: (() => {
                    /*
                     * `bonuses` is already filtered by `isDisplayableBonus` — the `amount === null`
                     * check here is only what narrows the type for the template below.
                     */
                    const bonus = entry.txId ? bonuses.get(entry.txId) : undefined
                    if (!bonus || bonus.amount === null) return undefined
                    return {
                        label: t('balance_txn_bonus_label'),
                        // `formatPlainAmount`: up to two decimals and **no minimum**, so a whole
                        // bonus stays `+10` rather than becoming `+10.00`. Legacy formats it with a
                        // bare `formatNumber` and the same effect.
                        amount: `+${formatPlainAmount(bonus.amount, currentLanguage)}`,
                        mark: { src: TEVI_COIN_SRC, size: 14 },
                    }
                })(),
            }
            /*
             * Appended to the last group rather than looked up in a map, which is what keeps the server's
             * order: rows arrive newest-first, so same-month rows are adjacent. A map would silently merge
             * a March row that arrived after an April one back into an earlier March group — reordering a
             * ledger, which is the one thing not to do to it.
             */
            const last = out.at(-1)
            if (last && last.key === key) last.rows.push(row)
            else
                out.push({
                    key,
                    label: formatLedgerMonth(entry.createdAt, currentLanguage),
                    rows: [row],
                })
        }
        return out
    }, [entries, bonuses, currentLanguage, displayCurrency, rate, t])

    const setFilter = useCallback((type: string) => {
        // Sanitised against this ledger's own vocabulary — see `isWalletTransactionFilter`.
        if (!isWalletTransactionFilter(type)) return
        setFilterState(type)
    }, [])

    const isLoading = query.isLoading
    const settledEmpty = !isLoading && !query.isError && entries.length === 0

    return {
        groups,
        entries,
        bonuses,
        filter,
        setFilter,
        isLoading,
        isError: query.isError,
        /*
         * Split here rather than in the view, because only this hook knows whether a filter is applied.
         * They say different things — "you have never had a transaction" versus "nothing matches this
         * filter" — and offering the first when the second is true sends a creator looking for a bug in
         * their earnings.
         */
        isEmpty: settledEmpty && filter === ALL_WALLET_TRANSACTIONS,
        isFilteredEmpty: settledEmpty && filter !== ALL_WALLET_TRANSACTIONS,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        fetchNextPage: () => {
            if (!query.hasNextPage || query.isFetchingNextPage || isAdvancing.current) return
            isAdvancing.current = true
            query.fetchNextPage().finally(() => {
                isAdvancing.current = false
            })
        },
        refetch: () => {
            query.refetch()
        },
    }
}
