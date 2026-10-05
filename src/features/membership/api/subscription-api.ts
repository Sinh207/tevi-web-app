import {
    type ChargedAmount,
    type CheckoutAction,
    parseChargedAmount,
    parseCheckoutAction,
} from '@features/payment'
import { env } from '@shared/config/env'
import { ANON_SCOPE, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import {
    type MembershipPackage,
    type MembershipStatus,
    type MembershipsPage,
    membershipPackageSchema,
    normalizeMemberships,
    normalizePaymentHistories,
    type PaymentHistory,
} from './types'

/**
 * The memberships this account holds — `billy/v3/subscription/my-subscriptions/`.
 *
 * **Billy**, not `core`: a membership is a recurring charge, so it lives with the money. Same base
 * URL as `features/my-star`, `features/my-wallet` and `features/donation`, and like them this
 * feature builds its own model on it rather than sharing one — a model is the surface one feature
 * needs, not a wrapper around a service.
 *
 * Five endpoints: the list, one membership's payment history, the two writes that stop and restart a
 * renewal, and `subscribe/` — which is how an **expired** membership is bought again.
 *
 * `subscribe/` is the only one not under `my-subscriptions/`, because it is not about a subscription
 * that exists yet: it posts to the *package* on the *channel*. It is also the only one that can be
 * paid two ways, and only one of them is implemented — see its own note.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

/** Legacy's page size, kept so a page boundary lands where it always has. */
export const MEMBERSHIP_PAGE_SIZE = 20

/**
 * Query keys.
 *
 * **Account-scoped, and it is not optional.** The list is derived from the bearer and never passed
 * an account, so a key without one hands a reader with ten accounts whichever bearer happened to be
 * active when the request left, filed under the account they were looking at — one person's paid
 * subscriptions under another person's name. Same reasoning, and the same warning, as
 * `starLedgerKeys`.
 *
 * Every filter is in the key, so switching a tab or a payment method back and forth is instant
 * rather than two reloads, and an in-flight request for the old filter cannot resolve into the new
 * list. `q` is the **debounced** term — see `useMyMemberships`, which is what keeps a key from being
 * minted per keystroke.
 */
export const membershipKeys = {
    /** The whole feature. Broad on purpose — for dropping everything, not for a write. */
    all: ['my-membership'] as const,
    /**
     * **What this account holds**, and the prefix every write invalidates.
     *
     * The split exists because `all` also covers `channelPackages`, which is the creator's price
     * list — a public offer that a purchase does not change. Invalidating the feature after a
     * payment therefore refetched the tiers of the space just bought into, on every settle, to be
     * told the same prices back. The writes move *subscriptions*; this is the prefix that means
     * exactly that.
     */
    mine: ['my-membership', 'mine'] as const,
    list: (accountId: string | null, status: MembershipStatus, paymentMethod: string, q: string) =>
        [
            ...membershipKeys.mine,
            'list',
            accountId ?? 'anon',
            status,
            paymentMethod || 'all',
            q,
        ] as const,
    /**
     * One membership's charges. Keyed on the account for the same reason the list is — this is
     * somebody's payment record — and on the subscription id, so opening two rows in turn cannot show
     * the first one's history under the second one's name.
     */
    history: (accountId: string | null, id: string) =>
        [...membershipKeys.mine, 'history', accountId ?? 'anon', id] as const,
    /**
     * The tiers a **space** offers — the space page's "Become a member" button, not this screen.
     *
     * Keyed on the account as well as the slug even though the list is public: the ETag store is
     * account-scoped, so two accounts sharing a key would let one replay the other's cached body.
     * The offer is the same for everybody, so the only cost is a refetch on an account switch.
     *
     * **Not under `mine`**: the tiers belong to the space, not to the reader. A purchase changes
     * which of them this account holds, never what they cost — so no write invalidates this.
     */
    channelPackages: (accountId: string | null, slug: string) =>
        [...membershipKeys.all, 'packages', accountId ?? 'anon', slug] as const,
    /**
     * **One** tier, addressed directly — what the `/app/[channelSlug]/membership/[packageId]` webview
     * is opened on.
     *
     * Extends `channelPackages` so the two share a prefix and neither is under `mine` (a purchase
     * changes which tiers this account holds, never what they cost). Not derived *from* the list:
     * the app deep-links into a package id it already has, and paging the whole offer to find one row
     * is a request that can also fail to contain it.
     */
    channelPackage: (accountId: string | null, slug: string, packageId: string) =>
        [...membershipKeys.channelPackages(accountId, slug), packageId] as const,
    /**
     * Whether this account already holds a membership to one space — what decides between "Become a
     * member" and "Activated membership". Its own key rather than a filter on `list`: that key
     * carries the screen's tab and search, and this question has neither.
     */
    channelMembership: (accountId: string | null, channelId: string) =>
        [...membershipKeys.mine, 'channel', accountId ?? 'anon', channelId] as const,
}

/**
 * Forget the cached `my-subscriptions/` bodies for one account — **after a payment settles**, and
 * only then.
 *
 * The backend answers `304` to the refetch that follows a card membership, so `apiClient` replays
 * the cached "not a member" and the space's action row goes on offering what was just bought
 * (**B72**). The ETag did not move when the content did, which no client can detect.
 *
 * Aimed at the *event*, not the endpoint. A membership settling is the one moment this list is known
 * to have changed behind a validator that will not admit it; every other read of it — the
 * `/my-membership` screen, a page, a filter — is an ordinary conditional GET and stays one. Making
 * the endpoint itself unconditional would have been the same fix with the tradeoff inverted: a full
 * body forever, to be right for a few seconds after a purchase.
 *
 * Every query variant goes, not just the one the caller happens to hold: the write does not respect
 * whichever `page` / `status` / `channel_id` combination this client last read through.
 */
export function forgetMyMembershipsCache(accountId: string | null) {
    return invalidateETagCache(
        accountId ?? ANON_SCOPE,
        `${api.apiBase}/v3/subscription/my-subscriptions/`,
    )
}

/**
 * What `subscribe/` answered on the **card** path: what to do next, and what it will cost.
 *
 * Two fields rather than a bare action because they come from one response and are needed together:
 * the flow hands `action` to the checkout, and the screen prints `charge` instead of re-deriving the
 * total from a rate this client hard-codes.
 */
export interface SubscribeResult {
    action: CheckoutAction
    /** `null` when the response carried no readable `payment.amount`. */
    charge: ChargedAmount | null
}

export const membershipApi = {
    /**
     * One page of memberships.
     *
     * `page` is 1-based, as legacy sends it. `payment_method` and `q` are **omitted when empty** —
     * `createApiModel` strips empty params, so "All" is the absence of the parameter rather than a
     * magic value the backend has to know about.
     *
     * `status` is always sent: this screen has no "both" tab, and omitting it would return the two
     * mixed together under whichever tab happened to be open.
     */
    async getMyMemberships({
        page,
        status,
        paymentMethod = '',
        q = '',
        channelId = '',
        accountId,
        signal,
    }: {
        page: number
        status: MembershipStatus
        paymentMethod?: string
        q?: string
        /** Narrow to one space — the space page asks "am I a member *here*". Legacy's `channel_id`. */
        channelId?: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<MembershipsPage> {
        const body = await api.get<{ results?: unknown; count?: unknown }>(
            'v3/subscription/my-subscriptions/',
            {
                page,
                page_size: MEMBERSHIP_PAGE_SIZE,
                status,
                payment_method: paymentMethod,
                q,
                channel_id: channelId,
            },
            { signal, ...(accountId ? { accountId } : {}) },
        )

        const received = Array.isArray(body?.results) ? body.results.length : 0
        const results = normalizeMemberships(body?.results)
        const count = Number(body?.count)

        return {
            results,
            /*
             * `results.length` and not `0` as the fallback: a payload with rows but no `count`
             * should say how many it has rather than claim to be empty above a full list. Same
             * call `channelApi.getBlockedAccounts` makes.
             */
            count: Number.isFinite(count) && count >= 0 ? count : results.length,
            received,
        }
    },

    /**
     * The tiers a space offers — `v3/subscription/channel/{slug}/packages/`.
     *
     * Legacy pages this (`page` / `page_size`) and then reads `subscriptionPackages[0]`, i.e. it
     * renders **one** tier and ignores the rest. That is kept: the space's action row has room for
     * one button, and inventing a tier picker for a list nothing else in the app can show would be
     * designing a screen rather than porting one. The page size is legacy's own.
     *
     * The whole list is returned rather than just the first, so the day a picker exists this call
     * does not change.
     */
    async getChannelPackages({
        slug,
        accountId,
        signal,
    }: {
        slug: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<MembershipPackage[]> {
        const body = await api.get<{ results?: unknown }>(
            // Legacy strips `@` here too, and the slug comes off a URL so it is encoded (DoD §8).
            `v3/subscription/channel/${encodeURIComponent(slug.replaceAll('@', ''))}/packages/`,
            { page: 1, page_size: 10 },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const rows = Array.isArray(body?.results) ? body.results : []
        /*
         * A row that cannot be parsed is dropped, the list is not — the rule `normalizeEvents` and
         * `normalizeMemberships` already follow. An array-level `.catch([])` would turn one odd tier
         * into "this space offers no membership", which is a different sentence entirely.
         */
        return rows
            .map(row => membershipPackageSchema.safeParse(row))
            .filter(result => result.success)
            .map(result => result.data)
    },

    /**
     * **One** tier — `v3/subscription/channel/{slug}/packages/{id}/`.
     *
     * Legacy's `SubscriptionModel.getPackageInfo`, which its webview checkout is built on: the native
     * app opens that screen on a package id it already holds, so the offer is addressed rather than
     * searched. Filtering `getChannelPackages` client-side would be the same information for a bigger
     * payload, and would answer "no such tier" for any package past the tenth (that call pages at 10,
     * as legacy does).
     *
     * `null` for a row the schema cannot read, which is the same treatment the list gives it — but
     * here it is the *whole* screen rather than one row of it, so the caller renders an error state.
     * `id` is not defaulted away: `membershipPackageSchema.id` catches to `''`, and a tier with no id
     * cannot be subscribed to, so it is not a tier.
     */
    async getChannelPackage({
        slug,
        packageId,
        accountId,
        signal,
    }: {
        slug: string
        packageId: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<MembershipPackage | null> {
        const body = await api.get<unknown>(
            `v3/subscription/channel/${encodeURIComponent(slug.replaceAll('@', ''))}/packages/${encodeURIComponent(packageId)}/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        const parsed = membershipPackageSchema.safeParse(body)
        return parsed.success && parsed.data.id !== '' ? parsed.data : null
    },

    /** Every charge against one membership, in the order the server returns them. */
    async getPaymentHistories({
        id,
        accountId,
        signal,
    }: {
        id: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<PaymentHistory[]> {
        const body = await api.get<unknown>(
            `v3/subscription/my-subscriptions/${encodeURIComponent(id)}/payment-histories/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizePaymentHistories(body)
    },

    /**
     * Stop the renewal. The membership stays **active** until `end_date`; what changes is that
     * `canceled_at` gets set, which is what flips the row's date line from "Next charge" to "Expiry
     * date". See **B53** for what this client assumes about that pair.
     *
     * ⚠ **Not replayed on failure**, and `apiClient` would not do it anyway — writes are retried only
     * with `{ retry: true }`. Nothing tells this client the endpoint deduplicates (B53 asks), and a
     * 502 arriving after the cancellation landed must not become a second one.
     */
    cancel({ id, accountId }: { id: string; accountId?: string | null }) {
        return api.post(
            `v3/subscription/my-subscriptions/${encodeURIComponent(id)}/cancel/`,
            {},
            accountId ? { accountId } : undefined,
        )
    },

    /** Put the renewal back — the inverse of `cancel`, with the same caveats. */
    undoCancel({ id, accountId }: { id: string; accountId?: string | null }) {
        return api.post(
            `v3/subscription/my-subscriptions/${encodeURIComponent(id)}/undo-cancel/`,
            {},
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * **Remove this account's subscription to one space outright** —
     * `DELETE v3/subscription/my-subscriptions/delete/?channel_id=` (billy v3 schema,
     * `subscription_my_subscriptions_delete_destroy`; answers `EmptyResponse`).
     *
     * Keyed on the **channel**, not the subscription: the path carries no id. Legacy's
     * `SubscriptionModel.deleteMySubscription` builds `my-subscriptions/{id}/delete/`, which is not
     * in the schema — and legacy renders nothing that calls it, so that path has never been
     * exercised. The schema wins.
     *
     * ⚠ **Development only.** A test reset — put an account back to "not a member" so a join flow
     * can be walked again — not a product action. The only caller is the detail dialog's header,
     * behind `NEXT_PUBLIC_ENV`. Not retried, same rule as `cancel`.
     */
    remove({ channelId, accountId }: { channelId: string; accountId?: string | null }) {
        return api.del(
            'v3/subscription/my-subscriptions/delete/',
            { channel_id: channelId },
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * Buy a tier — used here to re-subscribe to an **expired** membership.
     *
     * ## Two currencies, and the response says which one happened
     *
     * `price_id` selects it. Sent a `TVS` line, the backend debits Star and answers done; sent a `USD`
     * line it answers the same `{ action, action_data }` envelope every other checkout does, and the
     * caller has to complete the payment.
     *
     * So this returns a **`SubscribeResult | null`**: `null` means the Star debit is finished, a result
     * means a card payment is waiting to be taken. It used to throw `RenewalNeedsPaymentError` because
     * there was nothing in the app that could take one; `features/payment` handles it now, and the hook
     * hands the action to `usePayment().checkout({ kind: 'handoff', … })`.
     *
     * The result carries the **charge** as well as the action, because the same envelope states what
     * the gateway is going to take (`payment.amount`) and a screen should show that rather than its own
     * arithmetic — see `parseChargedAmount`. `null` there simply means the caller keeps its computed
     * total.
     *
     * Saying "renewed" over an unpaid `clientSecret` is still the outcome to avoid, which is why the
     * two cases are different **return values** rather than one and a guess.
     *
     * ⚠ **Not retried, and it must not be.** `apiClient` replays a POST only with `{ retry: true }`,
     * and this one **debits Star** — a 502 arriving after the charge landed would buy the membership
     * twice. Same rule, same reason, as `donateStars`.
     *
     * `event_code` is legacy's promo hook. Not sent: nothing in this app produces one, and an empty
     * string is stripped by `createApiModel` anyway.
     */
    async subscribe({
        slug,
        packageId,
        priceId,
        accountId,
    }: {
        slug: string
        packageId: string
        priceId: string
        accountId?: string | null
    }): Promise<SubscribeResult | null> {
        const body = await api.post<unknown>(
            // Legacy strips `@` before building this path and so does this: our `Channel.slug` never
            // carries one, but a caller reaching for a value off a URL would pass it straight through.
            `v3/subscription/channel/${encodeURIComponent(slug.replaceAll('@', ''))}/packages/${encodeURIComponent(packageId)}/subscribe/`,
            { price_id: priceId },
            accountId ? { accountId } : undefined,
        )

        /*
         * A body carrying no `action` is the Star path: the debit is done and there is nothing to
         * complete. `parseCheckoutAction` answers `unsupported` for that shape, which is the one case
         * where "unsupported" would be a lie — so the envelope is checked first.
         */
        const envelope = (body ?? {}) as { action?: unknown }
        if (typeof envelope.action !== 'string' || envelope.action.trim() === '') return null
        return { action: parseCheckoutAction(body), charge: parseChargedAmount(body) }
    },
}
