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

/**
 * `/settings/two-step-verification` — turning the account passcode on, changing it, turning it off.
 *
 * **Not a legacy URL.** Legacy's web app has no such page: the eight endpoints exist in its
 * `models/twoFa.js`, the copy exists in all nine of its locale files, and only the *mobile* apps
 * ever built the screen. So there is nothing to keep verbatim here, and the address is chosen to sit
 * beside the two settings pages that do carry legacy's own names (`/settings/password`,
 * `/settings/space-visibility`) and to say what the drawer row says.
 *
 * Read in two places, which is why it is a constant and not a literal: the account drawer links to
 * it, and the drawer also marks the row of the screen containing the current page
 * (`features/navigation/lib/menu-active.ts`). A duplicated literal would let the two drift — the row
 * would keep navigating and quietly stop lighting up.
 */
export const TWO_FA_SETTINGS_PATH = '/settings/two-step-verification'
