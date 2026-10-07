# Direct messages

**One reader writing to one space.** The inbox at `/messages`, a conversation at `/@{slug}/messages`,
the floating chat window on desktop, and the "send to a conversation" block inside the share sheet.
All four are one feature over one backend, `${W_API}/messenger/v2/rpc/…`. That backend has **no
schema**, so every field this client reads was read out of legacy and the two native clients. The
guesses are written down as **B111–B113**.

This document collects the reasoning that is spread across the feature's comments: what each
primitive owns, how a send survives a dropped connection, why the thread is drawn upside down, and
what is deliberately not built. Each call site still carries the full argument for its own
decision. This is the map, not a copy of them.

- **Code:** [`src/features/message/`](../src/features/message/). Its `index.ts` lists what is
  exported, and why the hooks and the model are not.
- **Socket transport:** [`src/shared/lib/socket/`](../src/shared/lib/socket/), connected by
  [`src/features/realtime/`](../src/features/realtime/).
- **Routes:** [`src/app/(web)/(main)/(dm)/`](<../src/app/(web)/(main)/(dm)/>).
- **Open questions:** **B111** (the list), **B112** (the room) and **B113** (sharing into a DM) in
  [`BACKEND_QUESTIONS.md`](BACKEND_QUESTIONS.md).
- **Harness:** `/dev/messages` (dev only, 404 in production).

---

## 1. Surfaces

| Surface | Where it is mounted | Notes |
| --- | --- | --- |
| Inbox `/messages` | `(dm)/messages/page.tsx` → `NoChatSelected` | The list itself is in the **layout** |
| Conversation `/@{slug}/messages` | `(dm)/[slug]/messages/page.tsx` → `<ChatRoom key={slug}>` | `parseChannelSlug`, or `notFound()` |
| Floating window | `(rail)/layout.tsx` → `ChatPopup` | Desktop (≥900px) and signed-in only |
| Share-into-DM block | `session-providers.tsx` → `ShareInMessageProvider` | Injected, not imported (§7) |
| Messaging settings | The gear on the inbox, if the reader has a space | `MessageSettingsDialog`, dynamically imported |

**Why `(dm)` is its own route group.** `MessagesShell` lives in `(dm)/layout.tsx` so that the
conversation list **survives navigation** between conversations. A layout is not remounted when its
child segment changes; a page is. The group also sits **outside `(rail)`**, because the two panes
are wide enough to collide with the desktop end rail.

**Both pages are `noindex`, not disallowed.** A conversation URL appears in people's bios
(`/@ada/messages` is legacy's URL, kept), so a crawler should be able to follow it and land on
something. It should not index an inbox.

**The conversation page is not a tab destination.** The composer sits exactly where the mobile tab
bar would. The 84px tab-bar reserve applies on `/messages` only.

**`key={slug.toLowerCase()}` on `ChatRoom` is load-bearing.** Moving to another conversation must
throw away the draft, the pending sends and the frozen unread divider (§5). A key change is the one
reset that cannot miss a piece of state.

### `MessagesShell`

Below `md` it shows one pane: the list at `/messages`, the room at `/@{slug}/messages`. From `md`
up it shows both. The **`min-h-0` chain** through the shell is what lets the list and the thread
each scroll inside their own pane. A missing link in that chain makes the page grow instead, and
nothing errors. The file's header lists the chain.

---

## 2. The API

Base `${W_API}/messenger`. Every call is account-scoped (`scoped()` in
[`api/message-api.ts`](../src/features/message/api/message-api.ts)).

| Call | Method + path | Body / params |
| --- | --- | --- |
| `getConversations` | GET `v2/rpc/get_recent_conversations` | `{ limit: 20, filter }`, or the cursor verbatim |
| `getUnreadCount` | the same, `{ limit: 1, filter: 'UNREAD' }` | reads `count` only |
| `search` | GET `v2/rpc/search_conversation` | `{ query }`, one page |
| `markSeenAll` | POST `v2/rpc/mark_seen_all/{id}/` | `{ last_message_id? }` |
| `openConversation` | POST `v2/rpc/start_conversation_with` | `{ member: ownerId }` |
| `getMessages` | GET `v2/rpc/get_messages` | `{ conversation_ids, limit: 20 }`, or the cursor |
| `getMessage` | GET `v2/rpc/get_message/{id}/` | — |
| `sendMessage` | POST `v2/rpc/send_message` | `{ conversation_id, input_text, msg_type, parser: 'PLAIN', reply_to_id?, number_of_media? }` |
| `uploadPhoto` | POST `v2/rpc/upload_images/{msgId}/{index}/` | multipart, field `image` |
| `setMuted` | POST `v2/rpc/update_conversation_config/{id}` | `{ muted }` (B112) |
| `editMessage` | POST `v2/rpc/edit_message/{id}` | `{ new_text }` |
| `deleteMessage` | POST `v2/rpc/delete_message/{id}` | `?both=` as a **query** parameter |
| `sendChatAction` | POST `v2/rpc/send_chat_action/{id}/` | `{ action }` |
| `setCallbackData` | POST `v2/rpc/set_message_callback_data/{id}` | `{ callback_data }` |
| `deleteConversation` | POST `v2/rpc/flush_conversation/{id}/` | `?both_members=false` |

Things that look odd and are deliberate:

- **No write is retried.** All of the writes are POSTs. A 502 can arrive *after* the write landed,
  and a replay would repeat a write whose outcome the screen has already shown. This is the general
  rule in `CLAUDE.md` (API layer), applied without exception here.
- **`openConversation` is a POST inside a query.** `start_conversation_with` both finds-or-creates
  the conversation and answers whether the reader may write. Legacy makes two calls (`can_start…`
  then `start…`); this makes one, and keys the query on follow and block state so that following
  or unblocking re-asks on its own (§2.1).
- **`uploadPhoto` sets `Content-Type: multipart/form-data` explicitly.** Without it the photo
  silently vanishes: the request succeeds and the server stores nothing.
- **Photo uploads use `messageApi.uploadPhoto`, not `shared/lib/api/upload-api.ts`.** The messenger
  upload is a two-step bound to a message id and an index, not a generic media upload.
- **A gate is mapped by its `code`, never by HTTP status** (`gateOf`). The same status carries
  different refusals.

### 2.1 Parsing — [`api/types.ts`](../src/features/message/api/types.ts)

Zod `looseObject`s with a `.catch` on every field. One malformed row must cost that row's badge,
not the inbox.

- **Timestamps** arrive as ISO strings, epoch seconds or epoch milliseconds. `epochMs` takes all
  three, splitting seconds from milliseconds at `1e11`.
- **A missing `recipient.active` means inactive.** Defaulting to active would show a composer that
  fails on Send.
- **The conversation filter** is `ALL | UNREAD`. `TEVI` exists on the wire and is not offered.
- **Chat actions** are `NONE | TYPING | UPLOADING_PHOTO`.
- **The gate table** is the *union* of the iOS and Android mappings:

  | Code | Wall |
  | --- | --- |
  | `C001` | follow |
  | `C002` | member |
  | `MSG001` | I blocked them |
  | `MSG002` | they blocked me |
  | `MSG003`, `MSG004` | inactive |
  | `MSG005` | unpublished |

  An **unknown code is an error, not a wall** (`types.test.ts`). A wall the client cannot explain
  is worse than a retry.

---

## 3. Server state — what is cached, and how

Every key carries `accountId ?? 'anon'` (`messageKeys`, `message-api.ts`):

```
['message', 'conversations', filter, account]
['message', 'unread-count', account]
['message', 'search', query, account]
['message', 'room', ownerId, followed, blocking, account]
['message', 'messages', conversationId, account]
```

- **The unread badge is its own request** (`limit=1&filter=UNREAD`, reading `count`). The badge is
  therefore right before the inbox is opened. Legacy's badge is blank until then. `null` means
  "unknown" and is never shown as 0. A failed count rejects rather than resolving 0.
- **The conversation list is cursor-paginated**, and deliberately not on
  `shared/lib/api/paged-list.ts`. The cursor is the query string of `next_url`, replayed against the
  same path (`lib/conversation-page.ts`), because the `next` URL may name an internal host
  (`page-cursor.ts` has the general argument). A `next_url` with no query is treated as the last
  page, because replaying it would loop forever. Rows are **deduplicated by id across pages**: a
  list re-read while a message lands can return a row that page 1 has already moved to the top.
- **Messages page backwards.** `pages[0]` is the newest. `flattenThread` sorts by `created_at`.
  `mergeNewest` folds a fresh first page *into* the data rather than replacing it, because replacing
  page 1 opens a gap between it and the older pages still held.
- **The room query is `refetchOnMount: 'always'`.** A reader coming back from the membership
  checkout must not meet the stale member wall they just paid to remove.
- **Nothing here is persisted.** No call sets `cache.persist`, `shared` or `keepFor`. Every body is
  in the ETag *memory* tier only. A DM is the clearest case of account-scoped content.
- **`forgetConversationCache(accountId)` runs before every list refetch** (live updates, mute,
  delete, send, share) and **must be awaited**. It drops the ETag validators for
  `get_recent_conversations`. Without it a 304 can replay the list as it was before the write: the
  validator is not guaranteed to move (the **B72** family). `get_messages` has no equivalent today.

---

## 4. Realtime

The user room (`${DOORMAN}/user`, `CLAUDE.md` → primitive 3) carries six direct-message frames.
It opens **only for a real account**: a guest never downloads socket.io and never holds a
connection.

**A frame is a signal, never a source.** Each handler either invalidates the query that owns the
data or fetches the one record the frame names. It never writes the frame's payload into the
cache. The one exception is a deletion, where there is nothing left to fetch.

| Frame | The list (`useConversationLive`) | The open room (`useThread`) |
| --- | --- | --- |
| `new_message` | coalesce 300ms → `forgetConversationCache` → invalidate | `get_message/{id}` → `upsertMessage`; if it is theirs, mark seen |
| `update_message` | same | `get_message/{id}` → upsert |
| `deleted_message` | same | `removeMessage(id)`, the one direct cache write |
| `seen_message` | same | `refreshNewest()`: re-read page 1, `mergeNewest`, for the ticks |
| `update_conversation` | same | — |
| `change_chat_action` | — | `useChatActions`: the payload into component state, 6s TTL |

- **`useConversationLive` is mounted only by `ConversationPane`.** A closed floating window
  therefore subscribes to nothing.
- **`upsertMessage` is idempotent by id.** The socket's copy of a message this client just sent and
  the send's own response collapse into one row, whichever lands first.
- **Typing has no ordering guarantee either.** A `TYPING` frame can arrive after the message it
  preceded, so `new_message` from that sender clears the indicator. Otherwise "typing…" would sit
  under a message that has already arrived.
- **Reconnect is a resync, not a replay.** On a down→up transition (`useSocketReconnect`, which
  deliberately does not fire on the first connect) the room re-reads its newest page and the list.
  `useComposer` resends anything that failed while offline (§5).
- **`inbox_change` is not a message frame.** It belongs to the notification inbox. Legacy re-emits it
  as `inboxChange`; the wire name is `inbox_change`.

`ConnectionBanner` shows an offline strip, or "Connecting…" after a 2s grace period. Neither state
blocks anything.

---

## 5. The conversation

### 5.1 The thread is drawn upside down — [`message-thread-view.tsx`](../src/features/message/components/message-thread-view.tsx)

The scroller is `flex-col-reverse`. That buys three things without a line of scroll arithmetic:

- the thread opens **at the bottom** with no `scrollTo`;
- a new message keeps a reader who is at the bottom pinned to it;
- prepending an older page does not move what is on screen.

`scrollTop` is therefore 0 at the bottom and **negative** going up, in every engine that ships
`flex-direction: column-reverse` scrolling. Read the header before adding arithmetic.

- **Paging.** The older page is requested within 200px of the top. A thread too short to scroll
  would never reach that point, so an effect keeps loading until it fills or runs out.
- **Render window.** `useRenderWindow(keys, { minimum: 20, overscan: 8 })`, the same hook as the
  feeds. A message off screen is stood down to an empty box of its measured height. This is why
  **jumping to a message goes through `windowKeySelector(id)`**: the box is always there even when
  the bubble is not.
- **Jump to a quoted message.** iOS's behaviour; legacy's quote is inert. The thread scrolls the
  quoted message to the centre and highlights it for 1.6s. If that message is not loaded, a toast
  says so (`message_reply_not_loaded`). It deliberately does **not** page back through history to
  find it.
- **Jump to latest** appears past 160px from the bottom. Its counter counts only **the other
  side's** arrivals. Legacy counted every frame, the reader's own sends and other conversations'
  messages included.
- **The unread divider** comes from `last_read_message_id` (iOS), falling back to the unread count.
  It is **frozen once, at open** (`chat-room.tsx`): marking the conversation seen must not move the
  line the reader is reading towards. The view scrolls to it once if it is above the fold, with
  `scroll-mt-10` so the sticky day chip does not cover it.
- **Days** are grouped by the reader's **local** day. Legacy grouped by UTC.
- **Ticks:** one tick means sent, two (`check-all`) mean seen, read from a non-empty `seen_by`.

### 5.2 Marking as read — `useThread`

- On open, if the conversation has unread messages: `mark_seen_all` **with `last_message_id`**. The
  id stops a message that lands during the request from being marked read unseen.
- Again for each of *their* messages as it arrives, **only while the tab is visible**. A hidden tab
  catches up on `visibilitychange`.
- Deduplicated per message id. A failed request resets the guard quietly, so the next arrival tries
  again.
- The list marks a row seen **optimistically** on press. That is the one optimistic write in the
  feature (§5.3 says why sends are not).

### 5.3 Sending — [`hooks/use-composer.ts`](../src/features/message/hooks/use-composer.ts)

**A send lives in component state, never in the query cache.** A `PendingMessage` has a `local-…`
id, a status of `sending` or `failed`, its files and `blob:` previews, and an `offline` flag. It
leaves `pending` when the server's copy is `put` into the thread. Legacy kept a `temp_` id keyed by a
computed date, so a send that crossed midnight stayed "processing" forever.

What happens when a send fails depends on why:

| Failure | What the reader sees | Retried? |
| --- | --- | --- |
| Network | one toast; the bubble is marked offline | **automatically**, in order, on socket reconnect or the `online` event |
| A gate code (§2.1) | the room swaps in the wall; no toast | no |
| Anything else | `apiErrorText ?? t('message_error_send')`; the bubble keeps Retry and Discard | only by the reader |

A refusal is never retried automatically: the server said no, and asking again changes nothing.

**Edit and delete are not optimistic.** An edit that failed silently would show the reader a
sentence their correspondent never received. Both wait for the server.

**Photos** are a two-step: `send_message` with `number_of_media`, then one `upload_images` per photo.

- Each upload is retried by hand, 3 attempts with 1s backoff. The index in the path doubles as the
  deduplication number (B112).
- **Once `send_message` has succeeded the message is never sent again**, whatever the uploads do.
  `use-composer.test.tsx` pins it ("never sends the message twice when a photo keeps failing").
- After the uploads the message is re-read with `get_message`. A partial failure says
  `message_error_photo_upload`.
- Limits ([`lib/photo-files.ts`](../src/features/message/lib/photo-files.ts)): at most 10;
  JPEG, PNG or WebP. HEIC is refused because only Safari can decode it, so the other side would
  receive a picture they cannot see. There is no size ceiling: anything over 2MB is re-encoded
  (long edge 1920, quality stepped down until it fits). `preparePhoto` never rejects.

**The typing signal.** `TYPING` is re-sent every 4s, inside the receiver's 6s TTL, so the indicator
does not flicker during a long sentence. `NONE` is sent when the field empties, on blur and on
unmount. `UPLOADING_PHOTO` is sent while the photo sheet is open and repeated during uploads.

**The length limit** is remote config: `useWebConfig().directMessage.limitCharacters`, default 1000.
It is **shown, never truncated**. The counter appears in the last 10%, and Send is disabled past
the limit. Legacy truncated with `maxLength`.

### 5.4 The composer — [`message-composer.tsx`](../src/features/message/components/message-composer.tsx)

- **Enter sends, Shift+Enter is a new line, and `isComposing` is checked.** Without that check, the
  Enter that confirms a Telex, Pinyin or Hangul composition sends half a word.
- Esc cancels a reply or an edit.
- The field grows with `[field-sizing:content]`, with a `useLayoutEffect` measurement for Safari,
  capped at 4 lines (96px). Its inset is a margin, not padding.
- **Pasting an image opens the photo sheet with it attached.** Legacy dropped a pasted image.
- Attach is hidden for a bot (`recipient.is_bot`) and while editing.
- The leading slot is `OpenMiniAppButton`.
- **Get started** sends `👋👋👋` (`WAVE`), legacy's greeting.

### 5.5 Who may write — the wall decision

`ChatRoom` decides **one** wall in a single priority chain, and the composer renders only when
there is none:

1. the recipient is inactive or suspended
2. the space is unpublished
3. a gate returned by a send (`writeGate`)
4. a gate returned by `start_conversation_with`
5. `recipient.blocking`
6. `me.blocking`
7. the thread is empty (`first`): the channel intro and Get started

Three checks run **before** the room is asked. If it is the reader's own space, a "this is you"
panel. If the space is NSFW, `NsfwGatePanel`. If the space is unpublished or suspended, no call to
`start_conversation_with` at all.

Legacy showed a composer to a deactivated recipient and let the send fail. Here that state is a
wall before anyone types.

The walls ([`chat-walls.tsx`](../src/features/message/components/chat-walls.tsx)):

- **follow:** the space's own Follow, or Request for a protected space.
- **member:** a link to `/@{slug}/membership`. Legacy ran a Stripe checkout inside the chat.
- **I blocked them:** Unblock (which invalidates `['message', 'room']`) and Delete.
- **They blocked me / inactive / unpublished:** no action. There is nothing the reader can do.

`ChatRoomMenu`: Space detail, Mute (not optimistic, with a toast), Block (confirmed, through
`useChannelActions`) or Unblock, and Delete conversation (waits for the server).

**Bot messages** may carry an `inline_menu`: `OPEN_URL`, `SET_TEXT_MESSAGE`, `CALLBACK_DATA` (whose
response replaces the menu row), and the `SHOW_*_TOAST` actions.

### 5.6 Rendering a message

- **`html_text` is never rendered as HTML.** `splitLinks` turns plain text into text and link parts,
  and never links a `javascript:` URL (pinned by `message-thread.test.ts`). The list preview strips
  markup with `htmlToPreviewText`.
- **A Tevi link navigates in-app** (`teviPath`), and a known kind (post, collection, event, short
  link, gift) renders as a card (`messageEmbed`, `message-embed.tsx`).
- **No preview for an external link, deliberately.** It would need a server-side fetcher, and a
  fetcher that takes URLs from message text is an SSRF surface.

---

## 6. The floating chat window — [`chat-popup.tsx`](../src/features/message/components/chat-popup.tsx)

- **Where it is mounted is the gate.** It is in `(rail)/layout.tsx`. Legacy hides it on the
  Messages screens and on the static pages, which are exactly the routes outside `(rail)`, so no
  pathname is inspected.
- It renders nothing below 900px (`CHAT_POPUP_QUERY`) or for a guest. `ChatPopupWindow` is
  **dynamically imported**, and the conversation list inside it mounts only after the first open. A
  closed bar costs no list query and no socket subscriptions.
- **Closing keeps the room mounted**, with its draft and any uploads in flight. It resets on an
  account switch.
- **Layering:** `z-30`, under the mini-app player (`z-40`) and every dialog (`z-50`).
- **State is Zustand** ([`store/chat-popup-store.ts`](../src/features/message/store/chat-popup-store.ts)):
  `hosted`, `expanded`, `slug`. The openers are spread across the app and the window is in one
  place, so a context would re-render every opener whenever the window changed.
- **`useOpenConversation` is the one door.** It requires auth, then opens the window when one is
  `hosted`, and otherwise navigates to `conversationPath(slug)`. Callers: `SendMessageButton` on a
  space (`channel-viewer-actions.tsx`) and the mini-app tab menu.
- A row in the window intercepts a plain click. ⌘-click and middle-click still open the route,
  because the row is a real link.

---

## 7. Sharing into a conversation — [`share-in-message.tsx`](../src/features/message/components/share-in-message.tsx)

**Injected, not imported.** `features/share` cannot import `features/message`: message → channel →
share would close a barrel cycle, and ESM resolves a cycle by handing one side a half-initialised
module. That is not a build error; it is an `undefined is not a function` at render time.
`session-providers.tsx` passes the component in through `ShareInMessageProvider`. A webview mounts
no session providers, so its share sheet has no conversation block.

- Renders nothing for a guest. Reuses the inbox's query keys, so an open inbox and the share sheet
  share one list.
- Lists only conversations that can receive a send, dropping inactive and blocked ones. It
  **never** calls `start_conversation_with`, so sharing never creates a conversation.
- `useShareInMessage` resolves the link **once**, then sends one POST per conversation with
  `Promise.allSettled`. Any success closes the sheet. A total failure keeps the failed recipients
  selected and the typed text in the field.
- **The account that pressed Send is pinned.** Switching accounts mid-flight does not move the
  remaining sends to the new account.
- The body is `text + "\n" + link`. The three shipped clients each send something different, and
  this is the choice recorded in **B113**.

---

## 8. Messaging settings

The gear on the inbox (only when the reader has a space) opens `MessageSettingsDialog`:

- **who may message me** is a radio choice between followers and subscribers. *Members* appears
  only when the space offers a membership, or when it is already the saved value. Legacy used two
  switches.
- It is saved on Save, through `useMessagingSettings` in `features/channel` (`PATCH my-channel/`
  `messaging_settings`). The setting belongs to the space, not to the inbox.
- The dialog also carries the space's message link with Copy and Share. **Opening Share closes the
  dialog first**, so two modals never stack.

---

## 9. Auth

- Every query is `enabled: isAuthenticated`. The pane and the room show a signed-out state whose
  button *is* `requireAuth`. The route is open; the action is gated (`CLAUDE.md`, "gate the action,
  never the route").
- `useOpenConversation` and `SendMessageButton` require auth.
- The floating window and the share block render nothing for a guest, and the socket never opens.
- There are **no paid or Star-priced messages** and **no message requests**. The only membership
  rule is the member wall (`C002`).

---

## 10. Deliberate divergences from legacy

Each is argued at its call site.

- Lists are queries invalidated by the socket, not arrays spliced from frames.
- One `start_conversation_with` instead of `can_start…` + `start…`.
- `html_text` is never set as `innerHTML`.
- Tevi links navigate in-app; known kinds render as cards.
- Enter checks `isComposing`; the length limit is shown, not truncated; pasting an image attaches it.
- Days by local time; mark-seen only while visible; the jump counter counts only their messages.
- Back is a link to `/messages`, not `history.back()`.
- The header identity is a link, not a clickable div. Hover actions are reachable by keyboard. Edit
  has an entry point.
- Messaging settings is a radio group, not two switches.
- Search keeps the previous results while the next query runs.
- A failed list is an error state with Retry, not "Welcome" and a toast.
- Relative times are localised. Legacy's `dm_w2_ss_ago` says "seconds" where it means minutes.
- The member wall links to the membership page instead of running a checkout in the chat.

---

## 11. Not built, and known issues

**Not built** (`index.ts`):

- External link previews (§5.6, deliberately).
- The `is_my_subscriber` member badge on a conversation row.
- The row menu's Block, Clear, Mute, Pin and Report. The room menu has Mute and Block.

**Known issues**, found while writing this document and not yet fixed:

- **A list refresh reaches the open room.** `useConversationLive` invalidates `messageKeys.all`,
  which is `['message']`. That includes the active `room` query, which re-POSTs
  `start_conversation_with`, and the open thread's infinite query, which refetches **every** loaded
  page. On desktop the pane and the room are mounted together, so this happens on each 300ms burst
  of frames. It also bypasses `useThread`'s per-message design. The fix is to invalidate
  `['message', 'conversations']` and `['message', 'unread-count']` only.
- **No version check on upsert.** A slow `get_message` response for `new_message` or
  `update_message` can put back a message that `deleted_message` has already removed. Two edit
  responses that arrive out of order can leave the older text.
- **`get_messages` has no ETag forget**, so `refreshNewest` relies on the server's validator moving
  (the B72 risk, unmitigated for messages).
- **Stale comments:**
  - `index.ts` and `message-bubble.tsx` say collection and event cards are not built. They are,
    with tests (`message-link.ts`, `message-embed.tsx`).
  - `shared/lib/socket/user-room.ts` says `useConversationLive` subscribes to all six frames. It
    subscribes to five; `change_chat_action` is in `useChatActions`.
  - `features/realtime/index.ts` describes the room as "balance and Premium state" and says the
    connection status is not exported. `useUserRoomStatus` is exported and drives
    `ConnectionBanner`.
  - `chat-popup-store.ts` says `ChatPopup` sets `hosted`. `ChatPopupWindow` does.

---

## 12. Tests that pin the rules

| File | Pins |
| --- | --- |
| `api/types.test.ts` | parse tolerance, `active` defaulting to inactive, chat actions, the gate map, unknown code → error |
| `lib/message-thread.test.ts` | sort and dedup, idempotent upsert, `mergeNewest` leaves no gap, `isOwnMessage`, local-day grouping, `splitLinks` never links `javascript:`, `firstUnreadId` |
| `lib/conversation-page.test.ts` | cursor replay; remove and mark-seen return the same object when nothing changed |
| `lib/conversation-view.test.ts` | inactive hidden, the online window, ms vs seconds, alias, HTML stripping |
| `lib/message-link.test.ts` | in-app paths; post, event, collection and short-link embeds; gifts in both spellings |
| `lib/photo-files.test.ts`, `lib/photo-layout.test.ts`, `lib/conversation-time.test.ts`, `routes.test.ts` | limits and compression, the 1–10 photo grids, localised minutes, the URL helpers |
| `hooks/use-composer.test.tsx` | pending → server handoff, Retry, reply, limit, edit and delete wait, typing burst, gate → wall, photos never double-send, offline auto-resend |
| `hooks/use-chat-actions.test.tsx` | TTL, restart on a repeat, `new_message` clears |
| `hooks/use-share-in-message.test.tsx` | one link for all, failed recipients kept, partial close, account pinned |
| `hooks/use-open-conversation.test.tsx`, `hooks/use-room-mute.test.tsx` | the door; mute is not optimistic |
| `shared/lib/socket/user-room.test.ts`, `user-room-client.test.ts` | subscriptions survive a disconnect, account pinning, lazy token, auth error is terminal, exhausted retries torn down, a disconnect mid-import cancels |
| `features/realtime/providers/realtime-provider.test.tsx`, `hooks/use-socket-reconnect.test.tsx` | no socket for a guest or an anonymous session, re-pin on switch, wake retry, refresh once; reconnect fires only on down→up |

---

## 13. Working on it

- **`/dev/messages`** previews every state that does not need a server: rows, header presence,
  the connection strips, the settings dialog, the thread at 390 and 640 with every bubble and card
  kind, the walls, pending sends and the floating window. Fixtures are in
  [`dev.ts`](../src/features/message/dev.ts) and go through the real parser. `MessagesShell` and
  `ChatRoom` are not previewed because they own queries.
- **Adding a field:** add it to the schema with a `.catch`, then add a line to B111 or B112 saying
  what the client now assumes.
- **Adding a socket handler:** fetch or invalidate; never write the frame's payload into the cache
  (§4).
- **Adding a write:** no `{ retry: true }` unless the backend deduplicates it, which none of these
  endpoints is known to do. If it changes the list, `await forgetConversationCache` before the
  refetch.
