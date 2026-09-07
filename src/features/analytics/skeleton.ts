/**
 * The dashboard's **loading shapes**, and the column they sit in — a second entry point, kept
 * deliberately small.
 *
 * ## Why this is not just an import from `./index`
 *
 * `loading.tsx` is a *server* module in the route tree. Importing `AnalyticsSkeleton` through the main
 * barrel pulls the whole feature in behind it — the view, its four queries, `@features/auth`,
 * `@features/channel`, TanStack Query — because a barrel is one module and re-exports are not
 * tree-shaken away before the client graph is built.
 *
 * That is not only wasteful, it **broke the page in dev**: the loading boundary ended up as its own
 * client entry chunk, which the router injects in a way the app's strict CSP refuses —
 * *"Loading the script '…dashboard-analytics_loading_tsx_….js' violates the following Content Security
 * Policy directive"* (`shared/config/csp.ts` is nonce + `'strict-dynamic'`). The skeleton then never
 * painted. Swapping this import for the barrel one reproduces it; it was found in the browser, not by
 * reading, which is the only way a console-only failure on a *loading state* ever surfaces.
 *
 * `/my-star`'s `loading.tsx` avoids the same trap by accident — it takes only a string constant from
 * its feature and builds its skeleton from `shared/` parts. This is that property made deliberate.
 *
 * Same shape, and the same reasoning, as `features/channel`'s `index.ts` / `server.ts` split and
 * `./routes.ts`: when a consumer needs one small thing, give it a smaller door.
 */

export {
    AnalyticsSkeleton,
    MetricPanelSkeleton,
    TopEarningSkeleton,
} from './components/analytics-skeleton'
export { ANALYTICS_CONTAINER } from './lib/container'
