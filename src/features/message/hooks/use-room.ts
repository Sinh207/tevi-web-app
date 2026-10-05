'use client'

import { useAuth } from '@features/auth'
import type { Channel } from '@features/channel'
import { useQuery } from '@tanstack/react-query'
import { messageApi, messageKeys, type RoomResult } from '../api/message-api'

export interface UseRoomResult {
    result: RoomResult | undefined
    isLoading: boolean
    isError: boolean
    refetch: () => void
}

/**
 * The conversation with the owner of `channel` — `/@{slug}/messages`'s read.
 *
 * Legacy runs this as three awaited calls inside an effect (channel → `can_start` → `start`) with a
 * loading flag it clears in two places; here the channel is `useChannel` and this is one query over
 * `start_conversation_with` (see `openConversation` for why one call is enough).
 *
 * **`is_followed` and `blocking_channel` are in the key.** Following or unblocking from a wall
 * patches the cached channel (`useChannelActions`), the key moves, and the room is asked again — the
 * wall turns into the conversation without this hook being told anything. Legacy wires the same
 * thing through an event emitter and a second `start` call from the follow handler; Android calls
 * `start_conversation_with` again after both.
 *
 * `refetchOnMount: 'always'`, because the member wall's way out is a purchase on another page: a
 * reader who comes back from `/@{slug}/membership` must not see the wall they just paid through
 * for the rest of the 60s `staleTime`.
 */
export function useRoom(channel: Channel | null | undefined): UseRoomResult {
    const { activeId, isAuthenticated } = useAuth()
    const ownerId = channel?.owner_id ?? ''
    const followed = channel?.is_followed ?? false
    const blocking = channel?.blocking_channel ?? false

    const query = useQuery({
        queryKey: messageKeys.room(ownerId, followed, blocking, activeId),
        queryFn: () => messageApi.openConversation(ownerId, activeId),
        enabled: isAuthenticated && ownerId !== '',
        refetchOnMount: 'always',
    })

    return {
        result: query.data,
        isLoading: query.isLoading,
        isError: query.isError,
        refetch: () => {
            query.refetch()
        },
    }
}
