'use client'

import { useAuth } from '@features/auth'
import { keepFor } from '@shared/lib/api/query-client'
import { useQuery } from '@tanstack/react-query'
import { donationFeeApi, donationFeeKeys } from '../api/donation-fee-api'

/**
 * The card fee's coefficients, fetched **only when the cash tab is showing**.
 *
 * `enabled` is the whole design: Star carries no fee, and Star is the default and the common case,
 * so a donation dialog that always asked would put a request to a second service on every open for a
 * figure most readers never see. Legacy fetches it as soon as the offer has any price at all.
 *
 * A failure resolves to `null` rather than an error state — the dialog then says it does not know
 * the fee instead of printing a `$0.00` it made up. `staleTime` is deliberately long: the platform's
 * processing rate is not per-session data, and refetching it while somebody is choosing an amount
 * could move the total under them.
 */
export function useDonationFee({ enabled }: { enabled: boolean }) {
    const { activeId } = useAuth()

    const query = useQuery({
        queryKey: donationFeeKeys.coefficients(activeId),
        queryFn: () => donationFeeApi.getCoefficients(activeId),
        enabled,
        ...keepFor(30 * 60 * 1000),
    })

    return { fee: query.data ?? null, isLoading: query.isLoading }
}
