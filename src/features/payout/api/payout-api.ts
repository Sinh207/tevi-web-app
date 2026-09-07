import { balanceKeys } from '@features/balance'
import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import type { PageCursor } from '@shared/lib/api/page-cursor'
import type { PagedList } from '@shared/lib/api/paged-list'
import {
    normalizePayoutConfigPage,
    normalizePayoutCountries,
    normalizePayoutMethods,
    normalizeStripeOnboardLink,
    type PayoutConfigCreation,
    type PayoutConfigRow,
    type PayoutCountry,
    type PayoutMethodOption,
    type StripeOnboardLink,
} from './config-types'
import {
    normalizePayoutRequestDetail,
    normalizePayoutRequestPage,
    type PayoutRequestDetail,
    type PayoutRequestPage,
} from './types'

/**
 * The payout endpoints — `billy/v5/billing/payout-request/`.
 *
 * Its own model on the same `/billy` base the three wallet features already use, because a model is
 * the surface **one** feature needs rather than a wrapper around a service. Same call
 * `features/my-wallet` and `features/my-star` make.
 *
 * **Derived from the bearer, never passed** — so every request pins `accountId`, or a reader with ten
 * accounts gets whichever bearer happened to be active when the request left, filed under the key of
 * the one they were looking at.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/billy` })

/** Legacy's page size, kept so a page boundary lands where it always has. */
export const PAYOUT_PAGE_SIZE = 20

/**
 * The configured-methods page size — legacy's `pageSizeRef.current = 20`, unchanged.
 *
 * Its own constant rather than a second use of `PAYOUT_PAGE_SIZE`: the two lists are paged by
 * different endpoints, and a change to how many payout *requests* a screen asks for must not
 * silently change how many saved *methods* it asks for. Nobody has ten payout methods; twenty is
 * one request for every real account.
 */
export const PAYOUT_CONFIG_PAGE_SIZE = 20

/**
 * The **methods** list's page size, and it is deliberately large.
 *
 * `payout-methods/?countryCode=` is paginated but there is no "load more" on that screen and there
 * should not be: a country offers a handful of ways to be paid and all of them have to be visible at
 * once. Asked at 20, a country with a longer list would silently show the first twenty — a payout
 * method the creator wanted, absent, with nothing on screen saying so (the exact failure that
 * `is_active` filtering caused, see `api/config-types.ts`). 100 is past any plausible list, so the
 * single request is the whole list. Legacy sends no page parameter at all, which is the same intent
 * expressed by relying on the server's default.
 */
export const PAYOUT_METHOD_PAGE_SIZE = 100

/**
 * Query keys, nested **under** `balanceKeys.all`.
 *
 * A payout moves the balance, so whatever invalidates the figure has to invalidate the list that
 * explains it — the agreement `walletLedgerKeys` states and the reason all of this hangs off one
 * root. A completed payout also changes `firstPayoutFree`, which lives under the same root for the
 * same reason.
 */
export const payoutKeys = {
    all: [...balanceKeys.all, 'payout'] as const,
    requests: (accountId: string | null) =>
        [...balanceKeys.all, 'payout', 'requests', accountId ?? 'anon'] as const,
    request: (accountId: string | null, id: string) =>
        [...balanceKeys.all, 'payout', 'request', accountId ?? 'anon', id] as const,
    /** The methods this account has saved — `/my-wallet/payout-method`, and one row per method. */
    configs: (accountId: string | null) =>
        [...balanceKeys.all, 'payout', 'configs', accountId ?? 'anon'] as const,
    /**
     * The countries payouts may be sent to.
     *
     * **Not keyed on the account** — every account is offered the same list, so keying it per
     * account would fetch 250 rows again on a switch for a payload that cannot have changed. The
     * locale *is* in the key, because the list is sorted in the reader's own collation
     * (`normalizePayoutCountries`) and a language switch has to re-sort it.
     */
    countries: (locale: string) => [...balanceKeys.all, 'payout', 'countries', locale] as const,
    /**
     * The methods on offer for one country. Account-scoped: the backend answers this off the
     * bearer's own eligibility, and two accounts in the same country have been seen to differ.
     */
    methods: (accountId: string | null, countryCode: string) =>
        [...balanceKeys.all, 'payout', 'methods', accountId ?? 'anon', countryCode] as const,
}

export const payoutApi = {
    /**
     * One page of payout requests, newest first.
     *
     * `page` is 1-based, as legacy sends it. **This endpoint does send `count` / `next` / `previous`**
     * — verified against a live response — so "is there more" is read off `next` rather than inferred
     * from a full page. That is the difference between this list and the two ledgers, whose endpoints
     * do not (B38): those pay one extra empty request when a total lands on a page boundary, and this
     * one does not.
     */
    async getRequests({
        page,
        accountId,
        signal,
    }: {
        page: number
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<PayoutRequestPage> {
        const body = await api.get<unknown>(
            'v5/billing/payout-request/',
            { page, page_size: PAYOUT_PAGE_SIZE },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizePayoutRequestPage(body)
    },

    /**
     * One payout request in full.
     *
     * Returns `null` for a body this client cannot read, which the hook turns into a not-found rather
     * than a page of blanks — a screen *about* one request has nothing to show without it. Legacy
     * conflates that with a failed request (`setWithdrawDetail(null)` in both its `else` and its
     * `catch`) and shows the same empty state for "no such payout" and "the network died".
     */
    async getRequest({
        id,
        accountId,
        signal,
    }: {
        id: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<PayoutRequestDetail | null> {
        const body = await api.get<unknown>(
            `v5/billing/payout-request/${encodeURIComponent(id)}/`,
            undefined,
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizePayoutRequestDetail(body)
    },

    /* ---------------------------- the setup screens ---------------------------- */

    /**
     * The methods this account has saved, one page at a time.
     *
     * Takes a **`PageCursor`** rather than a page number, unlike `getRequests` above, because this
     * list is the one with a removal in it: `shared/lib/api/paged-list.ts` owns both halves of that
     * (the next page's params, and taking a row out of the cache) and its cursor is the shape it
     * speaks. `null` means the first page.
     *
     * `page_size` is sent on **every** request, including the ones counted from `next` — billy's
     * `next` URL carries it, so this is belt and braces rather than a second opinion.
     */
    async getConfigs({
        cursor,
        accountId,
        signal,
    }: {
        cursor: PageCursor | null
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<PagedList<PayoutConfigRow>> {
        const body = await api.get<unknown>(
            'v5/billing/payout-configs/',
            {
                page: cursor?.page?.[0] ?? '1',
                page_size: cursor?.page_size?.[0] ?? String(PAYOUT_CONFIG_PAGE_SIZE),
            },
            { signal, ...(accountId ? { accountId } : {}) },
        )
        return normalizePayoutConfigPage(body)
    },

    /**
     * Forget one saved method. `204`, so there is nothing to parse and nothing to return.
     *
     * Not retried: `del` is idempotent by the client's own rule (`shared/lib/api/client.ts` retries
     * GET/HEAD/OPTIONS/PUT/DELETE), which is correct here — deleting a config that is already gone
     * answers 404 and the caller treats that as done.
     */
    async deleteConfig({
        id,
        accountId,
    }: {
        id: string
        accountId?: string | null
    }): Promise<void> {
        await api.del<unknown>(
            `v5/billing/payout-configs/${encodeURIComponent(id)}/`,
            undefined,
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * Every country billy will send money to, `allow_payout` only and sorted in `locale`.
     *
     * **Not paginated** — the endpoint answers a bare array (`ResponseCountryList`), which is why
     * this is a plain list and not a `PagedList`. ~250 rows, and the whole point of the screen is
     * to search them, so a page boundary would be a bug rather than a saving.
     */
    async getCountries({
        locale,
        accountId,
        signal,
    }: {
        locale: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<PayoutCountry[]> {
        const body = await api.get<unknown>('v5/billing/payout/countries/', undefined, {
            signal,
            ...(accountId ? { accountId } : {}),
            // ~250 rows of country, the same list for every account, and the screen searches
            // them — the one payout read where the whole body is the fixture.
            cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day },
        })
        return normalizePayoutCountries(body, locale)
    },

    /**
     * The methods on offer for one country.
     *
     * `countryCode` is **camelCase on the wire** — `?countryCode=US`, not `country_code`. That is
     * billy's own spelling for this one parameter (the schema declares it, and legacy sends it), and
     * it is the kind of thing that fails as an empty list rather than as an error: a snake_cased
     * param is simply ignored and every country answers with every method.
     *
     * One request at `PAYOUT_METHOD_PAGE_SIZE`, which is what makes it the *whole* list rather than
     * its first page — see that constant.
     */
    async getMethods({
        countryCode,
        accountId,
        signal,
    }: {
        countryCode: string
        accountId?: string | null
        signal?: AbortSignal
    }): Promise<PayoutMethodOption[]> {
        const body = await api.get<unknown>(
            'v5/billing/payout-methods/',
            { countryCode, page: 1, page_size: PAYOUT_METHOD_PAGE_SIZE },
            // What billy offers for a country — a property of the country, not of the account.
            // `countryCode` is in the params, so each country caches separately.
            {
                signal,
                ...(accountId ? { accountId } : {}),
                cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day },
            },
        )
        return normalizePayoutMethods(body)
    },

    /**
     * Save a payout method. `201` with the created config, which the caller does not read: the list
     * it belongs to is invalidated instead, so the row a reader sees is the server's own.
     *
     * **Never retried.** It is a POST, so the client's retry rule already excludes it — and it has to:
     * a 502 can arrive after the write landed, and a replay would give the account two identical
     * payout destinations with no way to tell which one a later request used.
     */
    async createConfig({
        body,
        accountId,
    }: {
        body: PayoutConfigCreation
        accountId?: string | null
    }): Promise<void> {
        await api.post<unknown>(
            'v5/billing/payout-configs/',
            body,
            accountId ? { accountId } : undefined,
        )
    },

    /**
     * Ask Stripe for an onboarding link. Stripe is the one method whose details this app never sees —
     * the reader fills them in on Stripe's own pages and comes back to `return_url`.
     *
     * Both URLs are **absolute and ours**: billy hands them straight to Stripe, which rejects a
     * relative one. They are built by the caller from `window.location.origin` rather than from an
     * env var, so a preview deploy returns to the preview deploy.
     */
    async stripeOnboardLink({
        methodId,
        refreshUrl,
        returnUrl,
        accountId,
    }: {
        methodId: string
        refreshUrl: string
        returnUrl: string
        accountId?: string | null
    }): Promise<StripeOnboardLink | null> {
        const body = await api.post<unknown>(
            'v5/billing/payout/stripe-onboard-link/',
            { payout_method_id: methodId, refresh_url: refreshUrl, return_url: returnUrl },
            accountId ? { accountId } : undefined,
        )
        return normalizeStripeOnboardLink(body)
    },
}
