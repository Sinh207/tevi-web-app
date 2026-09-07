/**
 * The **skeleton door** — what a route's `loading.tsx` may import from this feature, and nothing
 * else.
 *
 * ⚠ Import from `@features/channel/skeleton`, never from `@features/channel`. Through the barrel a
 * loading boundary becomes its own client entry chunk and this app's strict CSP refuses to load it:
 * the skeleton then never paints, with a console line as the only symptom. `features/star-transfer`
 * and `features/analytics` carry the same door for the same reason — read either of their notes for
 * the post-mortem.
 *
 * So: no hooks, no providers, no components that reach back into the feature. What is here renders
 * on the server, out of tokens and `Skeleton`.
 */
export { McnInvitationSkeleton } from './components/mcn-invitation-skeleton'
export { McnPartnershipSkeleton } from './components/mcn-partnership-skeleton'
/**
 * `/mcn-user-invitation/verify`'s skeleton — the **manager** invitation's, and not a variant of the
 * creator's: its two buttons sit side by side and it has no hero band, so a shared component would
 * have to switch on which screen is asking, which is the shift both files exist to avoid.
 */
export { McnUserInvitationSkeleton } from './components/mcn-user-invitation-skeleton'
/**
 * `/invitation/verify`'s three layout constants, and it needs all three where
 * `/mcn-partnership` needs one.
 *
 * That screen's skeleton draws cards on the page colour, so its `loading.tsx` takes the column and
 * nothing else. This one is a **single panel** at every state (`docs/DESIGN_SYSTEM.md` §6), so its
 * `loading.tsx` has to paint the same surface and the same card the view does — otherwise the plane
 * changes colour the moment the view hydrates, which is the visible half of getting §6 wrong.
 */
export {
    MCN_INVITATION_CONTAINER,
    MCN_INVITATION_PANEL,
    MCN_INVITATION_SCREEN,
    MCN_PARTNERSHIP_CONTAINER,
} from './lib/container'
