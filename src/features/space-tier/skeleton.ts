/**
 * What `/space-tier`'s `loading.tsx` needs, and nothing that would drag the feature's component
 * tree into the loading chunk — routed through `index.ts` the boundary becomes a client entry chunk
 * the CSP refuses, and the skeleton silently never paints (`features/star-transfer/skeleton.ts`).
 */

export { SpaceTierSkeleton } from './components/space-tier-skeleton'
export { SPACE_TIER_CONTAINER } from './lib/container'
