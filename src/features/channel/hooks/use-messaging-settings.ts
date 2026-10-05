'use client'

import { useAuth } from '@features/auth'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { channelApi, channelKeys } from '../api/channel-api'
import type { Channel, MessagingSender } from '../api/types'
import { useMyChannel } from '../providers/my-channel-provider'

/**
 * Who may start a conversation with the reader — legacy's `useSetting`, the one write behind the
 * Messages screen's settings dialog: `PATCH my-channel/` with `messaging_settings` and nothing else.
 *
 * It lives here because the field is the **channel's** and so is the endpoint; `features/message`
 * draws the dialog. The response is the updated channel, and it replaces the cached `my-channel/`
 * read, so the dialog opens on the saved value next time without a refetch. A body this client
 * cannot parse falls back to a re-read, as `useSaveProfile` does.
 *
 * `save` resolves to the error (or `null`) instead of throwing, so the dialog can word the API's own
 * refusal (API_ERRORS.md) and stay open on a failure.
 */
export function useMessagingSettings() {
    const { activeId } = useAuth()
    const { myChannel, refresh } = useMyChannel()
    const queryClient = useQueryClient()
    const sender: MessagingSender = myChannel?.messaging_settings?.sender ?? 'follower'

    const mutation = useMutation({
        mutationFn: (next: MessagingSender) =>
            channelApi.updateMyChannel({ messaging_settings: { sender: next } }, activeId),
        onSuccess: async channel => {
            if (channel)
                queryClient.setQueryData<Channel | null>(channelKeys.myChannel(activeId), channel)
            else await refresh()
        },
    })

    return {
        /** The saved value — the dialog's starting point. */
        sender,
        slug: myChannel?.slug ?? null,
        hasChannel: Boolean(myChannel),
        isSaving: mutation.isPending,
        save: (next: MessagingSender): Promise<unknown> =>
            mutation.mutateAsync(next).then(
                () => null,
                (error: unknown) => error ?? new Error('save failed'),
            ),
    }
}
