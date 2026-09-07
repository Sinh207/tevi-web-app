'use client'

import { useAuth } from '@features/auth'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import {
    type CallbackIntent,
    parseCheckoutCallback,
    stripHandledParams,
} from '../lib/checkout-callback'

/**
 * The other half of every redirect: a page load carrying a payment's outcome.
 *
 * A card payment can leave the page — 3DS to the bank, a hosted page at Stripe, a local wallet — and
 * what comes back is a plain navigation with parameters on it. The client's own state is gone by
 * then, so the URL is the only thing that knows a payment is in flight. This hook reads it, hands the
 * intent to whoever can finish it, and sweeps the parameters up.
 *
 * ## It does not settle anything itself
 *
 * `use-checkout` owns the settle loop and both entry points feed it (`resume(intent)`), because the
 * *reason this feature exists* is that legacy has three copies of that loop with three different sets
 * of bugs. Duplicating it here — the second AbortController, the second backoff, the second
 * visibility pause — is how a fourth appears. What lives here is the part that is genuinely about the
 * URL: what the parameters mean, when to act on them, and when to take them off.
 *
 * ## Once per parameter set, and the guard is not decoration
 *
 * Legacy never strips `?payment_intent_client_secret=` on some of its branches, so a refresh
 * re-settles the payment — and its effect re-runs on a boolean dependency, so a second poll can start
 * beside the first (bug #15 and #5 in `docs/PAYMENT.md`). Here the intent's identity is remembered:
 * the effect can run as often as React likes and the same callback is acted on once. The parameters
 * are then removed, so a reload is an ordinary page load and the client secret is out of the address
 * bar, out of history, and out of the next support ticket.
 *
 * ## Never for an anonymous session, and never before the bootstrap finishes
 *
 * The settle call is attributed to an account, and every visitor carries an anonymous one — so
 * running this during the bootstrap would ask about somebody's payment as nobody in particular, and
 * cache the answer under the anonymous ETag scope. While the session is unresolved the parameters are
 * left **untouched** rather than stripped: they are the only record that a payment is waiting, and if
 * the reader signs in on this page the effect runs then and finishes it. Erasing them to keep the URL
 * tidy would lose a payment.
 *
 * ## `redirect_status` is a hint and is deliberately unused here
 *
 * Stripe puts `succeeded` / `processing` / `failed` on the return URL. It is a query parameter — the
 * reader can type it — and it does not know whether *our* backend recorded anything. The backend
 * callback is the verdict; `lib/checkout-callback.ts` carries the hint only so a first frame could
 * choose which kind of spinner to show.
 */
export interface UseCheckoutCallbackOptions {
    /**
     * Finish this payment. Called at most once per parameter set, synchronously inside the effect —
     * `useCheckout().resume` in the provider.
     */
    onIntent: (intent: CallbackIntent) => void
}

/**
 * What makes two callbacks the same callback.
 *
 * The *whole* query string is the wrong key: a screen's own parameters can change (a tab, a filter)
 * while the payment parameters do not, and that would replay the settle. So the key is built from
 * what was actually parsed out.
 */
function intentKey(intent: CallbackIntent): string {
    return intent.kind === 'gateway'
        ? `gateway:${new URLSearchParams(intent.params).toString()}`
        : `${intent.kind}:${intent.clientSecret}`
}

export function useCheckoutCallback({ onIntent }: UseCheckoutCallbackOptions): void {
    const { isAuthenticated, isBootstrapping } = useAuth()
    const pathname = usePathname()
    const router = useRouter()

    const onIntentRef = useRef(onIntent)
    onIntentRef.current = onIntent
    /** The last callback acted on. Survives every re-render and every re-run of the effect. */
    const handledRef = useRef<string | null>(null)

    useEffect(() => {
        if (isBootstrapping || !isAuthenticated) return
        if (typeof window === 'undefined') return

        /*
         * `window.location.search`, not `useSearchParams`. This hook is mounted by a provider above
         * every route, and `useSearchParams` makes the whole tree require a Suspense boundary at
         * build time and opts each page into dynamic rendering — the trade
         * `use-dashboard-analytics.ts` documents for the same reason. Inside an effect there is a
         * browser by definition, so there is no prerender to be wrong about and no hydration to
         * mismatch. A callback always arrives as a navigation, which re-runs this.
         */
        const search = window.location.search
        const intent = parseCheckoutCallback(search)
        if (!intent) return

        /*
         * A SetupIntent is a card being **saved**, not money moving. It belongs to the add-card
         * dialog, which is watching for its own return — sending it to the payment callback would ask
         * the backend about a payment that does not exist. Left on the URL for that flow to find.
         */
        if (intent.kind === 'card-setup') return

        const key = intentKey(intent)
        if (handledRef.current === key) return
        handledRef.current = key

        onIntentRef.current(intent)

        /*
         * Stripped **immediately**, not when the settle finishes. The poll holds the parameters in a
         * closure and no longer needs the URL, while every second they stay in the address bar is a
         * second they can be copied, shared or reloaded into a second settle. `scroll: false` because
         * this is housekeeping — the reader is looking at whatever they came back to.
         *
         * `stripHandledParams` and not `stripCallbackParams`: a gateway's own parameters are not in
         * any list of ours, and they are just as spent as a client secret. See its doc for what
         * leaving them costs — chiefly a stale reference nesting into the next payment's return URL.
         */
        const remaining = stripHandledParams(search, intent)
        router.replace(remaining ? `${pathname}?${remaining}` : pathname, { scroll: false })
    }, [isAuthenticated, isBootstrapping, pathname, router])
}
