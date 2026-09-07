/**
 * Routes this feature owns that **another** feature has to link to.
 *
 * The reason it is a module and not a string literal at the call site: the left rail and the
 * mobile top bar (`features/navigation`) both point at a page `features/search` owns, so two
 * features have to agree on a URL that neither of them alone decides. A literal in the rail keeps
 * type-checking and keeps rendering after this page is moved or renamed — it just 404s, which is
 * the failure mode that reaches production. Same pattern, and the same reasoning, as
 * `features/channel/lib/routes.ts`.
 */

/**
 * Legacy's URL, unchanged — `pages/search` in the old app.
 *
 * Kept verbatim because links to it exist outside this repo (the mobile apps deep-link to it,
 * support articles, bookmarks) and the cutover is same-origin, so all of them resolve straight
 * here. There is no `proxy.ts` redirect to write for the same reason.
 */
export const SEARCH_PATH = '/search'
