/**
 * `/space-tier`'s address, and nothing else.
 *
 * Import-free for the reason every other `routes.ts` gives: `features/navigation`'s `menu-rows.ts`
 * links here — the account drawer's CREATORS row — and routing that through this feature's
 * `index.ts` would close a cycle between two barrels.
 *
 * ## A page where legacy has a modal
 *
 * Legacy has no URL for this screen: `BtnSpaceTier` in the account drawer opens `SpaceTierModal` (a
 * `ResponsiveModal`, bottom sheet on a phone) over whatever was underneath. Here it is a route, by
 * product decision — the screen is a tier carousel, an estimate, a six-question FAQ and a sticky
 * action, which is a page's worth of content, and a route can be linked to, reloaded and returned
 * to with the back button. The confirmation and the success step stay dialogs: they are steps
 * *over* this screen, not places.
 */

/** `/space-tier` — the creator chooses what fans pay per interaction. */
export const SPACE_TIER_PATH = '/space-tier'

/**
 * The FAQ's *Learn more* — legacy's own target (`router.push('/@space-tiers')`): Tevi's explainer
 * lives in a Space, not on a static page.
 */
export const SPACE_TIER_LEARN_MORE_PATH = '/@space-tiers'
