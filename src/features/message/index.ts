/**
 * Direct messages — `/messages` and `/@{slug}/messages`. Legacy's `containers/directMessage`.
 *
 * ```
 * MessagesShell       the (dm) layout's frame: the conversation list, and a pane for the page
 * NoChatSelected      /messages' page — the empty room pane
 * ChatRoom            /@{slug}/messages' page — one conversation
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
 * - **Sending photos** (legacy's attachment sheet + `upload_images/{id}/{n}`). Photos *received*
 *   render and open in the post lightbox.
 * - **Link cards**: legacy turns the first Tevi URL in a message into a post / space / live /
 *   collection / membership card. Here the link is clickable text.
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
export { ChatRoom } from './components/chat-room'
export { MessagesShell, NoChatSelected } from './components/messages-shell'
export { conversationPath, MESSAGES_PATH } from './routes'
