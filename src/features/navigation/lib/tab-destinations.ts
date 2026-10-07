import { MESSAGES_PATH } from '@features/message/routes'

/**
 * Which routes the mobile tab bar belongs to.
 *
 * ## Why this is not a route group
 *
 * Every other piece of chrome in this app is decided by the group a route joins — the
 * global mobile top bar is in `(tabs)/layout.tsx` and nothing inspects the pathname
 * (`app/(web)/(main)/layout.tsx` says so, at length). That works because "does this screen get a
 * top bar" is a question about the *route*.
 *
 * The tab bar has one destination where it is not: **My Space**. The tab points at
 * `/my-space`, which is a redirect, and where it lands is `/@{slug}` — the same route that
 * serves everybody else's channel. So "is this a tab destination" is a question about
 * *data*: whether the slug in the URL is this account's. No arrangement of directories can
 * express that, because both answers share one directory.
 *
 * Hence a rule, in one place, as a pure function — so the thing a route group would have
 * given us for free (a single, stated, testable answer) is at least still all three.
 *
 * ## Why the answer is a path, not an ownership flag
 *
 * `features/channel` has `useChannelOwnership`, which is the honest way to ask "is this
 * mine" *on the channel page*. It is not what this uses: the caller compares against
 * `myChannel`, which `MyChannelProvider` holds for the whole app and which is therefore
 * already in memory on every route. Reaching for the ownership hook here would mean the
 * tab bar waiting on the fetch for the channel currently being *viewed* before it could
 * decide whether to draw itself.
 */

/**
 * The tab destinations that are plain URLs.
 *
 * `/messages` comes from `features/message/routes`, the feature's import-free leaf, so the shell does
 * not pull the conversation list in to learn one string. A conversation (`/@{slug}/messages`) is
 * deliberately **not** a tab destination: it is a screen with its own composer along the bottom,
 * where the bar would sit — the way the apps drop it inside a chat.
 *
 * `/following` is a literal rather than `features/channel`'s `FOLLOWING_PATH`, which is the same
 * string: a feature may not import another feature's internals, and the barrel that exports it is
 * `features/channel`'s. `FOLLOWING_PATH`'s own note records the other side of this.
 */
export const TAB_PATHS: readonly string[] = ['/', '/following', MESSAGES_PATH, '/my-space']

/**
 * Whether the tab bar belongs on this screen.
 *
 * `ownChannelPath` is `/@{slug}` for the signed-in account, or `null` when there is no
 * account, no channel, or the answer has not arrived yet. **`null` means "no"** — a bar that
 * appears a beat late on your own channel is a smaller wrong than one that shows on a
 * stranger's and then vanishes, and "not yet known" is by far the more common state on the
 * channel route, which most visitors reach for someone else's space.
 *
 * The comparison is case-insensitive even though `canonicalChannelRedirect` should have
 * already sent `/@ADA` to `/@ada`: it costs nothing, and the failure it prevents is the bar
 * silently missing on your own channel for one spelling of your own handle.
 */
export function isTabDestination(pathname: string, ownChannelPath: string | null): boolean {
    if (TAB_PATHS.includes(pathname)) return true
    if (!ownChannelPath) return false
    return pathname.toLowerCase() === ownChannelPath.toLowerCase()
}

/**
 * Whether the **My Space** entry is the current one — on `/my-space`, or anywhere inside the reader's
 * **own** space (`/@me`, `/@me/post/…`), and nowhere else.
 *
 * Both navigation bars used to light it on `pathname.startsWith('/@')`, i.e. on **every** space —
 * open somebody else's and your own tab claimed you were home. The rule their comments stated was
 * always "your own channel"; this is that rule, compared the way `isTabDestination` compares (case
 * folded — a slug typed with capitals is the same space). With no own space yet (`null`, or still
 * loading) only `/my-space` counts.
 */
export function isOwnSpacePath(pathname: string, ownChannelPath: string | null): boolean {
    if (pathname === '/my-space') return true
    if (!ownChannelPath) return false
    const path = pathname.toLowerCase()
    const own = ownChannelPath.toLowerCase()
    return path === own || path.startsWith(`${own}/`)
}
