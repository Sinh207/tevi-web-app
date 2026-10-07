import 'server-only'
import { env } from '@shared/config/env'
import { internalApiBase } from '@shared/config/server-env'
import { createServerApiModel } from '@shared/lib/api/server-client'
import { cache } from 'react'
import { type ChannelFetchStatus, resolveChannelFetchStatus } from '../lib/channel-seo'
import { type Channel, normalizeChannel } from './types'

/**
 * Reading a channel during a server render — for `generateMetadata`, the JSON-LD, and the
 * first paint.
 *
 * There is no bearer on the server (auth lives in `localStorage`), so rather than inventing a
 * way to authenticate the render this goes **straight to the in-cluster service**, which needs
 * no credentials. Legacy does exactly the same for exactly these pages
 * (`../tevi-web-app/src/services/seo.js`).
 *
 * `unwrapEnvelope: true` is not optional: the internal origin does not match
 * `NEXT_PUBLIC_W_API_DOMAIN`, so the origin-scoped unwrap rule would leave `{ data: … }` on and
 * every field would read as `undefined`. See the comment on `createServerApiModel`.
 *
 * `revalidate: 60` matches the browser QueryClient's `staleTime`, so a visitor never sees the
 * server's copy be older than what the client would have kept anyway. Note the caveat on
 * `createServerApiModel`: in a container this bounds upstream traffic **per pod**, not per
 * cluster.
 */
function model() {
    const internal = internalApiBase('channel')
    return internal
        ? createServerApiModel({ apiBase: internal, revalidate: 60, unwrapEnvelope: true })
        : // Outside the cluster (`SERVER_API_VIA_GATEWAY`) — local dev, the CI e2e job. The public gateway answers the
          // same shape and its origin *does* match, so the origin-scoped unwrap applies and the
          // flag must not be forced on: doing so would strip a second level.
          createServerApiModel({
              apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core`,
              revalidate: 60,
          })
}

/**
 * The outcome of asking for a channel, as a discriminated union.
 *
 * Not "the channel or a thrown error", because `generateMetadata` and the page body need
 * *different* behaviour from the same failure, and conflating them is how an outage becomes a
 * deindexing event. `resolveChannelFetchStatus` owns that distinction; this type carries it.
 */
export type ChannelFetch =
    | { status: 'ok'; channel: Channel }
    | { status: Exclude<ChannelFetchStatus, 'ok'>; channel: null }

/**
 * Wrapped in React `cache()` so `generateMetadata` and the page share **one** upstream request
 * per render. Without it every public channel page would fetch twice, and the second fetch
 * would not even be visible in the code — the two functions look independent.
 */
export const getChannelForRequest = cache(async (slug: string): Promise<ChannelFetch> => {
    try {
        const body = await model().get<unknown>(`v3/channel/channels/${encodeURIComponent(slug)}/`)
        const channel = normalizeChannel(body)
        // A 200 whose body we cannot parse is not a missing channel. Treating it as `gone`
        // would 404 a live profile over a schema change.
        return channel ? { status: 'ok', channel } : { status: 'unavailable', channel: null }
    } catch (error) {
        const status = resolveChannelFetchStatus(error)
        return status === 'ok'
            ? { status: 'unavailable', channel: null }
            : { status, channel: null }
    }
})
