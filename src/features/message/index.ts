/**
 * Direct messages — `/messages`, the conversation list. Legacy's `containers/directMessage`.
 *
 * ```
 * MessagesView        the screen: search, the All / Unread folders, the empty chat pane
 * ./routes            MESSAGES_PATH + conversationPath(slug) — imports nothing, for the shell
 * ```
 *
 * ## What legacy's provider did, and where it went
 *
 * Legacy mounts `DirectMessageProvider` on every page: three hooks' worth of `useState` (both folders,
 * the search, the open chat's messages), six socket listeners writing frames into that state, and a
 * floating chat popup. Here:
 *
 * - The lists are **queries** (`useConversations`, `useUnreadConversations`,
 *   `useConversationSearch`), keyed per account, invalidated by the socket (`useConversationLive`)
 *   rather than spliced by it.
 * - "Typing…" is the one piece of socket state, and it is local to the screen (`useChatActions`).
 * - Nothing is mounted on pages that do not show a conversation. The popup is not ported.
 *
 * ## Not built yet
 *
 * - **The conversation** at `conversationPath(slug)` (`/@{slug}/messages`) — every row links there.
 * - **Message settings**: who may start a conversation (followers / members) and the shareable
 *   `/@{slug}/messages` link. Needs `messaging_settings` on `channelApi.updateMyChannel`.
 * - Legacy's **member badge** on a row (`is_my_subscriber`) — no DS mark for it exists yet.
 *
 * ## The socket events this feature owns
 *
 * `new_message`, `update_message`, `deleted_message`, `seen_message`, `update_conversation` and
 * `change_chat_action` — declared in `shared/lib/socket/user-room.ts`, whose note says why only the
 * last one's payload is read.
 *
 * Deliberately **not** exported: `messageApi` and the hooks. Each hook writes to this feature's
 * caches, and a second screen mounting one is a second owner of that state.
 */

export { messageKeys } from './api/message-api'
export { MessagesView } from './components/messages-view'
export { conversationPath, MESSAGES_PATH } from './routes'
