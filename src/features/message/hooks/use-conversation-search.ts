'use client'

import { useAuth } from '@features/auth'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { messageApi, messageKeys } from '../api/message-api'
import type { Conversation } from '../api/types'

/**
 * 400ms — this app's number for a search field (`useChannelSearch`, `useBlockedAccounts`). Legacy
 * waits 500.
 */
const SEARCH_DEBOUNCE_MS = 400

export interface UseConversationSearchResult {
    /** What the field shows, updated on every keystroke. */
    search: string
    setSearch: (value: string) => void
    /** The field is empty — the list shows the folders, not results. */
    isIdle: boolean
    results: Conversation[]
    isLoading: boolean
    isError: boolean
    isEmpty: boolean
    retry: () => void
}

/**
 * Searching the conversation list.
 *
 * The term is in the query key, so it is debounced *before* it gets there — the raw value drives
 * the field and the settled one drives the request, as `useChannelSearch` does. Clearing applies at
 * once: there is no request to save.
 *
 * `placeholderData: keepPreviousData` keeps the previous term's rows on screen while the next one
 * loads, instead of flashing ten skeleton rows per word typed. Legacy clears the results on every
 * keystroke (`handleSearchValue` sets them to `[]`), which is exactly that flash.
 */
export function useConversationSearch(): UseConversationSearchResult {
    const { activeId, isAuthenticated } = useAuth()
    const [search, setSearch] = useState('')
    const [query, setQuery] = useState('')

    useEffect(() => {
        const next = search.trim()
        if (next === '') {
            setQuery('')
            return
        }
        const timer = setTimeout(() => setQuery(next), SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(timer)
    }, [search])

    // The field is what decides idle, not the settled term — otherwise clearing it would keep the
    // results up for one more frame, and typing the first letter would not leave the folders yet.
    const isIdle = search.trim() === ''

    const results = useQuery({
        queryKey: messageKeys.search(query, activeId),
        queryFn: ({ signal }) => messageApi.search({ query, accountId: activeId, signal }),
        enabled: isAuthenticated && query !== '',
        placeholderData: keepPreviousData,
    })

    const rows = results.data ?? []
    // Typed but not yet settled counts as loading, so "no results" cannot flash for the prefix.
    const isLoading = !isIdle && (query === '' || results.isLoading)

    return {
        search,
        setSearch,
        isIdle,
        results: rows,
        isLoading,
        isError: results.isError,
        isEmpty:
            !isIdle && !isLoading && !results.isError && !results.isFetching && rows.length === 0,
        retry: () => {
            results.refetch()
        },
    }
}
