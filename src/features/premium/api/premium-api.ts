import { env } from '@shared/config/env'
import { ANON_SCOPE, CACHE_TTL, invalidateETagCache } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import {
    normalizePremiumBenefits,
    normalizePremiumPackages,
    type PremiumBenefit,
    type PremiumInfo,
    type PremiumPackage,
    toPremiumInfo,
} from './types'

/**
 * The Premium service — `${W_API}/premium`.
 *
 * | call | endpoint | legacy |
 * |---|---|---|
 * | packages | `v1/packages/?platform=web` | `models/premium.js` → `getPackages` |
 * | benefits | `v1/benefits/` | → `getBenefits` |
 * | this account's grant | `v1/user/info/` | → `getPremiumInfo` |
 * | redeem a Premium code | `v1/redeem/` | → `redeem`, called by `features/gift-code` |
 * | gift packages | `v1/gift-packages/?platform=web` | → `getGiftPremiumPackages`, `/gift-premium`'s table |
 *
 * **Buying Premium is not here.** `checkout/v3/checkout/premium/` is on `paymee` and belongs to
 * `features/payment`, which already carries the order (`{ kind: 'premium', priceId }`) and the
 * `REDIRECT` branch that completes it. This feature decides *what* is on offer; that one takes the
 * money. Same split as `features/membership`, and it is why nothing in this file mentions Stripe.
 *
 * ## Five of legacy's eight calls, and the three that are missing are missing on purpose
 *
 * `getBenefitsDetail(slug)` and `getStarPurchaseBonusPremium()` are **dead in legacy** — declared on
 * the model and called from nowhere. `getEnhancedStorageUploadPremium()` is alive,
 * but its one reader is the post composer's upload limits, which is not a screen this app has yet;
 * it belongs to that feature's own pass. An API method with no caller is a DTO nobody has checked
 * against a payload, and this service publishes no schema to check it against.
 *
 * ## Which of these are platform data, and which are the reader's
 *
 * Packages and benefits are the **same answer for everybody** — a price table and a content list
 * the backoffice edits — so they are not account-scoped and they are cached hard (see `api/keys.ts`
 * and the two hooks). `user/info/` is this account's own grant and is scoped like every other
 * per-account read in this app.
 *
 * ## Nothing here is retried, and only one of them is a write
 *
 * `apiClient` replays a POST only with `{ retry: true }`, and `redeemCode` does not pass it: a
 * redemption **consumes a code**, so a 502 arriving after the grant landed would, on a replay,
 * either burn the code twice or report a valid code as spent. The three GETs are retried by the
 * client's own idempotent-method rule, which is correct for a price list.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/premium` })

/**
 * Query keys.
 *
 * `all` is the prefix, so a settled Premium purchase can invalidate everything this feature holds
 * in one call — which is what `usePremiumScreen` does on `payment:succeeded` and on the
 * `premium_info` socket frame.
 *
 * **Only `info` carries the account**, and it must: a grant belongs to one account, and the ETag
 * store is namespaced per account too (`shared/lib/api/interceptors/etag.ts`), so an unscoped key
 * would let one account replay another's cached body — somebody else's expiry date under this
 * reader's name. Multi-account is a first-class state here (the switcher is two taps from every
 * screen), so this is a real case and not a hypothetical.
 *
 * Scoping the *catalogue* by account would be the opposite mistake: it refetches a price table on
 * every account switch for an answer that cannot differ.
 */
export const premiumKeys = {
    all: ['premium'] as const,
    /** `v1/packages/?platform=web`. Platform-wide. */
    packages: () => [...premiumKeys.all, 'packages'] as const,
    /**
     * `v1/gift-packages/?platform=web`. Platform-wide, and **a different table from `packages`** —
     * a gift is a one-off grant at 90/180/365 days, a subscription is a recurring charge at
     * 7/30/365. Its own key for that reason: the two lists are not two views of one catalogue, and
     * sharing a key would put three-month cards on `/premium`.
     */
    giftPackages: () => [...premiumKeys.all, 'gift-packages'] as const,
    /** `v1/benefits/`. Platform-wide. */
    benefits: () => [...premiumKeys.all, 'benefits'] as const,
    /** `v1/user/info/` — this account's grant. Account-scoped, see above. */
    info: (accountId: string | null) => [...premiumKeys.all, 'info', accountId ?? 'anon'] as const,
}

interface Scope {
    accountId?: string | null
    signal?: AbortSignal
}

function config({ accountId, signal }: Scope) {
    return { signal, ...(accountId ? { accountId } : {}) }
}

/**
 * Forget the cached `v1/user/info/` body for one account — **after a payment settles**, and only
 * then.
 *
 * The same trap `forgetMyMembershipsCache` was written for (**B72**), on the same shape of
 * endpoint. Invalidating the query alone looks as though it should be enough and is not: the
 * refetch goes out carrying the `If-None-Match` this client still holds, the backend answers `304`
 * because *its* validator has not moved, and `apiClient` replays the cached body — so the reader who
 * has just bought a year of Premium is shown the expiry they had before, or none at all.
 *
 * Aimed at the **event**, not the endpoint. A grant landing is the one moment this body is known to
 * have changed behind a validator that may not admit it; every other read of it is an ordinary
 * conditional GET and stays one. Making the endpoint unconditional instead would be the same fix
 * with the trade inverted — a full body on every visit, to be right for a few seconds after a
 * purchase.
 *
 * The memory tier is the one that matters here: this body is account-scoped, so it is deliberately
 * **not** persisted to disk (see `StoreOptions.persist`), and `invalidateETagCache` clears both.
 */
export function forgetPremiumInfoCache(accountId: string | null) {
    return invalidateETagCache(accountId ?? ANON_SCOPE, `${api.apiBase}/v1/user/info/`)
}

export const premiumApi = {
    /**
     * The subscription packages, for this platform.
     *
     * `platform: 'web'` is legacy's parameter and it is load-bearing rather than decorative: the
     * iOS and Android packages are store products at store prices, and asking without it is asking
     * to print an App Store price beside a card button.
     *
     * An **empty list is a legitimate answer** — a catalogue between edits — and is not an error:
     * the screen then says Premium cannot be bought right now, which is true, rather than showing a
     * retry button for a request that succeeded.
     */
    async getPackages({ accountId, signal }: Scope = {}): Promise<PremiumPackage[]> {
        const body = await api.get<unknown>(
            'v1/packages/',
            { platform: 'web' },
            {
                ...config({ accountId, signal }),
                /*
                 * Persisted for a day, like the gateway and Star-package lists: a price table the
                 * backoffice edits, identical for every reader, and re-fetching it while somebody
                 * is choosing would move a price under them mid-decision.
                 */
                cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day },
            },
        )
        return normalizePremiumPackages(body)
    },

    /**
     * The **gift** packages — `v1/gift-packages/?platform=web`, what `/gift-premium` sells.
     *
     * Same service, same shape, same parser, different table: these are one-off grants at 90, 180
     * and 365 days, where `getPackages` returns the recurring subscription at 7, 30 and 365. Buying
     * one charges `checkout/v3/checkout/gift-premium/` once and grants the *recipient* the days;
     * nothing renews and nothing is attached to the buyer's own subscription.
     *
     * `platform: 'web'` for the reason `getPackages` states and it is load-bearing here too: the
     * store builds price these as store products, and asking without it is asking to print an App
     * Store price beside a card button.
     *
     * ## It was deliberately unmodelled until now, and that was the right call
     *
     * This file used to name `getGiftPremiumPackages` among legacy's dead methods, on the grounds
     * that "an API method with no caller is a DTO nobody has checked against a payload". It has a
     * caller now — `useGiftPackages`, and one screen — so the DTO is checked by something. The
     * reasoning did not change; the caller arrived.
     *
     * `normalizePremiumPackages` is reused unchanged, including its "can this be bought" bar: a row
     * with no `product_id`, no price or no duration is dropped rather than drawn as a `$0` tile on a
     * screen that takes money. What it does *not* do is know which cadences exist —
     * `lib/gift-plans.ts` owns that, and answers `null` for a fourth one rather than inventing a
     * heading for it.
     */
    async getGiftPackages({ accountId, signal }: Scope = {}): Promise<PremiumPackage[]> {
        const body = await api.get<unknown>(
            'v1/gift-packages/',
            { platform: 'web' },
            {
                ...config({ accountId, signal }),
                // A price table the backoffice edits, identical for every reader — the same day-long
                // shared cache the subscription packages take, and for the same reason: re-fetching
                // it while somebody is choosing would move a price under them mid-decision.
                cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day },
            },
        )
        return normalizePremiumPackages(body)
    },

    /**
     * What Premium unlocks — the content list the screen's middle section is built from.
     *
     * Same caching as the packages and for the same reason, with one difference worth stating: this
     * one is **editorial**, so a day-long cache is a day in which a newly launched perk is not on
     * the page. That is the trade the ETag makes acceptable — a `304` costs one round trip and
     * replays the cached body, so the list is re-validated on the next visit rather than re-sent.
     */
    async getBenefits({ accountId, signal }: Scope = {}): Promise<PremiumBenefit[]> {
        const body = await api.get<unknown>('v1/benefits/', undefined, {
            ...config({ accountId, signal }),
            cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day },
        })
        return normalizePremiumBenefits(body)
    },

    /**
     * This account's Premium standing. `null` for a body this client cannot read, which drops the
     * screen to what it already knows from `useMyChannel()` rather than printing an invented date.
     */
    getInfo({ accountId, signal }: Scope = {}): Promise<PremiumInfo | null> {
        return api
            .get<unknown>('v1/user/info/', undefined, config({ accountId, signal }))
            .then(toPremiumInfo)
    },

    /**
     * Redeem a code against the Premium service — `features/gift-code`'s first attempt.
     *
     * It lives here rather than there because this is the service's feature, and it answers **only
     * whether the request was accepted**: a 2xx *is* the redemption, whatever the body carried
     * (**B68**). The body is deliberately not read — reading it could only un-decide something the
     * server already decided, and an empty 2xx once meant "not ours" to that caller, which sent the
     * same code on to the gifting service and spent it twice.
     *
     * What the grant turned out to be comes from `getInfo` above, which is why these two are one
     * feature's business and not two.
     */
    async redeemCode(code: string, accountId?: string | null): Promise<void> {
        await api.post<unknown>('v1/redeem/', { code }, accountId ? { accountId } : undefined)
    },
}
