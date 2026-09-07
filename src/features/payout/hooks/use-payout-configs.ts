'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import type { PagedList } from '@shared/lib/api/paged-list'
import { nextPagedCursor, removeListRow } from '@shared/lib/api/paged-list'
import {
    type InfiniteData,
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { PayoutConfigRow } from '../api/config-types'
import { PAYOUT_CONFIG_PAGE_SIZE, payoutApi, payoutKeys } from '../api/payout-api'

export interface UsePayoutConfigsResult {
    /** Every loaded method, flattened. `active` only — see below. */
    methods: PayoutConfigRow[]
    isLoading: boolean
    isError: boolean
    /** Settled, and this account has no saved method. The screen's most common first state. */
    isEmpty: boolean
    /** The list is an account's, and an anonymous visitor has none. */
    isSignedOut: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    loadMore: () => void
    refetch: () => void
    /** The method whose removal is in flight, so its dialog can spin. */
    removingId: string | null
    isRemoving: boolean
    remove: (row: PayoutConfigRow) => void
}

/**
 * The saved payout methods behind `/my-wallet/payout-method` — the list, and the removal.
 *
 * ## `active` only, and the filter belongs here rather than in the view
 *
 * Legacy filters in its render (`payoutMethods.filter(item => item.status === 'active')`) and pays for
 * it twice: its own emptiness check counts the *unfiltered* list, so an account whose only method is
 * `deleted` renders a screen with a header, an Add button and no rows and never reaches the empty
 * state — and its infinite scroll counts filtered rows against an unfiltered page size, so a page of
 * twenty deleted methods looks like the end of the list.
 *
 * Filtering in the hook means `isEmpty` and the paging both see the same list the reader does.
 *
 * ## `error` is shown, `deleted` is not
 *
 * Three statuses exist (`active` · `error` · `deleted`). `deleted` is history and is dropped.
 * `error` is a method the backend could not use — legacy hides it, which leaves the creator with a
 * screen that says nothing while their payouts fail. It is kept, with the status on the row, because
 * the only thing they can do about it is see it and remove it. That is the one behavioural divergence
 * in this hook.
 *
 * ## The removal is a cache edit, not a refetch
 *
 * `removeListRow` takes the row out of every loaded page and decrements the total —
 * `shared/lib/api/paged-list.ts`, the same rule the blocked list and the inbox use. A refetch would
 * re-request every page the reader has scrolled through to learn one thing this client already knows.
 *
 * **Not optimistic.** The row leaves after the server agrees: a payout destination that vanishes and
 * comes back because a DELETE failed is worse than a button that spins for 300ms, and the dialog it
 * is pressed in is already a deliberate confirmation.
 */
export function usePayoutConfigs(): UsePayoutConfigsResult {
    const { activeId, isAuthenticated, isBootstrapping } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    /**
     * Memoised: `payoutKeys.configs` builds a new array per call, and the mutation's cache surgery
     * below is keyed on this identity.
     */
    const queryKey = useMemo(() => payoutKeys.configs(activeId), [activeId])

    const query = useInfiniteQuery({
        queryKey,
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            payoutApi.getConfigs({ cursor: pageParam, accountId: activeId, signal }),
        getNextPageParam: (last, _pages, lastParam) =>
            nextPagedCursor(last, lastParam, PAYOUT_CONFIG_PAGE_SIZE),
        /*
         * **Never stale on its own.** These are the reader's own payout destinations, and this
         * client is the only thing that changes them: `createConfig` invalidates the key, and a
         * removal edits the loaded pages in place (see the note above). There is no third party and
         * no socket, so a timer can only ever re-ask a question whose answer this hook already knows
         * — and it is the same re-request-every-scrolled-page cost that made the removal a cache
         * edit rather than a refetch. The two decisions are the same decision.
         */
        staleTime: Number.POSITIVE_INFINITY,
        /*
         * The `Infinity` above is a claim about *staleness*, and `gcTime` is what decides whether
         * there is anything left for it to be a claim about: at the 5-minute default this list is
         * dropped five minutes after the payout screen unmounts, and coming back re-fetches it —
         * so "never stale on its own" would have been true only while somebody stood on the page.
         * Half an hour covers leaving to find a bank statement and returning, which is the actual
         * shape of this screen's use. Bounded rather than `Infinity`, because nothing needs it held
         * for the life of the tab.
         */
        gcTime: 30 * 60_000,
        enabled: isAuthenticated && Boolean(activeId),
    })

    const methods = useMemo(
        () =>
            (query.data?.pages ?? [])
                .flatMap(page => page.results)
                // `deleted` is history. `error` stays — see the note above.
                .filter(row => row.status !== 'deleted'),
        [query.data],
    )

    const [removingId, setRemovingId] = useState<string | null>(null)

    const removeMutation = useMutation({
        mutationFn: ({ id, accountId }: { id: string; accountId: string | null }) =>
            payoutApi.deleteConfig({ id, accountId }),
        onSuccess: (_data, { id, accountId }) => {
            /*
             * Written into the key the request was **pinned to**, not into `queryKey` — those differ
             * the moment somebody switches accounts while a DELETE is in flight, and writing the
             * removal into the new account's list would drop a row belonging to somebody else.
             */
            queryClient.setQueryData<InfiniteData<PagedList<PayoutConfigRow>, PageCursor | null>>(
                payoutKeys.configs(accountId),
                data => removeListRow(data, id),
            )
            toast.success(t('payout_method_removed'))
        },
        // A static sentence, so `meta` rather than an `onError` — the failure has one meaning.
        meta: { showErrorToast: t('payout_method_remove_failed') },
        onSettled: () => {
            isRemovingNow.current = false
            setRemovingId(null)
        },
    })

    /**
     * A synchronous latch beside the query's own flag, for the reason `usePayoutRequests` states: the
     * flag is last render's, so two sentinel callbacks in one tick both see `false` and both fetch.
     */
    const isAdvancing = useRef(false)

    /**
     * The same latch for the removal, and it is **not** redundant with `removeMutation.isPending`.
     *
     * That flag is last render's too: two `remove` calls in one tick — a double-tap the dialog's
     * pending state has not repainted for yet — both read `false` and both fire a DELETE. Caught by
     * `use-payout-configs.test.tsx`, where the second call went out against the second row.
     */
    const isRemovingNow = useRef(false)

    const loadMore = useCallback(() => {
        if (!query.hasNextPage || query.isFetchingNextPage || isAdvancing.current) return
        isAdvancing.current = true
        query.fetchNextPage().finally(() => {
            isAdvancing.current = false
        })
    }, [query])

    const remove = useCallback(
        (row: PayoutConfigRow) => {
            // Single-flight, off the ref rather than the flag — see `isRemovingNow`.
            if (isRemovingNow.current || removeMutation.isPending) return
            isRemovingNow.current = true
            setRemovingId(row.id)
            // The account is pinned in the variables, so neither the request nor the cache write can
            // land on whichever account happens to be active when the response arrives.
            removeMutation.mutate({ id: row.id, accountId: activeId })
        },
        [activeId, removeMutation],
    )

    const isLoading = query.isLoading

    return {
        methods,
        isLoading,
        isError: query.isError,
        isEmpty: !isLoading && !query.isError && methods.length === 0,
        isSignedOut: !isBootstrapping && !isAuthenticated,
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        loadMore,
        refetch: () => {
            query.refetch()
        },
        removingId,
        isRemoving: removeMutation.isPending,
        remove,
    }
}
