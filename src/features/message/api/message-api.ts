import { env } from '@shared/config/env'
import { ApiError } from '@shared/lib/api/errors'
import { ANON_SCOPE, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import {
    CONVERSATION_PAGE_SIZE,
    type ConversationCursor,
    type ConversationPage,
    cursorFromNextUrl,
} from '../lib/conversation-page'
import {
    CHAT_ACTION,
    type ChatAction,
    type ChatMessage,
    CONVERSATION_FILTER,
    type Conversation,
    type ConversationFilter,
    type ConversationGate,
    gateFromCode,
    normalizeConversations,
    normalizeMessages,
    parseMessage,
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
    /**
     * The conversation with one space's owner — or the reason there is none. Keyed on the owner's
     * id **and** whether this account follows and blocks them, so Follow and Unblock from a wall
     * re-ask on their own.
     */
    room: (ownerId: string, followed: boolean, blocking: boolean, accountId: string | null) =>
        ['message', 'room', ownerId, followed, blocking, accountId ?? 'anon'] as const,
    /** One conversation's messages, newest page first. */
    messages: (conversationId: string, accountId: string | null) =>
        ['message', 'messages', conversationId, accountId ?? 'anon'] as const,
}

/** How many messages a page holds. Legacy's `LIMIT_MESSAGES`. */
export const MESSAGE_PAGE_SIZE = 20

/**
 * The wall a failed call asks for, or `null` for an ordinary failure. By code, not by status — the
 * apps read the body's `code` whatever the status (Android's `MSG005` arrives on a send).
 */
export function gateOf(error: unknown): ConversationGate | null {
    return error instanceof ApiError ? gateFromCode(error.code) : null
}

export type RoomResult =
    | { kind: 'open'; conversation: Conversation }
    | { kind: 'gated'; gate: ConversationGate }

export type MessagePage = { results: ChatMessage[]; next: ConversationCursor | undefined }

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
    /**
     * Open (or create) the direct conversation with a space's owner.
     *
     * One request where legacy makes two: it asks `can_start_conversation_with` first and then
     * `start_conversation_with`, but the second answers **the same `{ code }`** when it refuses
     * (legacy reads `res.response.data.code` from both, and Android calls only the second), so the
     * first is a round trip that can only repeat what the second would say. Any of the codes in
     * `ConversationGate` becomes a wall; anything else is a real failure and rejects.
     *
     * A `POST` inside a query is deliberate: the call is idempotent from the reader's side — the
     * same member yields the same conversation — and it is the screen's *read*. It is not retried
     * on a 5xx, like every other `POST` (see `client.ts`).
     */
    async openConversation(ownerId: string, accountId?: string | null): Promise<RoomResult> {
        try {
            const body = await api.post<unknown>(
                'v2/rpc/start_conversation_with',
                { member: ownerId },
                scoped(accountId),
            )
            const [conversation] = normalizeConversations([body])
            if (!conversation) throw new ApiError({ message: 'No conversation in the response' })
            return { kind: 'open', conversation }
        } catch (error) {
            const gate = gateOf(error)
            if (gate) return { kind: 'gated', gate }
            throw error
        }
    },

    /** One page of messages, newest first; `cursor` is the previous page's `next_url` query. */
    async getMessages({
        conversationId,
        cursor,
        accountId,
        signal,
    }: {
        conversationId: string
        cursor?: ConversationCursor | null
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<MessagePage> {
        const body = await api.get<ListBody>(
            'v2/rpc/get_messages',
            cursor ?? { conversation_ids: conversationId, limit: MESSAGE_PAGE_SIZE },
            scoped(accountId, signal),
        )
        return {
            results: normalizeMessages(body?.results),
            next: cursorFromNextUrl(body?.next_url),
        }
    },

    /** One message, as the server has it now — what a socket frame's id is resolved through. */
    async getMessage(messageId: string, accountId?: string | null): Promise<ChatMessage | null> {
        const body = await api.get<unknown>(
            `v2/rpc/get_message/${encodeURIComponent(messageId)}/`,
            undefined,
            scoped(accountId),
        )
        return parseMessage(body)
    },

    /**
     * Send a text message. `parser: 'PLAIN'` is legacy's, and the reason nothing a reader types is
     * ever parsed as markup by the service.
     */
    async sendMessage({
        conversationId,
        text,
        replyToId,
        accountId,
    }: {
        conversationId: string
        text: string
        replyToId?: string | null
        accountId?: string | null
    }): Promise<ChatMessage | null> {
        const body = await api.post<unknown>(
            'v2/rpc/send_message',
            {
                conversation_id: conversationId,
                input_text: text,
                msg_type: 'TEXT',
                parser: 'PLAIN',
                ...(replyToId ? { reply_to_id: replyToId } : {}),
            },
            scoped(accountId),
        )
        return parseMessage(body)
    },

    async editMessage(messageId: string, text: string, accountId?: string | null) {
        const body = await api.post<unknown>(
            `v2/rpc/edit_message/${encodeURIComponent(messageId)}`,
            { new_text: text },
            scoped(accountId),
        )
        return parseMessage(body)
    },

    /**
     * Delete a message — for this account (`both: false`) or for both sides. `both` is a **query
     * parameter**, as legacy sends it (`post(uri, { both })` puts it in `params`).
     */
    deleteMessage(messageId: string, both: boolean, accountId?: string | null) {
        return api.post(`v2/rpc/delete_message/${encodeURIComponent(messageId)}`, undefined, {
            ...scoped(accountId),
            params: { both },
        })
    },

    /** "Typing…" for the other side. Fire-and-forget: a lost one costs a stale indicator. */
    sendChatAction(
        conversationId: string,
        action: ChatAction = CHAT_ACTION.none,
        accountId?: string | null,
    ) {
        return api.post(
            `v2/rpc/send_chat_action/${encodeURIComponent(conversationId)}/`,
            { action },
            scoped(accountId),
        )
    },

    /** A bot button's `CALLBACK_DATA` press. */
    setCallbackData(messageId: string, data: string, accountId?: string | null) {
        return api.post(
            `v2/rpc/set_message_callback_data/${encodeURIComponent(messageId)}`,
            { callback_data: data },
            scoped(accountId),
        )
    },

    deleteConversation(conversationId: string, accountId?: string | null) {
        return api.post(
            `v2/rpc/flush_conversation/${encodeURIComponent(conversationId)}/`,
            undefined,
            { ...scoped(accountId), params: { both_members: false } },
        )
    },
}
