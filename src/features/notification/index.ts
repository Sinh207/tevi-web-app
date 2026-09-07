/**
 * The notification inbox — `/notification`, plus the unread signal the app shell's bell reads.
 *
 * ```
 * NotificationView          the screen: the paginated list and its five states
 * NotificationBarActions    the page bar's overflow menu (mark all as read · filter)
 * ./shell                   useUnreadInbox() + NOTIFICATION_PATH — the app shell's bell
 * ```
 *
 * ## This feature must never import `features/navigation`
 *
 * `features/navigation` imports this feature — the bell needs `useUnreadInbox` and both shells link
 * to `NOTIFICATION_PATH` — through [`./shell`](./shell.ts). Importing navigation back from anywhere
 * in here would close an ESM cycle, which resolves by handing one side a half-initialised module:
 * an `undefined is not a function` at render time rather than a build error.
 *
 * The one thing this screen wanted from there is `PageBackBar`, and the answer is that the **page**
 * composes it and passes `NotificationBarActions` into its `actions` slot. `features/my-wallet`
 * documents the same constraint from the other side (its address lives in a `routes` module that
 * imports nothing); `features/channel` answered it by composing its own bar. Either is fine; what
 * is not fine is an import from this side.
 *
 * It does import `features/channel` (for `ChannelEmptyState`) and `features/auth` and
 * `features/realtime`, all through their barrels, and none of those imports this one.
 *
 * ## The socket event this feature owns
 *
 * `inbox_change` was declared-but-unforwarded in `shared/lib/socket/user-room.ts` until this feature
 * landed — the note there explains why an event with no consumer is worse than a missing one. This
 * is the consumer, and it reads **none** of the payload: the frame says "something changed" and
 * `useUnreadInbox` invalidates the query that owns the number. CLAUDE.md's third primitive, used the
 * way it is meant to be.
 */

/**
 * ## The app shell imports [`./shell`](./shell.ts), never this file
 *
 * The bell is on every page, and this barrel reaches `NotificationView` → `@features/channel` →
 * … and `GetAppDialog` → Firebase Remote Config. Pulling that into every route's bundle to draw an
 * 8px dot is the regression `./shell` exists to prevent; it is a leaf that imports no feature
 * barrel. Same reasoning, and the same shape, as `features/my-wallet`'s `./routes`.
 */

export { notificationKeys } from './api/notification-api'
export { NotificationBarActions } from './components/notification-bar-actions'
/**
 * Exported for `/dev/notification`, for the reason `features/earnings` exports `EarningsDayRow`:
 * the real screen is unreachable without a signed-in account that has actually received something,
 * so without a preview a design pass on it means faking an API response. Pure props.
 */
export { NotificationRow } from './components/notification-row'
export { NotificationSkeleton } from './components/notification-skeleton'
export { NotificationView } from './components/notification-view'
export { useUnreadInbox } from './hooks/use-unread-inbox'
export { NOTIFICATION_CONTAINER } from './lib/container'
/** Exported for `/dev/notification`, so the preview draws the same artwork the screen does. */
export { NOTIFICATION_ART } from './lib/illustrations'
export { type InboxTarget, resolveInboxTarget } from './lib/inbox-link'
export { NOTIFICATION_PATH } from './lib/routes'

/**
 * Deliberately **not** exported: `notificationApi`, `useInbox`, `useInboxTypes`,
 * `useMarkInboxRead`, `formatInboxTime`, and everything in `lib/inbox-page.ts`.
 *
 * A component calling the model directly is what CLAUDE.md's "never call axios from components"
 * forbids, and exporting it is the invitation. The three hooks are withheld for a sharper reason:
 * each of them writes to the inbox cache, and a second screen mounting one would be a second
 * owner of this list's state — `useInbox` in particular holds the removal timers, and two copies
 * of those would fight over the same rows.
 *
 * `InboxMessage` is exported only as far as `NotificationRow`'s props require, which is why the
 * type is reachable through the component and not on its own line: a caller that needs to *read* a
 * notification is a caller that should be asking this feature to render it.
 */
