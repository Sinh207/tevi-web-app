'use client'

import { useAuth } from '@features/auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
    creatorDonationApi,
    creatorDonationKeys,
    type DonationSettingPayload,
} from '../api/donation-api'
import type { DonationSetting } from '../api/donation-types'

/**
 * The creator's donation offer: reading it, creating it, and editing it.
 *
 * ## `null` is an answer, not an absence
 *
 * The whole screen turns on it — no offer means the intro wall, an offer means the overview — so the
 * model resolves a **404** to `null` rather than to an error, and only a real failure rejects.
 * `hasSetting` is `data != null`; `isKnown` says whether the question has been answered at all.
 *
 * Legacy conflates all three. Its `initSetting` reads `res?.status === 200 && res?.data?.data` and
 * otherwise sets `hasDonation = false`, so a 502 — or a 401 during a token refresh — shows a creator
 * whose offer is live and taking money the wall inviting them to switch the feature on. Pressing
 * *Setting* there opens a **create** form, and saving it `POST`s over an offer that already exists.
 *
 * ## Create or edit is decided by what was read, not by a flag
 *
 * `POST` when there is no setting, `PATCH` when there is — legacy's switch, off legacy's own state.
 * Keeping it derived from `query.data` rather than from a separate boolean is what stops the two
 * disagreeing after a refetch.
 *
 * ## Every write invalidates the overview too
 *
 * Not because the donations change — editing a price does not re-price a donation already received
 * — but because switching the offer **off** is a write, and a dashboard that keeps showing the
 * supporters panel under a bar whose menu now offers nothing has simply not been told.
 * `creatorDonationKeys.overviewAll` is the prefix that means "every range", so one invalidation
 * covers both.
 *
 * ## Writes are not retried
 *
 * `apiClient`'s rule rather than this hook's: `POST`/`PATCH` are non-idempotent, so a 502 arriving
 * *after* the write landed is never replayed into a second offer. See its note on retrying writes.
 */
export interface MyDonationSettingState {
    setting: DonationSetting | null | undefined
    /** The account publishes an offer. `false` while unknown — check `isKnown` before a wall. */
    hasSetting: boolean
    /** The question has been answered: neither in flight nor failed. */
    isKnown: boolean
    isLoading: boolean
    isError: boolean
    refetch: () => void
    save: (payload: DonationSettingPayload) => Promise<DonationSetting | null>
    isSaving: boolean
}

export function useMyDonationSetting(): MyDonationSettingState {
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: creatorDonationKeys.setting(activeId),
        queryFn: ({ signal }) => creatorDonationApi.getSetting({ accountId: activeId, signal }),
        /*
         * `isAuthenticated` is already `id && !anonymous`, so no extra guard — the note
         * `useMyMembershipTier`, `MyChannelProvider` and `BalanceProvider` all carry. A guest
         * publishes no donation offer and never will.
         */
        enabled: isAuthenticated && Boolean(activeId),
    })

    const invalidateAll = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: creatorDonationKeys.setting(activeId) }),
            queryClient.invalidateQueries({ queryKey: creatorDonationKeys.overviewAll }),
        ])
    }, [queryClient, activeId])

    const saveMutation = useMutation({
        mutationFn: (payload: DonationSettingPayload) =>
            query.data
                ? creatorDonationApi.updateSetting({ payload, accountId: activeId })
                : creatorDonationApi.createSetting({ payload, accountId: activeId }),
        onSuccess: invalidateAll,
        /*
         * No `meta.showErrorToast`. The form surfaces the failure itself, in place, because a write
         * that names a field belongs under that field and never in a toast as well —
         * `docs/API_ERRORS.md`, and the reason `useMyMembershipTier`'s save sets no meta either.
         */
    })

    const setting = query.data

    return {
        setting,
        hasSetting: Boolean(setting),
        isKnown: !query.isLoading && !query.isError && setting !== undefined,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: () => void query.refetch(),
        save: payload => saveMutation.mutateAsync(payload),
        isSaving: saveMutation.isPending,
    }
}
