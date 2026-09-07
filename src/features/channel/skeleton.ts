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
export { McnPartnershipSkeleton } from './components/mcn-partnership-skeleton'
export { MCN_PARTNERSHIP_CONTAINER } from './lib/container'
