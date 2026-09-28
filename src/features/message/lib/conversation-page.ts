import type { InfiniteData } from '@tanstack/react-query'
import type { Conversation } from '../api/types'

/**
 * Paging and cache surgery for the conversation list.
 *
 * This list is **cursor**-paginated, which is why it does not go through
 * `shared/lib/api/paged-list.ts`: that module is page-numbered DRF, and CLAUDE.md keeps the one
 * cursor list (post threads) out of it on purpose. The service hands back a `next_url` and the only
 * thing this client knows about it is that its query string is the next request's.
 */

/** Legacy's `LIMIT_CONVERSATION`. */
export const CONVERSATION_PAGE_SIZE = 20

/** The next request's params, exactly as the service spelled them on `next_url`. */
export type ConversationCursor = Record<string, string>

export type ConversationPage = {
    results: Conversation[]
    /** `undefined` on the last page — the shape `getNextPageParam` wants. */
    next: ConversationCursor | undefined
    /** The folder's total, where the service sent one. */
    count: number | null
}

export type ConversationData = InfiniteData<ConversationPage, ConversationCursor | null> | undefined

/**
 * `next_url` → the params for the next page.
 *
 * Legacy resolves it against `window.location.origin` and keeps only `url.search`, i.e. the path is
 * thrown away and the query is replayed against `get_recent_conversations`. That is the only reading
 * both shipped clients agree on, so it is the one used here — with `URL` given a fixed base, so it
 * works on the server and in a test without a `window`. A `next_url` with no query (or none at all)
 * is the last page: replaying an empty query would request the first page again, forever.
 */
export function cursorFromNextUrl(value: unknown): ConversationCursor | undefined {
    if (typeof value !== 'string' || value.trim() === '') return undefined
    let url: URL
    try {
        url = new URL(value, 'https://placeholder.invalid')
    } catch {
        return undefined
    }
    const params: ConversationCursor = {}
    for (const [key, param] of url.searchParams) params[key] = param
    return Object.keys(params).length > 0 ? params : undefined
}

/**
 * Take one conversation out of every loaded page — what Delete leaves behind.
 *
 * Returns the same object when the row is not loaded, so `setQueryData` does not re-render every
 * subscriber for a write that changed nothing.
 */
export function removeConversation(data: ConversationData, id: string): ConversationData {
    if (!data) return data
    if (!data.pages.some(page => page.results.some(row => row.id === id))) return data
    return {
        ...data,
        pages: data.pages.map(page => ({
            ...page,
            results: page.results.filter(row => row.id !== id),
            count: page.count === null ? null : Math.max(0, page.count - 1),
        })),
    }
}

/**
 * Zero one conversation's unread count — what `mark_seen_all` leaves behind.
 *
 * Written rather than refetched for the reason `setInboxRead` gives: it is the outcome of a request
 * this client made, applied to a row already in hand, and it has to land before the navigation that
 * opening a conversation starts takes the row off screen.
 */
export function markConversationSeen(data: ConversationData, id: string): ConversationData {
    if (!data) return data
    const changes = data.pages.some(page =>
        page.results.some(row => row.id === id && (row.stats?.unread_messages ?? 0) > 0),
    )
    if (!changes) return data
    return {
        ...data,
        pages: data.pages.map(page => ({
            ...page,
            results: page.results.map(row =>
                row.id === id ? { ...row, stats: { ...row.stats, unread_messages: 0 } } : row,
            ),
        })),
    }
}
