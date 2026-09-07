'use client'

import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { catalogApi } from '../api/catalog-api'
import { paymentKeys } from '../api/keys'
import type { Gateway } from '../api/types'

/**
 * The ways to pay, for this reader's country.
 *
 * `country` is optional and normally omitted — the backend geolocates the request, which is what
 * legacy relies on (`getPaymentMethods()` with no argument). It is a parameter because a reader who
 * has told us their country in a form should not be shown another country's wallets, and because the
 * key has to distinguish "we asked for VN" from "let the backend decide" (`paymentKeys.gateways`).
 *
 * Same shape and reasoning as `useStarPackages`: platform data, long `staleTime`, and an empty list is
 * an answer rather than a failure.
 */
export function useGateways({
    country,
    enabled = true,
}: {
    country?: string | null
    enabled?: boolean
} = {}) {
    const query = useQuery({
        queryKey: paymentKeys.gateways(country),
        queryFn: ({ signal }) => catalogApi.getGateways(country, signal),
        enabled,
        ...keepFor(30 * 60 * 1000),
    })

    return {
        gateways: query.data ?? ([] as Gateway[]),
        isLoading: query.isLoading,
        isError: query.isError,
        isEmpty: !query.isLoading && !query.isError && (query.data?.length ?? 0) === 0,
        refetch: query.refetch,
    }
}
