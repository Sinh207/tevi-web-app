/**
 * Routes this feature owns that **another** feature has to link to.
 *
 * Only paths crossing a feature boundary belong here. `toChannelPath()` builds `/@{slug}` and
 * stays in `channel-slug.ts` with the parsing it is the inverse of; this file is for the flat,
 * argument-less ones a link somewhere else needs to name.
 *
 * The reason it is a module and not a string literal at the call site: the account drawer
 * (`features/navigation`) links to a page `features/channel` owns, so the two features have to
 * agree on a URL that neither of them alone decides. A literal in the drawer keeps type-checking
 * and keeps rendering after this page is moved or renamed — it just 404s, which is the failure
 * mode that reaches production.
 */

/**
 * Legacy's URL, unchanged — `pages/settings/space-visibility` in the old app.
 *
 * Kept verbatim because links to it exist outside this repo (the mobile app's menu, support
 * articles, bookmarks) and the cutover is same-origin, so they all resolve straight here.
 */
export const SPACE_VISIBILITY_PATH = '/settings/space-visibility'

/**
 * Legacy's URL, unchanged — `pages/settings/blocked-accounts` in the old app. Same reasoning
 * as above: the account drawer links here, and the links that exist outside this repo resolve
 * straight through on a same-origin cutover.
 */
export const BLOCKED_ACCOUNTS_PATH = '/settings/blocked-accounts'

/**
 * The follow-requests queue — legacy's `pages/follow-requests`, unchanged and **top-level**, not
 * under `/settings`.
 *
 * It reads like a settings screen and is not one: it is a queue of pending decisions, the mobile
 * apps deep-link to it, and it is linked from the drawer's CREATORS section rather than from
 * Account settings. Moving it under `/settings` would be a rename with nothing to gain and every
 * existing link to lose, since the cutover is same-origin and all of them resolve straight here.
 */
export const FOLLOW_REQUESTS_PATH = '/follow-requests'

/**
 * Edit your own space — and the one path here that is **new**, not legacy's.
 *
 * Legacy has no URL for this screen at all: it is a drawer over the channel page, opened from a
 * button and closed with `handleClose('customProfile')`. So there is nothing in the wild pointing
 * at an old address, nothing to preserve, and no redirect to write in `proxy.ts` — which makes
 * this the one settings screen free to take the name that fits the family it belongs to.
 *
 * It keeps legacy's *word* ("custom profile") rather than being renamed to `/settings/profile`,
 * because that is what the button says in nine languages and what the mobile app calls it.
 */
export const CUSTOM_PROFILE_PATH = '/settings/custom-profile'

/**
 * The follow list — legacy's `pages/following`, unchanged.
 *
 * Here rather than only in the route file because **two features have to agree on it**: this one
 * owns the page, and `features/navigation` points both the mobile tab bar and the desktop rail at
 * it. A literal in the chrome keeps type-checking and keeps rendering after the page moves — it
 * just 404s, which is the failure mode that reaches production.
 *
 * `TAB_PATHS` in `features/navigation` is the *other* half of the wiring and cannot import this
 * (a feature may not reach into another feature's internals), so it carries the same string. That
 * duplication is the boundary rule's price; the barrel export is what makes at least the links
 * single-sourced.
 */
export const FOLLOWING_PATH = '/following'

/**
 * The support space's message thread — where the verified badge's **Learn more** sends a reader.
 *
 * ## It 404s today, and that is the decision rather than an oversight
 *
 * The screen is not built. This file's own docstring argues *against* naming a route that does not
 * resolve, and `features/premium/routes.ts` refuses to export `/gift-premium` for exactly that
 * reason — so this is the deliberate exception: the product answer to "what does the blue tick
 * mean?" is a conversation with support, not a KYC form, and the link was specified pointing here
 * with the page to follow. It briefly pointed at `/identification`, which is the nearest page that
 * *does* exist and the wrong one: that is where you go to *get* verified, not to ask what somebody
 * else's tick means.
 *
 * `@support` is a **channel slug**, so this lives in the `/@*` namespace this feature owns — which
 * is also why it is a constant here rather than a literal at the call site: when the thread screen
 * lands and its URL settles, one file changes.
 */
export const SUPPORT_MESSAGES_PATH = '/@support/messages'

/**
 * The MCN partnership screen — legacy's `pages/mcn-partnership`, unchanged.
 *
 * Kept verbatim for the reason this file's other paths are: links to it exist outside this repo
 * (the account drawer in the mobile apps, support articles), the cutover is same-origin, and they
 * all resolve straight through.
 *
 * Here rather than in the drawer as a literal because **two features have to agree on it**: this
 * one owns the page, `features/navigation` lists the row that points at it, and a literal in the
 * drawer keeps type-checking and keeps rendering after the page moves — it just 404s.
 */
export const MCN_PARTNERSHIP_PATH = '/mcn-partnership'
