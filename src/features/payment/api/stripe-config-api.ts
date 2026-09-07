import { env } from '@shared/config/env'
import { CACHE_TTL } from '@shared/lib/api/interceptors/etag'
import { createApiModel } from '@shared/lib/api/model'
import { normalizeStripeConfig, type StripeConfig } from './types'

/**
 * The Stripe publishable key — `paymee/payment/v3/stripe/config/`.
 *
 * ## Fetched, not built in
 *
 * There is no `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, on purpose. The key identifies the Stripe account
 * an intent is created against, and the **backend** decides that; a key inlined at build time is one
 * that can disagree with the intent it is confirming — which fails inside Stripe's iframe, where the
 * app cannot explain it. One request, cached for the session, is the cheaper end of that trade.
 *
 * It is a *publishable* key, so nothing about this is secret: it is safe in the browser by design,
 * exactly like `NEXT_PUBLIC_SIGN_SECRET` is documented to be. What it is not is *static*.
 */
const api = createApiModel({ apiBase: `${env.NEXT_PUBLIC_W_API_DOMAIN}/paymee` })

export const stripeConfigApi = {
    /**
     * `null` when the service answered without a usable key — the caller then says card payment is
     * unavailable rather than mounting Elements against an empty string, which is what legacy does
     * (it renders an empty dialog and no message).
     *
     * Not account-scoped: the key is the same for every reader, so no `accountId` is threaded. It is
     * still a credentialed request like any other on W_API; it simply does not vary by who asks.
     */
    async get(signal?: AbortSignal): Promise<StripeConfig | null> {
        const body = await api.get<unknown>('payment/v3/stripe/config/', undefined, {
            signal,
            cache: { persist: true, shared: true, ttlMs: CACHE_TTL.day },
        })
        return normalizeStripeConfig(body)
    },
}
