'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { forgetInboxCache, notificationApi, notificationKeys } from '../api/notification-api'
import { type InboxData, markInboxAllRead } from '../lib/inbox-page'

/**
 * "Mark all as read" — the page bar's action, in its own hook rather than on `useInbox`.
 *
 * ## Why it is not part of `useInbox`
 *
 * The control lives in the page **bar** and the list lives in the panel below it, and those are two
 * components. Calling `useInbox` from both would mount its exit timers and its pending-read set
 * twice for one screen — harmless, but state that exists to coordinate a list, held by something
 * that renders no list. This hook holds only what the bar needs, so the bar's component tree stops
 * at the button.
 *
 * The list still updates, because the write goes to the **cache** they share: `setQueryData` on the
 * inbox key repaints every row the panel has rendered. That is the whole reason the mutation can
 * live away from the list at all.
 *
 * ## The route marks more than is on screen, and the numbers are handled accordingly
 *
 * `read-all/` marks the account's **entire** inbox, including pages this browser has never
 * fetched. So the loaded rows are written locally — they are the ones being looked at, and leaving
 * twenty tinted rows behind a success toast is the one thing this must not do — while the unread
 * count is **invalidated**. Writing zero into the count would be this client asserting a total it
 * cannot know; asking is one small request and is also what corrects the count if another device
 * read something in the meantime.
 */
export interface UseMarkInboxReadResult {
    isPending: boolean
    /** Mark the whole inbox read. Refused while a previous call is in flight. */
    markAllRead: () => void
}

export function useMarkInboxRead(): UseMarkInboxReadResult {
    const { activeId } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    /** Memoised because the key factories build a new array per call. */
    const inboxKey = useMemo(() => notificationKeys.inbox(activeId), [activeId])
    const unreadKey = useMemo(() => notificationKeys.unread(activeId), [activeId])

    const mutation = useMutation({
        mutationFn: () => notificationApi.readAll(activeId),
        onSuccess: async () => {
            queryClient.setQueryData<NonNullable<InboxData>>(inboxKey, data =>
                markInboxAllRead(data),
            )
            /*
             * The stored validators go before anything is re-asked. This is the write where a
             * stale 304 is most visible: the whole inbox has just changed, so a replayed body puts
             * every row back to unread the next time the list refetches, and leaves the dot lit
             * after the toast said it was cleared. See `forgetInboxCache` (**B72**).
             */
            await forgetInboxCache(activeId)
            queryClient.invalidateQueries({ queryKey: unreadKey })
            // One toast id across the screen's actions, so marking all read after deleting a row
            // replaces that toast instead of stacking two.
            toast.success(t('notification_marked_all_read'), { id: 'notification-action' })
        },
        meta: { showErrorToast: t('notification_error_mark_all') },
    })

    const markAllRead = useCallback(() => {
        if (mutation.isPending) return
        mutation.mutate()
    }, [mutation])

    return { isPending: mutation.isPending, markAllRead }
}
