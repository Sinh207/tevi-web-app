'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { type McnLeave, organizationApi, organizationKeys } from '../api/organization-api'

/**
 * Scheduling — and un-scheduling — a departure from an MCN.
 *
 * ## Not optimistic, in either direction
 *
 * Every other mutation in this feature moves the UI first and rolls back on failure. This one does
 * not, and the reason is the same one that makes `useBlockUser` non-optimistic: the result is a
 * **notification to somebody else**. Confirming tells the network the creator intends to leave and
 * starts a 48-hour clock; showing "leaving at …" and then withdrawing it would be telling the
 * creator something about a third party that never happened.
 *
 * So both mutations show pending on the button and write the server's own answer on success. What is
 * rendered is only ever what the server said.
 *
 * ## The 404 is the ordinary state
 *
 * `getLeave` maps it to `null` rather than an error (see `organization-api.ts`), so "not leaving" is
 * a successful query with no data. That keeps `isLoading` meaningful: the card can tell "we have not
 * asked yet" from "asked, and there is no departure", which is what decides between rendering the
 * banner and rendering the action that creates one.
 *
 * `enabled` is the caller's, because only the caller knows whether an MCN exists at all — asking the
 * organization service about a departure for a creator with no network is a request with no question
 * in it.
 */
export function useMcnLeave({ enabled = true }: { enabled?: boolean } = {}) {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const key = organizationKeys.leave(activeId)

    const query = useQuery({
        queryKey: key,
        queryFn: () => organizationApi.getLeave(activeId),
        enabled,
        // Same window the channel body uses. A countdown measured in days does not need tighter.
        staleTime: 60_000,
    })

    const confirm = useMutation({
        mutationFn: () => organizationApi.confirmLeave(activeId),
        onSuccess: leave => {
            queryClient.setQueryData<McnLeave | null>(key, leave ?? null)
            /*
             * Legacy's own confirmation, and it earns its place on a screen where success is
             * otherwise almost invisible: a card appears somewhere below the fold and a kebab
             * quietly stops being offered. This says the network has been told.
             *
             * Raised here rather than at the two call sites so the About-tab card and
             * `/mcn-partnership` cannot end up reporting the same write differently.
             */
            toast.success(t('mcn_partnership_leave_submitted'))
        },
        // A message, not a key: the toast is raised outside React by `query-client.ts`, so a key
        // would ship the literal `channel_mcn_leave_failed` to the reader.
        meta: { showErrorToast: t('channel_mcn_leave_failed') },
    })

    const cancel = useMutation({
        mutationFn: () => organizationApi.cancelLeave(activeId),
        onSuccess: () => {
            queryClient.setQueryData<McnLeave | null>(key, null)
            toast.success(t('mcn_partnership_leave_cancelled'))
        },
        meta: { showErrorToast: t('channel_mcn_cancel_failed') },
    })

    return {
        /** The scheduled departure, or `null` when there is none. `undefined` while unknown. */
        leave: query.data,
        isLoading: query.isLoading,
        confirmLeave: confirm.mutate,
        cancelLeave: cancel.mutate,
        isConfirming: confirm.isPending,
        isCancelling: cancel.isPending,
    }
}
