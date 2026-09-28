import { env } from '@shared/config/env'
import { ANON_SCOPE, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import {
    CONVERSATION_PAGE_SIZE,
    type ConversationCursor,
    type ConversationPage,
    cursorFromNextUrl,
} from '../lib/conversation-page'
import {
    CONVERSATION_FILTER,
    type Conversation,
    type ConversationFilter,
    normalizeConversations,
} from './types'

/** The messenger service: `${W_API}/messenger`. Legacy's `models/apiMessenger.js`. */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/messenger` })

const RECENT_PATH = 'v2/rpc/get_recent_conversations'

/**
 * Query keys for direct messages. **Every key carries the account id** — a conversation list names
 * who this account talks to, and an un-scoped key hands it to whichever account is switched to
 * next. Same rule as `notificationKeys`.
 */
export const messageKeys = {
    all: ['message'] as const,
    /** One folder of the list, paginated. The pages live inside the entry. */
    conversations: (filter: ConversationFilter, accountId: string | null) =>
        ['message', 'conversations', filter, accountId ?? 'anon'] as const,
    /**
     * How many conversations are unread — the Unread tab's badge. Its own one-row request rather
     * than the Unread folder's `count`, so the badge is right before anyone opens that tab (legacy
     * only learns the number by loading the folder, so its badge is blank until then).
     */
    unreadCount: (accountId: string | null) =>
        ['message', 'unread-count', accountId ?? 'anon'] as const,
    /** Search results. The term is in the key, so it is debounced before it gets here. */
    search: (query: string, accountId: string | null) =>
        ['message', 'search', query, accountId ?? 'anon'] as const,
}

/**
 * Forget the stored ETags for the conversation list — **before** any refetch that follows a write or
 * a socket frame, and awaited.
 *
 * The list's body changes on every message anyone sends, and `apiClient` replays a stored body on a
 * 304. If this service's validator does not move with `latest_message` — which is exactly what
 * `my-subscriptions/` does (**B72**) — the refetch after a delete would bring the conversation
 * back, and the one after `new_message` would keep showing the previous line. Keyless, so every
 * folder and page goes. See `forgetInboxCache` for the long version.
 */
export function forgetConversationCache(accountId: string | null) {
    return invalidateETagCache(accountId ?? ANON_SCOPE, `${api.apiBase}/${RECENT_PATH}`)
}

function scoped(accountId?: string | null, signal?: AbortSignal) {
    return { signal, ...(accountId ? { accountId } : {}) }
}

type ListBody = { results?: unknown; next_url?: unknown; count?: unknown }

/**
 * The inbox endpoints — legacy's `models/messenger.js`, the part the list screen uses. The chat room
 * adds its own methods here when it lands.
 *
 * None of the writes is retried (`apiClient` retries idempotent methods only, and these are
 * `POST`s): both are safe to repeat, but a 502 that arrives after the write landed would replay a
 * write whose outcome the screen has already shown.
 */
export const messageApi = {
    /**
     * One page of one folder. `cursor` is `null` for the first page; after that it is whatever the
     * service put on `next_url`, carried verbatim (see `cursorFromNextUrl`).
     */
    async getConversations({
        filter,
        cursor,
        accountId,
        signal,
    }: {
        filter: ConversationFilter
        cursor?: ConversationCursor | null
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<ConversationPage> {
        const body = await api.get<ListBody>(
            RECENT_PATH,
            cursor ?? { limit: CONVERSATION_PAGE_SIZE, filter },
            scoped(accountId, signal),
        )
        const total = Number(body?.count)
        return {
            results: normalizeConversations(body?.results),
            next: cursorFromNextUrl(body?.next_url),
            count: Number.isFinite(total) && total >= 0 ? total : null,
        }
    },

    /**
     * How many conversations are unread. A failure **rejects** rather than resolving to 0 — a
     * badge that is missing because the request failed is correct, one that says "nothing unread"
     * is not.
     */
    async getUnreadCount({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<number> {
        const body = await api.get<ListBody>(
            RECENT_PATH,
            { limit: 1, filter: CONVERSATION_FILTER.unread },
            scoped(accountId, signal),
        )
        const total = Number(body?.count)
        if (Number.isFinite(total) && total >= 0) return total
        return Array.isArray(body?.results) ? body.results.length : 0
    },

    /** Conversations whose other side matches `query`. One page — the service paginates nothing. */
    async search({
        query,
        accountId,
        signal,
    }: {
        query: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<Conversation[]> {
        const body = await api.get<ListBody>(
            'v2/rpc/search_conversation',
            { query },
            scoped(accountId, signal),
        )
        return normalizeConversations(body?.results)
    },

    /**
     * Mark everything up to `lastMessageId` seen. The id is optional on the wire and sent whenever
     * the row has one: "seen up to here" is what stops a message that lands during the request
     * from being swallowed by it.
     */
    markSeenAll(conversationId: string, lastMessageId: string | null, accountId?: string | null) {
        return api.post(
            `v2/rpc/mark_seen_all/${encodeURIComponent(conversationId)}/`,
            lastMessageId ? { last_message_id: lastMessageId } : {},
            scoped(accountId),
        )
    },

    /**
     * Delete a conversation — **for this account only**. The wire word is *flush*, and
     * `both_members=false` is what keeps the other side's copy: legacy sends it as a query
     * parameter with an empty body (its `post(uri, params, data)` puts the object in `params`), so
     * this does too.
     */
    deleteConversation(conversationId: string, accountId?: string | null) {
        return api.post(
            `v2/rpc/flush_conversation/${encodeURIComponent(conversationId)}/`,
            undefined,
            { ...scoped(accountId), params: { both_members: false } },
        )
    },
}
