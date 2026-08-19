'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { eventKeys, eventsApi } from '../api/events-api'

/**
 * Cancelling a published event.
 *
 * **Not optimistic**, and the reason is the one that governs every write in this feature that other
 * people can see: cancelling notifies whoever was going to attend. Flipping the chip to "Cancelled"
 * and rolling it back would be telling the creator something about their audience that never
 * happened. Same rule as `useBlockUser` and `useMcnLeave`.
 *
 * Invalidates **every** state list rather than patching the row. The event moves from whatever it
 * was into `cancelled`, so it leaves the "Coming soon" list and joins the "Cancelled" one — patching
 * the row in place would leave it sitting under a filter it no longer matches. Legacy patches, and
 * legacy has that bug.
 */
export function useCancelEvent() {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (code: string) => eventsApi.cancelEvent(code, activeId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.all }),
        // A message, not a key — the toast is raised outside React by `query-client.ts`.
        meta: { showErrorToast: t('channel_event_cancel_failed') },
    })
}
