/**
 * What the **app shell** needs from this feature, and nothing else — the unread dot on the Chat
 * entry of the desktop rail and the mobile tab bar.
 *
 * `features/notification/shell.ts` makes the same cut for the same two reasons, and its note is the
 * long version:
 *
 * - **Bundle.** `index.ts` exports the chat room, the popup and the conversation pane; the navbar is
 *   on every page, and importing the barrel to draw an 8px dot would ship the inbox to all of them.
 * - **The cycle.** This feature imports `features/channel`, which imports `features/navigation`
 *   (the MCN screens' `PageBackBar`). `navigation` importing `message`'s barrel would close that
 *   loop, which ESM resolves by handing one side a half-initialised module — an `undefined is not a
 *   function` at render time, not a build error.
 *
 * So this file is a leaf: the hook below reaches `features/auth`, `features/realtime` and this
 * feature's own API model, none of which imports navigation.
 */

export { useLiveUnreadConversations } from './hooks/use-live-unread-conversations'
