import { env } from '@shared/config/env'
import { ANON_SCOPE, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import { INBOX_FIRST_PAGE, INBOX_UNREAD_PAGE, type InboxPage } from '../lib/inbox-page'
import {
    type InboxSetting,
    type InboxType,
    normalizeInboxMessages,
    normalizeInboxTypes,
} from './types'

/** Notification service: `${W_API}/notification`. Legacy's `models/apiNotification.js`. */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/notification` })

/**
 * Query keys for the inbox.
 *
 * **Every key carries the account id.** An inbox is the most personal list in the app — it names
 * who paid whom and what a creator earned — so an un-scoped key would hand account B whatever
 * account A had loaded the moment somebody uses the switcher. Same rule as `authKeys.me` and
 * `channelKeys.*`, and here it is also what makes switching accounts refetch on its own.
 */
export const notificationKeys = {
    all: ['notification'] as const,
    /** The paginated inbox. One entry per account; the pages live inside it. */
    inbox: (accountId: string | null) => ['notification', 'inbox', accountId ?? 'anon'] as const,
    /**
     * Whether anything is unread — the navbar's dot, and **its own key on purpose.**
     *
     * It is not the inbox key with a different page size: the dot asks for one row and the screen
     * asks for twenty, so sharing a key would have whichever mounted second overwrite the other's
     * pages — the dot would truncate the list to a single row, or the list would inflate the dot's
     * request to twenty. Keeping them apart costs one small request. The two are kept in step by
     * invalidation instead: every read, unread, delete and mark-all invalidates this.
     */
    unread: (accountId: string | null) => ['notification', 'unread', accountId ?? 'anon'] as const,
    /**
     * The filter sheet's switches. Account-scoped like the rest — these are one account's
     * preferences, and they are also what decides which rows the inbox above returns.
     */
    types: (accountId: string | null) => ['notification', 'types', accountId ?? 'anon'] as const,
}

/**
 * Forget the cached `v1/inbox/messages/` bodies for one account — **after any write**, and it is not
 * optional.
 *
 * Every action on this screen changes that endpoint's representation: `read/`, `unread/`,
 * `archive/`, `read-all/`. If the service's ETag does not move with the content, `apiClient` does
 * what it is built to do — replays the stored body as a 200 — and the screen quietly reverts:
 * deleted notifications come back, rows go from read to unread, and the dot stays lit after "Mark
 * all as read". A 60s `staleTime` is long enough for a reader to see all of it.
 *
 * **This backend is known to do exactly that**: `my-subscriptions/` answers 304 to the refetch that
 * follows a card membership (**B72**), which is why `forgetMyMembershipsCache` exists in
 * `features/membership` with this same shape. A validator that does not move when the content does
 * is indistinguishable, from here, from a genuine "nothing changed" — so the only fix is to stop
 * asking conditionally at the moment we know the answer is stale.
 *
 * Aimed at the **event**, not the endpoint: every other read of the inbox — a page, a mount, a
 * refetch on stale — is an ordinary conditional GET and stays one. Making the endpoint
 * unconditional would be the same fix with the tradeoff inverted: a full body on every scroll, to
 * be right for the second after a press.
 *
 * Keyless, so **every** query variant goes — the write does not respect whichever `page` /
 * `page_size` / `read` combination this client last read through, and the unread count is a
 * different variant of the same URL from the list.
 */
export function forgetInboxCache(accountId: string | null) {
    return invalidateETagCache(accountId ?? ANON_SCOPE, `${api.apiBase}/v1/inbox/messages/`)
}

/**
 * The inbox endpoints — legacy's `models/notification.js`, one method per route.
 *
 * ## The three action routes are `POST`s that take an **array**
 *
 * `read/`, `unread/` and `archive/` all take `{ message_ids: [...] }`, and legacy always sends
 * exactly one. That is kept: the screen's controls act on one row each, so sending a batch would
 * mean inventing a bulk selection the design does not have. `readAll` is the one bulk action and it
 * has its own route, which takes no body at all.
 *
 * They are **not retried**. `shared/lib/api/client.ts` retries idempotent methods only, and these
 * are `POST`s — but the reason to leave them alone is stronger than the default: marking read
 * twice is harmless, so the retry would be *safe*, and it would still be wrong, because a 502
 * arriving after the write landed would replay a write whose outcome the screen has already shown.
 * `{ retry: true }` is the opt-in and no call here uses it.
 */
export const notificationApi = {
    /**
     * One page of the inbox. `cursor` is `null` on the first page — `INBOX_FIRST_PAGE` supplies
     * the params rather than the caller, so the page size cannot drift from the stop condition
     * that compares against it.
     */
    async getInbox({
        cursor,
        accountId,
        signal,
    }: {
        cursor?: PageCursor | null
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<InboxPage> {
        const body = await api.get<{ results?: unknown; count?: unknown; next?: string | null }>(
            'v1/inbox/messages/',
            cursor ?? INBOX_FIRST_PAGE,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const results = normalizeInboxMessages(body?.results)
        const count = Number(body?.count)
        return {
            results,
            /*
             * `results.length` and not `0` as the fallback, as on the follow-requests list: a
             * payload with rows but no `count` should say how many it has rather than claim to be
             * empty — a `count` of 0 next to twenty rendered rows is a screen contradicting itself.
             */
            count: Number.isFinite(count) && count >= 0 ? count : results.length,
            next: body?.next,
        }
    },

    /**
     * How many notifications are unread — for the dot.
     *
     * `read: false` is the filter legacy uses, and the answer this needs is a **count**, not the
     * row: `results` is dropped on the floor here on purpose, so a caller that wants to render
     * something has to use `getInbox`. Returning a one-row page from a function called `…Count` is
     * how a dot ends up being the list.
     *
     * Falls back to the number of rows the page carried when `count` is missing, which for a
     * `page_size=1` request is 0 or 1 — enough for a dot, and honest about being a floor rather
     * than a total. A failure is a **rejected promise**, never a zero: a dot that is absent
     * because the request failed is correct, and one that says "nothing unread" is a lie.
     */
    async getUnreadCount({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<number> {
        const body = await api.get<{ results?: unknown; count?: unknown }>(
            'v1/inbox/messages/',
            { ...INBOX_UNREAD_PAGE, read: false },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const count = Number(body?.count)
        if (Number.isFinite(count) && count >= 0) return count
        return Array.isArray(body?.results) ? body.results.length : 0
    },

    /** Mark one notification read. */
    read(id: string, accountId?: string | null) {
        return api.post(
            'v1/inbox/messages/read/',
            { message_ids: [id] },
            accountId ? { accountId } : undefined,
        )
    },

    /** Mark one notification unread again — the same route with the opposite verb. */
    unread(id: string, accountId?: string | null) {
        return api.post(
            'v1/inbox/messages/unread/',
            { message_ids: [id] },
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * Remove one notification. The wire word is *archive*; there is no screen in either app that
     * lists archived notifications, so from the reader's side it is a delete — see
     * `removeInboxMessage`.
     */
    archive(id: string, accountId?: string | null) {
        return api.post(
            'v1/inbox/messages/archive/',
            { message_ids: [id] },
            accountId ? { accountId } : undefined,
        )
    },

    /** Mark the account's **whole** inbox read — including pages this browser never loaded. */
    readAll(accountId?: string | null) {
        return api.post(
            'v1/inbox/messages/read-all/',
            undefined,
            accountId ? { accountId } : undefined,
        )
    },

    /** The notification kinds this account can switch on and off. */
    async getTypes({
        accountId,
        signal,
    }: {
        accountId?: string | null
        signal?: AbortSignal
    } = {}): Promise<InboxType[]> {
        const body = await api.get<unknown>('v1/inbox-types/', undefined, {
            signal,
            ...(accountId ? { accountId } : {}),
        })
        return normalizeInboxTypes(body)
    },

    /**
     * Save the switches. The body is a **bare array** — `[{ id, active }]`, not an object wrapping
     * one — which is legacy's shape and the reason `InboxSetting` spells the flag `active` while
     * the read side spells it `turn_on`. **B79.**
     */
    updateTypes(settings: readonly InboxSetting[], accountId?: string | null) {
        return api.post('v1/inbox-setting/', settings, accountId ? { accountId } : undefined)
    },
}
