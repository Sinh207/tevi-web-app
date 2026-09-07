'use client'

import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { catalogApi } from '../api/catalog-api'
import { paymentKeys } from '../api/keys'
import type { StarPackage } from '../api/types'

/**
 * The Star packages on offer.
 *
 * Platform data, so the key carries no account and `staleTime` is long: the catalogue is a table the
 * backoffice edits, not per-reader state, and re-fetching it while somebody is choosing a package
 * could move the price under them mid-decision.
 *
 * An **empty list is a legitimate answer** and not an error state — a country with nothing enabled, or
 * a catalogue between edits. The sheet then says Star cannot be bought here, which is true, rather
 * than showing a retry button for a request that succeeded.
 */
export function useStarPackages({ enabled = true }: { enabled?: boolean } = {}) {
    const query = useQuery({
        queryKey: paymentKeys.starPackages(),
        queryFn: ({ signal }) => catalogApi.getStarPackages(signal),
        enabled,
        ...keepFor(30 * 60 * 1000),
    })

    return {
        packages: query.data ?? ([] as StarPackage[]),
        isLoading: query.isLoading,
        isError: query.isError,
        /** The request came back and held nothing. Never true while loading. */
        isEmpty: !query.isLoading && !query.isError && (query.data?.length ?? 0) === 0,
        refetch: query.refetch,
    }
}
