/**
 * The space-tier feature — a creator chooses what fans pay, in Star, per interaction.
 *
 * One screen, `/space-tier`, reached from the CREATORS section of the account drawer. Legacy shows
 * the same content in a modal (`components/spaceTier`); see `routes.ts` for why it is a page here.
 *
 * Deliberately **not** exported: `spaceTierApi`, its keys and parsers, `useSpaceTier` and the parts
 * `SpaceTierView` composes. A page mounts the view; a component calling the model directly is what
 * `CLAUDE.md`'s "never call axios from components" forbids, and exporting it is the invitation.
 */

export { SpaceTierView } from './components/space-tier-view'
export { SPACE_TIER_CONTAINER } from './lib/container'
export { SPACE_TIER_PATH } from './routes'
