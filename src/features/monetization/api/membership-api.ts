import { env } from '@shared/config/env'
import { createApiModel } from '@shared/lib/api/model'
import {
    type MyPackage,
    normalizeMyPackages,
    normalizeSubscribers,
    type ParsedPage,
    type Subscriber,
    type SubscriberStatus,
} from './types'

/**
 * The creator's membership tier and its members — `billy/v3/subscription/**`.
 *
 * **Billy**, not `core`: a membership is a recurring charge, so it lives with the money. Same
 * service `features/membership` reads from the other side, and like it this feature builds its own
 * model rather than sharing one — a model is the surface one feature needs, not a wrapper around a
 * service (`features/my-star`, `features/my-wallet` and `features/donation` all make the same call).
 *
 * Five endpoints, and legacy uses exactly these:
 *
 * | | |
 * |---|---|
 * | `GET my-packages/` | the tier this creator sells (legacy reads `results[0]`) |
 * | `POST my-packages/` | create it |
 * | `PUT my-packages/{id}/` | edit it |
 * | `DELETE my-packages/{id}/` | remove it |
 * | `GET my-channel-subscriptions/` | who is paying, filtered by `status` and `user` |
 *
 * ## Everything is derived from the bearer
 *
 * No channel id, no slug — the dashboard is whoever the token says you are. Two consequences, the
 * same two `features/analytics` writes down: every request must **pin the account** or a
 * multi-account reader gets whichever bearer happened to be active, filed under the one they were
 * looking at; and there is no URL to check against, so being signed in *is* the whole gate.
 *
 * ## `PUT`, not `PATCH`, and that is legacy's call rather than an oversight
 *
 * The model offers both (`updatePackage` and `patchPackage`); the setup form uses `PUT` and sends
 * the whole tier each time. Kept, because the form *is* the whole tier — name, prices and
 * description are the only fields it owns — so a partial write would differ only in what happens to
 * a field the form cleared, and `PUT` is the version where clearing a description clears it.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

/** Legacy's page size for the members list (`getMySubscribers(page, page_size = 20)`). */
export const SUBSCRIBERS_PAGE_SIZE = 20

/**
 * Legacy asks for **100** tiers and renders the first. The over-fetch is kept rather than narrowed
 * to 1: `results.length > 0` is what decides between the setup wall and the dashboard, and a
 * `page_size` of 1 would make that answer indistinguishable from "the first page happened to be
 * empty". Whether a creator can ever have more than one tier is **B103**.
 */
const PACKAGES_PAGE_SIZE = 100

/**
 * Query keys.
 *
 * **Account-scoped, and it is not optional** — this is one creator's tier and one creator's paying
 * members, and the account switcher is two taps from every screen. A key without the account hands
 * a ten-account reader another creator's member list under their own name.
 *
 * `subscribers` carries the status *and* the debounced search term, so switching tabs or clearing a
 * search is served from cache rather than refetched, and an in-flight request for the old filter
 * cannot resolve into the new list.
 */
const MEMBERSHIP_SCOPE = ['monetization', 'membership'] as const
const SUBSCRIBERS_SCOPE = [...MEMBERSHIP_SCOPE, 'subscribers'] as const

export const creatorMembershipKeys = {
    /** The whole creator-membership area — what a write to the tier invalidates. */
    all: MEMBERSHIP_SCOPE,
    myPackage: (accountId: string | null) =>
        [...MEMBERSHIP_SCOPE, 'package', accountId ?? 'anon'] as const,
    /** Every members list, whatever its filters — the prefix a tier write invalidates. */
    subscribersAll: SUBSCRIBERS_SCOPE,
    subscribers: (accountId: string | null, status: SubscriberStatus, q: string) =>
        [...SUBSCRIBERS_SCOPE, accountId ?? 'anon', status, q] as const,
}

interface Scoped {
    accountId?: string | null
    signal?: AbortSignal
}

function scope({ accountId, signal }: Scoped) {
    return { signal, ...(accountId ? { accountId } : {}) }
}

/** What the setup form writes. One price per currency, which is the shape legacy posts. */
export interface PackagePayload {
    name: string
    prices: { amount: string | number; amount_currency: string }[]
    description?: string
}

export const creatorMembershipApi = {
    /**
     * The tier this creator sells, or `null` when they have none.
     *
     * `null` is the **answer that drives the screen**, not an error: no tier means the setup wall.
     * So an empty page resolves to `null` and only a failed request rejects — a distinction the view
     * needs, because those two states show opposite things.
     */
    async getMyPackage(rest: Scoped = {}): Promise<MyPackage | null> {
        const body = await api.get<unknown>(
            'v3/subscription/my-packages/',
            { page: 1, page_size: PACKAGES_PAGE_SIZE },
            scope(rest),
        )
        return normalizeMyPackages(body).results[0] ?? null
    },

    /** One page of members. `user` is the search term — legacy's parameter name, kept. */
    async getSubscribers({
        page,
        status,
        q,
        ...rest
    }: Scoped & { page: number; status: SubscriberStatus; q: string }): Promise<
        ParsedPage<Subscriber>
    > {
        const body = await api.get<unknown>(
            'v3/subscription/my-channel-subscriptions/',
            {
                page,
                page_size: SUBSCRIBERS_PAGE_SIZE,
                status,
                // `createApiModel` strips empty params, so an unfiltered list sends no `user` at all.
                user: q,
            },
            scope(rest),
        )
        return normalizeSubscribers(body)
    },

    async createPackage({
        payload,
        ...rest
    }: Scoped & { payload: PackagePayload }): Promise<MyPackage | null> {
        const body = await api.post<unknown>('v3/subscription/my-packages/', payload, scope(rest))
        const parsed = normalizeMyPackages({ results: [body], count: 1 })
        return parsed.results[0] ?? null
    },

    async updatePackage({
        packageId,
        payload,
        ...rest
    }: Scoped & { packageId: string; payload: PackagePayload }): Promise<MyPackage | null> {
        const body = await api.put<unknown>(
            `v3/subscription/my-packages/${encodeURIComponent(packageId)}/`,
            payload,
            scope(rest),
        )
        const parsed = normalizeMyPackages({ results: [body], count: 1 })
        return parsed.results[0] ?? null
    },

    async deletePackage({ packageId, ...rest }: Scoped & { packageId: string }): Promise<void> {
        await api.del(
            `v3/subscription/my-packages/${encodeURIComponent(packageId)}/`,
            undefined,
            scope(rest),
        )
    },
}
