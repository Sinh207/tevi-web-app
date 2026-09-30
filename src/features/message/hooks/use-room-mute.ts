'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { forgetConversationCache, messageApi, type RoomResult } from '../api/message-api'
import type { Conversation } from '../api/types'

/**
 * Mute / unmute the open conversation — Android's header toggle, with its toast ("Ada has been
 * muted"). No durations: neither app has any.
 *
 * **Not optimistic.** The switch changes whether this device is woken for the next message, and a
 * toggle that flips back after a failed request reads like a setting that did not stick. On success
 * the room's cached conversation is patched (it is what the menu reads) and the list is re-asked,
 * since its rows draw the muted glyph.
 */
export function useRoomMute(conversation: Conversation, name: string) {
    const { activeId } = useAuth()
    const queryClient = useQueryClient()
    const { t } = useTranslation()
    const muted = conversation.my_settings?.muted ?? false

    const mutation = useMutation({
        mutationFn: (next: boolean) => messageApi.setMuted(conversation.id, next, activeId),
        onSuccess: async (_data, next) => {
            queryClient.setQueriesData<RoomResult>({ queryKey: ['message', 'room'] }, data =>
                data?.kind === 'open' && data.conversation.id === conversation.id
                    ? {
                          ...data,
                          conversation: {
                              ...data.conversation,
                              my_settings: {
                                  pinned: data.conversation.my_settings?.pinned ?? false,
                                  muted: next,
                              },
                          },
                      }
                    : data,
            )
            await forgetConversationCache(activeId)
            queryClient.invalidateQueries({ queryKey: ['message', 'conversations'] })
            toast.success(t(next ? 'message_muted_toast' : 'message_unmuted_toast', { name }), {
                id: 'message-mute',
            })
        },
        meta: { showErrorToast: t('message_error_mute') },
    })

    return {
        muted,
        isPending: mutation.isPending,
        toggle: () => {
            if (!mutation.isPending) mutation.mutate(!muted)
        },
    }
}
