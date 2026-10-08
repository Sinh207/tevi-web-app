import 'server-only'
import { env } from '@shared/config/env'
import { internalApiBase } from '@shared/config/server-env'
import { createServerApiModel } from '@shared/lib/api/server-client'
import { cache } from 'react'
import { type EventDetail, normalizeEvent } from './types'

/**
 * Reading an event **during a server render** — for `generateMetadata`, the JSON-LD, and the first
 * paint of a shared link.
 *
 * ## Why the server reads it at all, on a page that is `noindex`
 *
 * Two readers that are not Google. A **link-preview scraper** (Slack, iMessage, Facebook) executes
 * no JavaScript and reads only what the document already contains, so without this a shared stream
 * unfurls as the site's default card — the one thing a share link exists to avoid. And a **person**
 * following that link gets the title, the banner and the host in the HTML rather than a skeleton
 * that resolves a second later. Legacy renders this page server-side for exactly these two, and
 * says so in its own comment; the `noindex` is a separate decision about *ranking*, and `follow`
 * still lets a crawler walk back to the space that hosts the stream.
 *
 * ## There is no bearer here, and the endpoint is the reason that is fine
 *
 * Auth lives in `localStorage` (`shared/lib/api/token.ts`), so a server render is always anonymous.
 * `v4/public/events/{code}/` answers without one — that is what `public/` means — so the body is the
 * **event's** half of the payload: title, banner, schedule, price, host. What it is *not* is the
 * reader's half: `purchased`, `need_unlock_package` and the geo verdict come back only for a bearer,
 * so on the server they read as their fail-closed defaults. That is correct for metadata and it is
 * why the client refetches rather than trusting the server's copy — see `use-event.ts`, where the
 * server body seeds the cache and is deliberately marked stale.
 *
 * ⚠ **Nothing may be authorised from this body.** A server render that decided "this reader has
 * access" would be deciding it for every reader, since the render is shared. Access is a client
 * question in this app, and `EventScreen` is where it is asked.
 *
 * `unwrapEnvelope: true` when the in-cluster origin is set, and not otherwise: the internal host does
 * not match `NEXT_PUBLIC_W_API_DOMAIN`, so the origin-scoped unwrap would leave `{ data: … }` on and
 * every field would read `undefined`. Forcing it on the public gateway would strip a second level.
 * The trap is written up on `createServerApiModel`; `channel-server-api.ts` has the same pair.
 */
function source(code: string) {
    const id = encodeURIComponent(code)
    const internal = internalApiBase('livestream')
    /*
     * In-cluster, the **livestream** service — legacy's `EVENT_SERVICE`,
     * `http://tevi-livestream/live/v1/public-events/{code}/`. This used to go to the channel
     * service, which has no events: every event page in the cluster would have rendered as
     * `unavailable`, with the site's default card on every shared stream.
     *
     * The path differs from the gateway's (`v1/public-events/` against `core/v4/public/events/`).
     * Legacy hands the v1 body to the same container its client fills from v4, so the shapes are
     * treated as one — and the client refetches v4 on mount regardless (`use-event.ts`), so the
     * server's copy only ever paints the first frame and the metadata.
     */
    return internal
        ? {
              model: createServerApiModel({
                  apiBase: internal,
                  revalidate: 60,
                  unwrapEnvelope: true,
              }),
              path: `v1/public-events/${id}/`,
          }
        : {
              model: createServerApiModel({
                  apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core`,
                  revalidate: 60,
              }),
              path: `v4/public/events/${id}/`,
          }
}

/**
 * The outcome of asking for an event, as a discriminated union.
 *
 * Not "the event or a thrown error", because `generateMetadata` and the page body need **different**
 * behaviour from the same failure and conflating them turns an outage into a wall:
 *
 * - `gone` — the service said 404. There is no such event, and the page says so.
 * - `unavailable` — the request failed, or answered something unparseable. The event may well exist;
 *   the page must not claim the link is broken, and the client's own fetch is what resolves it.
 *
 * `resolveChannelFetchStatus` does the same job for channels and is deliberately not reused: it maps
 * a 403 to `restricted` for a private space, and an event has no such state — the same status code
 * from this endpoint is a geo or entitlement refusal, which is the *client's* to interpret with a
 * bearer in hand.
 */
export type EventFetch =
    | { status: 'ok'; event: EventDetail }
    | { status: 'gone' | 'unavailable'; event: null }

/** A 404 is the only definitive answer; everything else leaves the URL alone. */
function isGone(error: unknown): boolean {
    return (error as { status?: number } | null)?.status === 404
}

/**
 * Wrapped in React `cache()` so `generateMetadata` and the page share **one** upstream request per
 * render. Without it every event page fetches twice, and the second fetch is not visible in the code
 * — the two functions look independent. Same reason, same shape, as `getChannelForRequest`.
 */
export const getEventForRequest = cache(async (code: string): Promise<EventFetch> => {
    try {
        const { model, path } = source(code)
        const body = await model.get<unknown>(path)
        const event = normalizeEvent(body)
        /*
         * A 200 whose body cannot be parsed is not a missing event. Treating it as `gone` would 404
         * a live stream over a schema change — and, worse for this page, would do it to the URL
         * printed on somebody's poster.
         */
        return event ? { status: 'ok', event } : { status: 'unavailable', event: null }
    } catch (error) {
        return isGone(error)
            ? { status: 'gone', event: null }
            : { status: 'unavailable', event: null }
    }
})
