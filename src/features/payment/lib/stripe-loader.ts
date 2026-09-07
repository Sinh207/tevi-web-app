import type { Stripe } from '@stripe/stripe-js'
import { loadStripe } from '@stripe/stripe-js/pure'

/**
 * `loadStripe`, memoised — and replaceable.
 *
 * ## Memoised because the alternative is a broken form
 *
 * Legacy calls it **inside render**: `<Elements stripe={loadStripe(key)}>`
 * (`components/stripe/index.js`). Every render therefore creates a new Stripe instance and a new
 * `Elements` identity, which remounts the card iframes and throws away whatever had been typed into
 * them. It also re-injects `js.stripe.com` on each call. One promise per publishable key, held at
 * module scope, is the whole fix.
 *
 * The key is part of the cache key rather than assumed constant: it comes from the backend
 * (`api/stripe-config-api.ts`), so a staging/production mix-up should produce two instances rather
 * than silently reuse the first.
 *
 * ## `/pure`, because the ordinary entry point loads Stripe.js on **import**
 *
 * `@stripe/stripe-js` injects `js.stripe.com` as a side effect of being imported — not of `loadStripe`
 * being called. This module is reachable from `PaymentProvider`, which is mounted above every route, so
 * that side effect fired on **every page**: measured on a built `/privacy`, a static legal page, four
 * cross-origin requests to Stripe including `m.stripe.com/6`, their fraud-signal beacon. Nobody on that
 * page is paying for anything.
 *
 * `/pure` is Stripe's own entry point for this: identical API, and the script is fetched by the first
 * `loadStripe()` call instead. The cost is that the first card form waits for the script rather than
 * finding it warm — which is what the panel's `Loader` is for, and a fair trade against loading a
 * payment SDK on a terms-of-service page.
 *
 * ## Replaceable because `use-checkout` has to be testable
 *
 * `loadStripe` fetches a script from another origin — there is no version of that a unit test can
 * run. So the loader is a module-level seam: a test injects a fake `Stripe` object and asserts what
 * the hook does with `confirmPayment`'s answer, which is where the interesting logic lives. Same
 * pattern, and the same reason, as `shared/lib/socket/` injecting `io`.
 */

type StripeLoader = (publishableKey: string) => Promise<Stripe | null>

const defaultLoader: StripeLoader = key => loadStripe(key)

let loader: StripeLoader = defaultLoader
const cache = new Map<string, Promise<Stripe | null>>()

/**
 * The Stripe instance for this publishable key.
 *
 * Resolves `null` when the script cannot load (offline, blocked by an extension, refused by CSP) —
 * that is Stripe's own contract and it is not an exception, so the caller renders "card payment is
 * unavailable" rather than an empty form. A **rejected** load is not cached: the next attempt should
 * be able to succeed.
 */
export function getStripe(publishableKey: string): Promise<Stripe | null> {
    const cached = cache.get(publishableKey)
    if (cached) return cached

    const promise = loader(publishableKey).catch(error => {
        cache.delete(publishableKey)
        throw error
    })
    cache.set(publishableKey, promise)
    return promise
}

/** Swap the loader (tests). Passing `null` restores the real one and clears the cache. */
export function setStripeLoader(next: StripeLoader | null): void {
    loader = next ?? defaultLoader
    cache.clear()
}
