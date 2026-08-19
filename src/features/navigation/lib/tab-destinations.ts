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
 * Following and Messages are absent because their routes do not exist yet — `AppTabBar`
 * renders them as gated no-ops. Each becomes a line here on the day it gets an `href`, and
 * the bar will follow it without anything else changing.
 */
export const TAB_PATHS: readonly string[] = ['/', '/my-space']

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
