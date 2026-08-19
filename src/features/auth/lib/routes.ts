/**
 * Routes this feature owns that **another** feature has to link to — the same reasoning
 * `features/channel/lib/routes.ts` states at length: the account drawer
 * (`features/navigation`) links to a page this feature owns, and a literal at the call site
 * keeps type-checking and keeps rendering after the page moves. It just 404s, which is the
 * failure mode that reaches production.
 *
 * There is a second reader here beyond the link itself: the drawer marks the row of the
 * screen that *contains* the current page (`lib/menu-active.ts`), so this path is named in
 * two places and a duplicated literal would let the two drift apart silently — the row
 * would keep navigating and quietly stop lighting up.
 */

/**
 * Legacy's URL, unchanged — `pages/settings/password` in the old app. Kept verbatim because
 * links to it exist outside this repo and the cutover is same-origin.
 */
export const PASSWORD_SETTINGS_PATH = '/settings/password'
