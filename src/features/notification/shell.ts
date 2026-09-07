/**
 * What the **app shell** needs from this feature, and nothing else.
 *
 * `features/navigation` renders a bell in two places — the desktop rail and the mobile top bar —
 * and both are mounted on every page in the app. They need exactly two things from here: where the
 * bell points, and whether to draw the unread dot.
 *
 * ## Why they must not import the barrel
 *
 * Two reasons, and the first is measurable. `index.ts` exports `NotificationView`, which imports
 * `@features/channel` (for `ChannelEmptyState`) and `GetAppDialog` (which pulls remote config and
 * the QR helper). Importing the barrel from the navbar would put the whole inbox screen, the whole
 * channel barrel and Firebase Remote Config into the bundle of **every page on the site**, to draw
 * an 8px dot.
 *
 * The second is the module cycle. `features/navigation` imports this feature and this feature's
 * screen imports `features/channel`, which `features/navigation` also imports — the graph is
 * acyclic today only because nothing here reaches back into navigation. Keeping the shell's entry
 * point a leaf that imports no feature barrel is what makes that easy to keep true.
 *
 * `features/my-wallet` documents the same constraint and answers it the same way (`./routes`, "this
 * file must never become the drawer's dependency"); `features/my-star` and `features/search` are
 * imported through leaf modules for the same reason.
 */

export { useUnreadInbox } from './hooks/use-unread-inbox'
export { NOTIFICATION_PATH } from './lib/routes'
