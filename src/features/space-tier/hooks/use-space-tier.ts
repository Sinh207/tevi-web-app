'use client'

import { useAuth } from '@features/auth'
import { channelKeys } from '@features/channel'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { spaceTierApi, spaceTierKeys } from '../api/space-tier-api'
import {
    mergeSpaceTier,
    normalizeSpaceTier,
    normalizeSpaceTierEstimate,
    type SpaceTierEstimate,
    type SpaceTierState,
} from '../api/types'

export interface UseSpaceTierResult {
    state: SpaceTierState | undefined
    isLoading: boolean
    isError: boolean
    refetch: () => void
    estimate: SpaceTierEstimate | undefined
    isEstimateLoading: boolean
    /** Resolves with the tier now in force; rejects on a refused write (the toast is already up). */
    changeTier: (tier: number) => Promise<number>
    isChanging: boolean
}

/**
 * The creator's own Space tier, its estimate, and the switch.
 *
 * ## The cache holds the **wire** body, not the parsed one
 *
 * The POST answers with only part of the state — legacy merges it over what it had, because the
 * update "omits tier_images, all_tiers…" — so the merge has to happen *before* defaults are filled
 * in. Parsing at `select` keeps the cached value mergeable; parsing in `queryFn` would turn a field
 * the POST left out into `[]` or `false` and the merge would then overwrite a real value with it.
 *
 * The write sets the merged body straight away (the carousel's "Current" pill and the badge move
 * with the success dialog), then refetches, so whatever the POST did not say is re-read from the
 * server rather than assumed.
 */
export function useSpaceTier(): UseSpaceTierResult {
    const { t } = useTranslation()
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()
    const enabled = isAuthenticated && Boolean(activeId)

    const stateQuery = useQuery({
        queryKey: spaceTierKeys.state(activeId),
        queryFn: ({ signal }) => spaceTierApi.getState({ accountId: activeId, signal }),
        select: normalizeSpaceTier,
        enabled,
    })

    /*
     * Legacy's SWR here dedupes for 60s and does not revalidate on focus — the query client's own
     * defaults (60s stale, no refetch-on-focus) are the same thing, so nothing is set.
     */
    const estimateQuery = useQuery({
        queryKey: spaceTierKeys.estimate(activeId),
        queryFn: ({ signal }) => spaceTierApi.getEstimate({ accountId: activeId, signal }),
        select: normalizeSpaceTierEstimate,
        enabled,
    })

    const mutation = useMutation({
        /*
         * The account is captured at press time, not read at settle time: a switch of account
         * between the press and the answer must not file one account's tier under the other's key.
         */
        mutationFn: async ({ tier, accountId }: { tier: number; accountId: string | null }) => {
            const body = await spaceTierApi.updateTier(tier, { accountId })
            return { body, accountId, tier }
        },
        onSuccess: async ({ body, accountId }) => {
            queryClient.setQueryData(spaceTierKeys.state(accountId), (previous: unknown) =>
                mergeSpaceTier(previous, body),
            )
            await spaceTierApi.forgetState(accountId)
            void queryClient.invalidateQueries({ queryKey: spaceTierKeys.state(accountId) })
            // The channel payload carries `space_tier` / `space_tier_image` for the name badge.
            void queryClient.invalidateQueries({ queryKey: channelKeys.myChannel(accountId) })
        },
        meta: { showErrorToast: t('space_tier_change_failed') },
    })

    return {
        state: stateQuery.data,
        isLoading: stateQuery.isLoading,
        isError: stateQuery.isError,
        refetch: () => void stateQuery.refetch(),
        estimate: estimateQuery.data,
        isEstimateLoading: estimateQuery.isLoading,
        changeTier: async tier => {
            const result = await mutation.mutateAsync({ tier, accountId: activeId })
            return result.tier
        },
        isChanging: mutation.isPending,
    }
}
