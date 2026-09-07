'use client'

import { useQuery } from '@tanstack/react-query'
import { paymentKeys } from '../api/keys'
import { stripeConfigApi } from '../api/stripe-config-api'

/**
 * The Stripe publishable key, fetched once per session.
 *
 * `staleTime: Infinity` — the key identifies a Stripe account, not a reader, and it does not change
 * while a tab is open. One request, shared by every screen that mounts Elements, which is what the
 * single query key buys instead of a provider.
 *
 * ## Three states, because "no key" is not the same as "not yet"
 *
 * `isUnavailable` is the one call sites act on: the service answered and there is no usable key, so
 * card payment cannot be offered and the screen must say so. Legacy conflates it with loading and
 * renders an empty dialog — the reader sees a Checkout header over blank space with no way to tell
 * whether to wait.
 */
export function useStripeConfig({ enabled = true }: { enabled?: boolean } = {}) {
    const query = useQuery({
        queryKey: paymentKeys.stripeConfig(),
        queryFn: ({ signal }) => stripeConfigApi.get(signal),
        staleTime: Number.POSITIVE_INFINITY,
        // Not `Infinity` to match: a publishable key that never changes still does not need to be
        // held for the life of the tab once nothing is paying. A day is the ETag record's own TTL.
        gcTime: 24 * 60 * 60 * 1000,
        /*
         * `enabled` is for the caller that is mounted whether or not anyone is paying: `useCheckout`
         * lives in `PaymentProvider`, above every route, and only needs the key at the moment it
         * confirms a charge. Ungated it fetched the key on every page load for every visitor. The
         * components that *are* the card form (`stripe-elements-scope`, `add-card-dialog`) leave it at
         * the default — they render only when a card is on screen, which is the same condition.
         */
        enabled,
    })

    return {
        publishableKey: query.data?.publishableKey ?? null,
        isLoading: query.isLoading,
        /** The answer arrived (or failed) and card payment is not possible. Fails closed. */
        isUnavailable: query.isError || (!query.isLoading && !query.data?.publishableKey),
        refresh: query.refetch,
    }
}
