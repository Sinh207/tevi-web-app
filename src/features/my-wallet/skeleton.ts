/**
 * The wallet screens' **layout constants**, for the route tree's `loading.tsx` files — a second entry
 * point, kept deliberately small.
 *
 * ## Why not just import from `./index`
 *
 * A `loading.tsx` is a *server* module in the route tree, and importing a layout string through the
 * main barrel pulls the whole feature in behind it: the views, their queries, `@features/auth`,
 * `@features/balance`, `@features/payout/routes`, TanStack Query. A barrel is one module, so those
 * re-exports are not tree-shaken away before the graph is built. Three loading boundaries were paying
 * for a feature to hand them two class strings.
 *
 * `features/payout/skeleton.ts` and `features/analytics/skeleton.ts` are the same file for the same
 * reason.
 *
 * ⚠ Keep this list shallow. Anything added here that reaches a hook, a query or another feature puts
 * the whole graph back into every loading chunk.
 */

export { MY_WALLET_CONTAINER, MY_WALLET_PANEL, MY_WALLET_SCREEN } from './lib/container'
