'use client'

import { useAuth } from '@features/auth'
import { useQuery } from '@tanstack/react-query'
import { useDeferredValue, useMemo, useState } from 'react'
import { eventReportApi, eventReportKeys } from '../api/event-report-api'
import { type EventOrder, ORDER_KINDS, type OrderTab } from '../api/report-types'

/**
 * The **Report details** dialog's data — one of three order lists, filtered by a name.
 *
 * ## The filter is client-side, because the list is
 *
 * All fifty rows arrive in one request (`ORDERS_PAGE_SIZE`), so filtering is a `String.includes`
 * over data already in hand. Legacy does the same and reaches for a 500 ms `setTimeout` to debounce
 * it — a timer, a ref, and a `clearTimeout` on every keystroke, to avoid re-running a filter over
 * fifty rows.
 *
 * `useDeferredValue` replaces all of it: React keeps the input responsive and re-renders the list at
 * a lower priority, with no timer to leak and no ref to clear. It is also *better* behaviour — the
 * debounce made the list visibly lag a paste, where this updates as fast as the frame allows.
 *
 * ⚠ **Both sides are lower-cased.** Legacy lower-cases only the *value* (`includes(value)`) and
 * compares it against `display_name?.toLowerCase()` — which happens to work, and then does not the
 * moment somebody types a capital letter, because the value it lower-cased is the one already
 * lower-cased. Read the expression: it lower-cases the field and passes the raw input. So searching
 * `Ada` matches nothing while `ada` matches. Fixed here rather than reproduced.
 *
 * ## Each tab is its own query, keyed on its `kind`
 *
 * Legacy holds one `data` array and clears it on every tab change, so switching back to a tab
 * re-fetches it — and its fetch guard (`if (… || data.length > 0) return`) means a tab that
 * legitimately has **no orders** re-requests on every open, forever. Three query keys make the cache
 * do that work: a visited tab is instant, and an empty one stays empty.
 */
/**
 * A row plus a **composed key**, because the endpoint sends no order id (**B116** asks for one).
 *
 * Composed in the hook rather than at the call site so the component never sees an index: the key is
 * built from the fields that identify the row to a reader — who, when, how much — plus its position
 * as the last resort for two genuinely identical rows. Stable across a re-filter, which is all a key
 * has to be for a list that is replaced wholesale and holds no per-row state.
 */
export interface KeyedOrder {
    key: string
    order: EventOrder
}

export interface EventOrdersFlow {
    tab: OrderTab
    setTab: (tab: OrderTab) => void
    /** The raw input. Bound to the search field. */
    search: string
    setSearch: (value: string) => void
    /** The rows for the current tab, filtered, each with a composed key. */
    orders: KeyedOrder[]
    /** Rows the server sent for this tab, before filtering — `0` means the tab is genuinely empty. */
    totalForTab: number
    isLoading: boolean
    isError: boolean
    refetch: () => void
}

export function useEventOrders({
    code,
    enabled = true,
}: {
    code: string
    enabled?: boolean
}): EventOrdersFlow {
    const { activeId } = useAuth()
    const [tab, setTab] = useState<OrderTab>('tickets')
    const [search, setSearch] = useState('')
    const deferred = useDeferredValue(search)

    const query = useQuery({
        queryKey: eventReportKeys.orders(code, ORDER_KINDS[tab], activeId),
        queryFn: ({ signal }) =>
            eventReportApi.getOrders({ code, kind: ORDER_KINDS[tab], accountId: activeId, signal }),
        enabled: enabled && Boolean(code),
    })

    const rows = query.data ?? []

    const orders = useMemo(() => {
        const term = deferred.trim().toLowerCase()
        const matched = term
            ? rows.filter(row => {
                  // A game order names a product rather than a person, so both are searchable —
                  // legacy filters on `display_name` alone, which makes the search box inert on
                  // that tab.
                  const name = row.user?.display_name ?? row.product?.name ?? ''
                  const slug = row.user?.channel_slug ?? ''
                  return name.toLowerCase().includes(term) || slug.toLowerCase().includes(term)
              })
            : rows
        return matched.map((order, index) => ({
            key: [
                tab,
                order.user?.channel_slug ?? order.user?.display_name ?? order.product?.name ?? '',
                order.created_at ?? '',
                order.net_amount ?? '',
                index,
            ].join('|'),
            order,
        }))
    }, [rows, deferred, tab])

    return {
        tab,
        setTab: next => {
            setTab(next)
            // The term belongs to the list that was on screen. Legacy clears it too, and it is the
            // right call: a filter carried onto a different list reads as an empty tab.
            setSearch('')
        },
        search,
        setSearch,
        orders,
        totalForTab: rows.length,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: () => void query.refetch(),
    }
}
