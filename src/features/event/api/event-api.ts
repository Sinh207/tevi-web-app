import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import { type EventDetail, normalizeEvent } from './types'

/**
 * Reading **one live event by its code**, from the browser.
 *
 * `v4/public/events/{code}/` on `/core`, and `v4` rather than `v3` because events are on their own
 * version line — legacy keeps them in `@models/events` for the same reason.
 *
 * ## `public/`, and what that word is doing
 *
 * It means **no bearer is required**, which is what makes the event page reachable by a visitor, a
 * crawler and a server render alike. It does *not* mean the response is the same for everybody: with
 * a bearer it carries `purchased`, `need_unlock_package` and the geo verdict, which is the whole
 * personalised half of the page. So the request is made both ways and the difference is deliberate:
 * `event-server-api.ts` gets the anonymous body for metadata and the first paint, and this model
 * replaces it with the reader's own.
 *
 * ## The account is pinned, and the response is never persisted
 *
 * `accountId` on every call, for the reason `balanceApi` states at length: a reader with ten
 * accounts must not get whichever bearer happened to be active, filed under the key of the one they
 * were looking at. Here the consequence is narrower but the same shape — `purchased` is an answer
 * about a person.
 *
 * Which is also why there is **no `cache: { persist: true }`**. The body is account-scoped, so
 * writing it to IndexedDB would leave "this account has paid for this stream" on the disk of a
 * shared device — exactly the class of leak `interceptors/etag.ts` records as **B72**. The memory
 * tier is not opt-in and needs no opt-out: it lives and dies with the tab.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/core` })

/**
 * Query keys.
 *
 * Keyed on the **account** as well as the code, because the two reader-relative fields make the
 * bodies genuinely different: cached under the code alone, switching accounts would show the second
 * account the first one's entitlement. Same rule as `authKeys.me`.
 */
export const eventKeys = {
    all: ['event'] as const,
    detail: (code: string, accountId: string | null) =>
        [...eventKeys.all, 'detail', code, accountId ?? 'anon'] as const,
}

export const eventApi = {
    /**
     * One event, or `null` when the body does not describe one.
     *
     * A **404 rejects** rather than resolving to `null`, and that separation is load-bearing: "the
     * event does not exist" and "the request failed" have to reach the screen as different things,
     * or an outage renders the *Live not found* wall — which is a page telling somebody their link
     * is broken when it is not. `use-event.ts` owns that mapping.
     */
    async getEvent({
        code,
        accountId,
        signal,
    }: {
        code: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<EventDetail | null> {
        const body = await api.get<unknown>(
            `v4/public/events/${encodeURIComponent(code)}/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizeEvent(body)
    },
}
