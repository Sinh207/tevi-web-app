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
