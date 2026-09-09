/**
 * `/monetization`'s address, and nothing else.
 *
 * Import-free for the reason `features/analytics/routes.ts` and `features/my-wallet/routes.ts` both
 * give at length: `features/navigation`'s `menu-rows.ts` links here — the account drawer's CREATORS
 * row — and routing that through this feature's `index.ts` would close a cycle between two barrels,
 * which ESM resolves by handing one side a half-initialised module. Not a build error; an
 * `undefined is not a function` at render time.
 *
 * ## Legacy's address, unchanged
 *
 * `pages/monetization/index.js`. The cutover is same-origin and the mobile apps link to the hub, so
 * the path is a contract rather than a choice — keeping it means `proxy.ts` needs no redirect.
 *
 * **A method screen's constant lands with its screen, never before it.** A route constant is an
 * invitation to link at it, and `ActionRows` treats a row with an `href` as a real destination — so
 * declaring the four up front would turn the hub's list into four links to 404s, which
 * `shared/components/action-rows.tsx` documents as the worse of the two states. Membership
 * and donation have landed; pay-per-post and interaction have not, and their rows stay inert until
 * they do.
 */

/** `/monetization` — the creator's monetization hub. */
export const MONETIZATION_PATH = '/monetization'

/**
 * `/monetization/membership` — the creator's tier and its members.
 *
 * Legacy's address (`pages/monetization/membership`), unchanged. It is **one URL with two screens**
 * — the overview and the create/edit form — which is legacy's design: it holds a `view` state and
 * swaps the page under one address rather than routing. Kept, so the back button walks the states
 * (see `MembershipDashboard`), and so a bookmark lands where it always did.
 */
export const MONETIZATION_MEMBERSHIP_PATH = '/monetization/membership'

/**
 * `/monetization/donation` — the creator's donation offer and the people who have paid it.
 *
 * Legacy's address (`pages/monetization/donation`), unchanged. Like membership it is **one URL with
 * two screens** — the overview and the setting form — which is legacy's design: it holds a `view`
 * state and swaps the page under one address rather than routing. Kept, so the back button walks the
 * states (see `DonationDashboard`), and so a bookmark lands where it always did.
 */
export const MONETIZATION_DONATION_PATH = '/monetization/donation'
