/**
 * `/search`'s **shell constants**, for the route's `loading.tsx` — a second entry point, kept
 * deliberately small.
 *
 * ## Why this is not just an import from `./index`
 *
 * `loading.tsx` is a *server* module in the route tree. Importing through the main barrel pulls the
 * whole feature in behind it — both views, the search model, TanStack Query, `@features/auth`,
 * `@features/channel` — because a barrel is one module and re-exports are not tree-shaken away
 * before the client graph is built.
 *
 * That is not only wasteful, it **breaks the page**: the loading boundary becomes its own client
 * entry chunk, which the router injects in a way this app's strict CSP refuses (nonce +
 * `'strict-dynamic'`, `shared/config/csp.ts`), and the skeleton then silently never paints. It is a
 * console-only failure on a *loading state*, which is the hardest kind to notice.
 * `features/analytics/skeleton.ts` carries the post-mortem; `features/star-transfer/skeleton.ts` is
 * the same door for the same reason.
 *
 * Only the two class strings are here, and **not** `SearchSkeleton`: that boundary draws the
 * screen's chrome and nothing else, because the first state the real screen paints is the Recents
 * list rather than a list of results. See `loading.tsx` and the note on `SearchSkeleton` itself.
 */

export { SEARCH_CONTAINER, SEARCH_PANEL, SEARCH_SCREEN } from './lib/container'
