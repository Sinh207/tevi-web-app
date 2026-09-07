/**
 * `/my-star`'s layout constant, for the route's `loading.tsx` — a second entry point, kept small.
 *
 * Same reason as `features/my-wallet/skeleton.ts` and `features/payout/skeleton.ts`: a `loading.tsx`
 * that reaches the main barrel for one class string pulls the feature's views, hooks and queries into
 * the loading boundary behind it, because a barrel is one module and its re-exports are not
 * tree-shaken before the graph is built.
 *
 * ⚠ Keep this shallow — nothing here may reach a hook, a query or another feature.
 */

export { MY_STAR_CONTAINER } from './lib/container'
