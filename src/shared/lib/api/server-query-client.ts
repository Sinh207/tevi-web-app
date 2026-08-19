import 'server-only'
import { cache } from 'react'
import { makeQueryClient } from './query-client'

/**
 * One `QueryClient` per request, for seeding the browser's cache from a server render.
 *
 * A public page fetches its content in the RSC (see `server-client.ts`), and the same data
 * is then wanted by client hooks. `HydrationBoundary` + `dehydrate` is how it gets there,
 * and both need a client to put the data into — hence this.
 *
 * ## Why not `initialData` on the hook
 *
 * `initialData` seeds one query, and only the query that declares it. That means the
 * component tree also has to carry the object down as a prop, so the same channel exists
 * twice — once as a prop that never changes, once as query state that does — and the prop
 * is stale the moment anything refetches. Seeding the **cache** instead means any component
 * asking for that key gets the server's answer, including ones added later (the first page
 * of posts, when real post cards land) with no change to the page.
 *
 * It also carries `dataUpdatedAt`, so `staleTime` counts from when the *server* fetched.
 * With `initialData` that is a separate `initialDataUpdatedAt` prop, which is easy to omit
 * by accident.
 *
 * ## The seed only helps if both sides agree on the key
 *
 * Worth knowing before reaching for this: anything the server fetches is **anonymous**, since
 * there is no bearer here. A feature whose query keys are account-scoped — as they should be
 * for personalised payloads — therefore seeds a key no client reads, because this app always
 * holds a session (bootstrap mints an anonymous one, so `activeId` is never null). That is a
 * silent miss: the boundary is present, the data is there, and nothing uses it.
 *
 * `features/channel/hooks/use-channel.ts` shows the bridge: read the anonymous entry through
 * `initialData` so the first paint is real, and *omit* `initialDataUpdatedAt` so the
 * account-scoped fetch still runs and corrects the viewer-relative fields.
 *
 * ## Why `cache()`
 *
 * React's `cache` is per-request, so `generateMetadata`, the page, and anything else in the
 * same render share one client instead of each building their own. A module-level singleton
 * would be worse than wasteful: it would leak one visitor's data into another's render.
 * There is deliberately no `getQueryClient()` on the browser side here — `AppProviders`
 * already owns that one.
 */
export const getServerQueryClient = cache(makeQueryClient)
