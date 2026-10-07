import 'server-only'
import { mayRenderForCrawler, normalizePosts, type Post } from '@features/post'
import { env } from '@shared/config/env'
import { internalApiBase } from '@shared/config/server-env'
import { createServerApiModel } from '@shared/lib/api/server-client'
import { cache } from 'react'
import { FEED_PAGE_SIZE } from './home-api'

/**
 * The home feed as the **server** reads it — the in-cluster post service, with no viewer.
 *
 * ## Why the server asks at all
 *
 * The client's feed is `followed-channels/threads/` as the reader's bearer, and there is no
 * bearer on the server (`shared/lib/api/token.ts`). So until this existed, what a crawler and a
 * guest got at `/` was the shell and a sign-in prompt: the site's front door, with not one link to
 * a space on it.
 * The post service answers the same feed **in-cluster without credentials** (at `v1`), which is
 * the trade `channel-server-api.ts` already makes for the space page. Asked through the public
 * gateway with no bearer — or with a guest's anonymous one — the feed is an empty list, which is
 * why this has to be the internal origin to be worth a request.
 *
 * ## What the body is, and what it must not be used for
 *
 * The **anonymous** view: every viewer-relative field (`is_bookmark`, `user_reaction`,
 * `need_unlock_package`, `is_owner`) reads as nobody's. It is rendered for a reader who is not
 * signed in and for nothing else — a signed-in reader's feed is theirs, fetched in the browser as
 * them (`useHomeFeed`), and never seeded from this.
 *
 * ## Failure is an absent feed, not an error
 *
 * `null` on any failure, and the page falls back to the sign-in prompt it showed before. A home
 * page that renders an error because an optional enrichment timed out would be the worse trade.
 *
 * `revalidate: 60`, the post page's bound — this body is the same for every caller, so it is the
 * one home request that can be shared, per pod.
 */
function source() {
    const internal = internalApiBase('post')
    /*
     * The version differs by origin, as the event's does: the post service answers this feed at
     * **`v1`** in-cluster, while the public gateway only routes `v3` (its `v1` is a 404) — which is
     * also what the browser's own feed (`home-api.ts`) keeps asking.
     */
    return internal
        ? {
              model: createServerApiModel({
                  apiBase: internal,
                  revalidate: 60,
                  unwrapEnvelope: true,
              }),
              path: 'v1/channel/followed-channels/threads/',
          }
        : {
              model: createServerApiModel({
                  apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core`,
                  revalidate: 60,
              }),
              path: 'v3/channel/followed-channels/threads/',
          }
}

export const getPublicFeedForRequest = cache(async (): Promise<Post[] | null> => {
    try {
        const { model, path } = source()
        const body = await model.get<{ results?: unknown }>(path, { limit: FEED_PAGE_SIZE })
        // Nothing a scraper may not be handed: this HTML is what a crawler and a link preview read,
        // with no consent gate in front of it — the post page's rule, applied per row.
        const posts = normalizePosts(body?.results).filter(mayRenderForCrawler)
        return posts.length > 0 ? posts : null
    } catch {
        return null
    }
})
