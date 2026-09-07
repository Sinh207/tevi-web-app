/**
 * Turning a list response's `next` URL back into request params.
 *
 * ## Why the URL is not simply fetched
 *
 * DRF builds `next` from the request the **backend** saw, which makes it an absolute URL,
 * and this client must not follow it. Two independent reasons, either one sufficient:
 *
 * - On a cluster it can carry an internal hostname (`http://tevi-channel/…`) that resolves
 *   nowhere from a browser.
 * - Even with the right host, an absolute URL only receives the bearer, the device id and the
 *   HMAC signature when it matches W_API *exactly* under `shared/lib/api/origins.ts`. A
 *   near-miss silently drops all three and 401s — with no clue that the URL was the problem.
 *
 * Only the query survives the trip, and the query is all a cursor actually is
 * (`created_at_lt=…`). Legacy does the same thing for the same reason (`new URL(next).search`).
 *
 * ## Why it lives in `shared/lib/api/` and not in the feature that wrote it
 *
 * It started in `features/channel/lib/next-page-param.ts`, for the channel's thread lists. Both
 * reasons above are **API-layer** facts, though — one is about the gateway's hostnames and the
 * other is about `origins.ts`, which is two files away — and by the time a third feature needed
 * the same rule (`features/notification`'s inbox) the alternative was a copy per feature. A copy
 * fails quietly: it keeps paginating, it just stops sending credentials, or replays a stale
 * `verify`. Named `page-cursor.ts` rather than keeping `next-page-param.ts`, because the file is
 * about the cursor and not about one call site's parameter.
 */

/**
 * Params keyed to **arrays**, because `media_type` is repeatable.
 *
 * Collapsing a repeated key to its last value is the failure this shape prevents: the media
 * tab asks for images *and* videos, and a flattened cursor would quietly narrow page two to
 * videos only. The list keeps loading, so nothing looks broken.
 */
export type PageCursor = Record<string, string[]>

/**
 * The params for the next page, or `null` when there is no next page.
 *
 * Returns `null` — not an empty object — for a `next` whose query is empty. An empty cursor
 * would re-request page one forever, which reads as an infinite list that never ends.
 */
export function paramsFromNextUrl(next: string | null | undefined): PageCursor | null {
    if (typeof next !== 'string' || next.trim() === '') return null

    let search: string
    try {
        search = new URL(next).search
    } catch {
        // Relative (`?a=b`, or `/path?a=b`) — take everything from the first `?`.
        const start = next.indexOf('?')
        if (start === -1) return null
        search = next.slice(start)
    }

    const params = new URLSearchParams(search)
    // Our own HMAC, which the backend echoes back inside `next`. Replaying a stale signature
    // is worse than sending none: the interceptor mints a fresh one per request, and a second
    // `verify` in the query would be ambiguous.
    params.delete('verify')

    const cursor: PageCursor = {}
    for (const [key, value] of params) {
        cursor[key] ??= []
        cursor[key].push(value)
    }
    return Object.keys(cursor).length > 0 ? cursor : null
}

/**
 * What `useInfiniteQuery`'s `getNextPageParam` must return.
 *
 * **`undefined` is the value that stops TanStack Query, and `null` is not.** `null` is a
 * legitimate page param, so returning it on the last page leaves `hasNextPage` true forever
 * and the intersection sentinel re-fires against a list that has no more pages. Wrapping the
 * conversion here means no call site has to remember the `?? undefined`.
 */
export function nextPageParam(next: string | null | undefined): PageCursor | undefined {
    return paramsFromNextUrl(next) ?? undefined
}
