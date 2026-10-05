'use client'

import { useAuth } from '@features/auth'
import { protectedChannelOf } from '@features/channel'
import { ApiError } from '@shared/lib/api/errors'
import { useQuery } from '@tanstack/react-query'
import { eventApi, eventKeys } from '../api/event-api'
import type { EventDetail } from '../api/types'

/**
 * One live event, by code — the page's whole data layer.
 *
 * ## The server's copy seeds it, and is immediately stale
 *
 * `initialData` is the body `getEventForRequest` fetched during the render, so the first paint has
 * the title, the banner and the host rather than a skeleton. `initialDataUpdatedAt: 0` is what makes
 * that safe: the server had **no bearer**, so its copy carries the fail-closed defaults for the two
 * fields the page's behaviour hangs on — `purchased` and `need_unlock_package`. Treating it as fresh
 * would show a paying member the paywall for a `staleTime`'s worth of seconds. Dated to the epoch,
 * TanStack refetches on mount and the reader's own answer replaces it.
 *
 * That is also why the query is keyed on the **account**: the two bodies genuinely differ per
 * reader, and one cache entry per code would hand the second signed-in account the first one's
 * entitlement.
 *
 * ## A missing event and a failed request are different answers
 *
 * `notFound` is **only** a 404. Everything else — a 500, a timeout, an unparseable body — is
 * `isError`, and the screen says "something went wrong, try again" rather than "this link is
 * broken". The distinction is the difference between an outage and telling somebody their QR code is
 * dead, and it is why `eventApi.getEvent` rejects on 404 instead of resolving to `null`.
 *
 * `null` data with no error is the third case and it means the body parsed but did not describe an
 * event (no `code`, or no `channel.slug` — see `normalizeEvent`). That is a 200 the page cannot
 * render, and it is treated as not found: unlike a transport failure, retrying it will produce the
 * same body.
 *
 * ⚠ That third case is only trustworthy because the **seed** is no longer `null` — see
 * `initialData` below. Seeding `null` made every failed server render look like an unparseable 200.
 */
export function useEvent({
    code,
    initialEvent,
}: {
    code: string
    /** The server render's copy, if there was one. Anonymous — see above. */
    initialEvent?: EventDetail | null
}) {
    const { activeId, isBootstrapping } = useAuth()

    const query = useQuery({
        queryKey: eventKeys.detail(code, activeId),
        queryFn: ({ signal }) => eventApi.getEvent({ code, accountId: activeId, signal }),
        /*
         * Waits for the session, and this is not an optimisation. Firing while `activeId` is still
         * `null` costs an anonymous request whose answer is then re-asked under the real account's
         * key — and, worse, that anonymous body would be what the reader looks at first, complete
         * with `purchased: false`. `initialEvent` is already on screen during the wait, so the delay
         * costs nothing visible.
         */
        enabled: Boolean(code) && !isBootstrapping,
        /*
         * ⚠ **Seeded only when there is something to seed.** This was
         * `initialEvent !== undefined`, which passed `initialData: null` whenever the server render
         * failed — and `null` is a *value* to TanStack, so the query went straight to
         * `status: 'success'` with `data === null`. A failing refetch on a query that already has
         * data does not flip the status to `'error'`; it stays successful with `isRefetchError`
         * set. So `isSuccess && data === null` was true, `notFound` was true, and **a 500 rendered
         * "404 – Live Not Found"** — an outage reported as a broken link, which is the one thing
         * the `notFound`/`isError` split below exists to prevent.
         *
         * Measured against a real upstream: `v4/public/events/{code}/` answers **500** for an
         * unknown code rather than 404 (B114), so this was not a hypothetical — it was the ordinary
         * path for every dead link.
         *
         * `null` reaching here always means the *server* could not answer: a definitive 404 raises
         * `notFound()` in the route and never renders this screen. So there is nothing to seed and
         * the client's own fetch decides.
         */
        ...(initialEvent ? { initialData: initialEvent, initialDataUpdatedAt: 0 } : {}),
    })

    const notFound =
        (query.error instanceof ApiError && query.error.status === 404) ||
        (query.isSuccess && query.data === null)

    /*
     * A protected space's live, asked for by somebody who does not follow it: `422 CHN0009`, with
     * the space in the body. Not an error to retry — a door, which the screen draws as one.
     */
    const protectedChannel = protectedChannelOf(query.error)

    return {
        event: query.data ?? null,
        protectedChannel,
        /**
         * ⚠ `isLoading` is false whenever `initialEvent` was given — there is data, so nothing is
         * loading. A skeleton must be gated on this and not on `isFetching`, or the page flashes one
         * over content it already has every time the reader's own copy is refetched.
         */
        isLoading: query.isLoading,
        /** A refetch is in flight over data already on screen. For a subtle indicator, not a wall. */
        isFetching: query.isFetching,
        notFound,
        /** A real failure — not a missing event. See above. */
        isError: query.isError && !notFound && !protectedChannel,
        refetch: query.refetch,
    }
}
