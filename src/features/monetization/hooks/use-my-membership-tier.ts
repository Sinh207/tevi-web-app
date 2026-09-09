'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'
import {
    creatorMembershipApi,
    creatorMembershipKeys,
    type PackagePayload,
} from '../api/membership-api'
import type { MyPackage } from '../api/types'

/**
 * The creator's tier: reading it, writing it, and deleting it.
 *
 * ## `null` is an answer, not an absence
 *
 * The whole screen turns on it — no tier means the setup wall, a tier means the dashboard — so the
 * query resolves an empty `my-packages/` page to `null` rather than to `undefined`, and only a
 * *failed* request is an error. `hasTier` is therefore `data !== null && data !== undefined`, and
 * `isKnown` says whether the question has been answered at all. Legacy conflates the three: its
 * `initialize()` catches nothing and sets `hasPackages` to `false` on any non-200, so one 502 shows
 * a creator with paying members a wall inviting them to set up membership.
 *
 * ## Every write invalidates the members list too
 *
 * Not because the members change — deleting a tier does not refund anybody — but because the rows
 * *print the tier's name*, and legacy already found this: its `handleSave` calls `initialize()` and
 * `revalidateMembers()` together. `creatorMembershipKeys.subscribersAll` is the prefix that means
 * "every filter of the members list", so one invalidation covers both tabs and any search term.
 *
 * ## Writes are not retried, and that is the client's rule rather than this hook's
 *
 * `POST`/`PUT`/`DELETE` are non-idempotent as far as `shared/lib/api/client.ts` is concerned, so a
 * 502 that arrives *after* the write landed is never replayed into a second tier. See its note on
 * retrying writes.
 */
export interface MyMembershipTierState {
    tier: MyPackage | null | undefined
    /** The account has a tier. `false` while unknown — check `isKnown` before drawing a wall. */
    hasTier: boolean
    /** The question has been answered: neither in flight nor failed. */
    isKnown: boolean
    isLoading: boolean
    isError: boolean
    refetch: () => void
    save: (payload: PackagePayload) => Promise<MyPackage | null>
    isSaving: boolean
    remove: () => Promise<void>
    isRemoving: boolean
}

export function useMyMembershipTier(): MyMembershipTierState {
    const { t } = useTranslation()
    const { activeId, isAuthenticated } = useAuth()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: creatorMembershipKeys.myPackage(activeId),
        queryFn: ({ signal }) => creatorMembershipApi.getMyPackage({ accountId: activeId, signal }),
        /*
         * `isAuthenticated` is already `id && !anonymous`, so no extra guard — the same note
         * `MyChannelProvider` and `BalanceProvider` both carry. A guest has no tier and never will.
         */
        enabled: isAuthenticated && Boolean(activeId),
    })

    const invalidateAll = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: creatorMembershipKeys.myPackage(activeId) }),
            queryClient.invalidateQueries({ queryKey: creatorMembershipKeys.subscribersAll }),
        ])
    }, [queryClient, activeId])

    const saveMutation = useMutation({
        mutationFn: (payload: PackagePayload) => {
            const existing = query.data
            return existing
                ? creatorMembershipApi.updatePackage({
                      packageId: existing.id,
                      payload,
                      accountId: activeId,
                  })
                : creatorMembershipApi.createPackage({ payload, accountId: activeId })
        },
        onSuccess: invalidateAll,
        /*
         * No `meta.showErrorToast`. The form surfaces the failure itself, in place, because a write
         * that names a field belongs under that field and never in a toast as well — the rule in
         * `docs/API_ERRORS.md`, and the reason `use-save-profile.ts` sets no meta either.
         */
    })

    const removeMutation = useMutation({
        mutationFn: () => {
            const existing = query.data
            if (!existing) return Promise.resolve()
            return creatorMembershipApi.deletePackage({
                packageId: existing.id,
                accountId: activeId,
            })
        },
        onSuccess: async () => {
            await invalidateAll()
            // Same rule as the save: a write says so. The screen falling back to the setup wall is a
            // large change, but it is a change to what is *missing*, which reads as a load as easily
            // as a confirmation.
            toast.success(t('monetization_membership_deleted'))
        },
        meta: { showErrorToast: 'monetization_membership_delete_failed' },
    })

    const tier = query.data

    return {
        tier,
        hasTier: Boolean(tier),
        isKnown: !query.isLoading && !query.isError && tier !== undefined,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: () => void query.refetch(),
        save: payload => saveMutation.mutateAsync(payload),
        isSaving: saveMutation.isPending,
        remove: () => removeMutation.mutateAsync(),
        isRemoving: removeMutation.isPending,
    }
}
