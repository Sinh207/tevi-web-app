import 'server-only'
import { env } from '@shared/config/env'
import { serverEnv } from '@shared/config/server-env'
import { createServerApiModel } from '@shared/lib/api/server-client'
import { cache } from 'react'
import { type PostFetchStatus, resolvePostFetchStatus } from '../lib/post-seo'
import { normalizePost, type Post } from './types'

/**
 * Reading a post during a server render — for `generateMetadata`, the canonical redirect and the
 * first paint of a shared link.
 *
 * Same shape as `channel-server-api.ts`, and the reasoning there applies unchanged: no bearer
 * exists on the server, so this goes to the **in-cluster service** which needs none, and
 * `unwrapEnvelope: true` is mandatory on that origin because the origin-scoped unwrap rule does
 * not match it.
 *
 * ⚠ **What comes back is the *anonymous* view of the post**, and every consumer has to hold that
 * in mind. `is_bookmark`, `user_reaction`, `need_unlock_package` and `can_reply` are all
 * viewer-relative, and the viewer here is nobody. The page uses this body for metadata and for the
 * first paint only; the browser re-asks as the reader the moment it hydrates, and the client copy
 * is the one the actions are wired to.
 *
 * `revalidate: 60` matches the browser QueryClient's `staleTime` — same bound, same caveat: in a
 * container this is per pod, not per cluster.
 */
function model() {
    const internal = serverEnv().INTERNAL_CHANNEL_API
    return internal
        ? createServerApiModel({ apiBase: internal, revalidate: 60, unwrapEnvelope: true })
        : createServerApiModel({
              apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core`,
              revalidate: 60,
          })
}

export type PostFetch =
    | { status: 'ok'; post: Post }
    | { status: Exclude<PostFetchStatus, 'ok'>; post: null }

/**
 * Wrapped in React `cache()` so `generateMetadata` and the page body share **one** upstream
 * request per render. Without it every shared link costs two, and the second is invisible in the
 * code because the two functions look independent.
 *
 * The identifier may be the post's raw id **or** its short `code` — the endpoint accepts both,
 * which is exactly why the page has a canonical redirect.
 */
export const getPostForRequest = cache(async (identifier: string): Promise<PostFetch> => {
    try {
        const body = await model().get<unknown>(`v1/posts/${encodeURIComponent(identifier)}/`)
        const post = normalizePost(body)
        // A 200 whose body will not parse is not a missing post. Answering `gone` would 404 a live
        // post over a schema change — `channel-server-api.ts` makes the same distinction.
        return post ? { status: 'ok', post } : { status: 'unavailable', post: null }
    } catch (error) {
        return { status: resolvePostFetchStatus(error), post: null }
    }
})
