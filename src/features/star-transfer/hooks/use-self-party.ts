'use client'

import { accountAvatarUrl, accountDisplayName, useAuth } from '@features/auth'
import type { TransferParty } from '../api/types'
import { readTeviId } from '../lib/transfer-rules'

/**
 * The reader, as the same shape the receiver is in — so the review screen and the receipt can draw
 * both ends of a transfer with one component.
 *
 * The narrowing is `features/auth`'s (`accountDisplayName`, `accountAvatarUrl`), not repeated here:
 * `currentUser` is an open record until the `/me` DTO is typed, and that file exists precisely so two
 * screens cannot disagree about which field holds the avatar.
 *
 * `null` when there is no established Tevi ID. Nothing on this screen can be reached without a signed-in
 * account, so it is the impossible case — but a **From** block with a blank ID under it is exactly the
 * kind of thing a reader would read as "sent from nobody", and printing nothing is better than that.
 */
export function useSelfParty(): TransferParty | null {
    const { currentUser, activeId } = useAuth()
    const id = readTeviId(currentUser?.id, activeId)
    if (!id) return null
    return {
        id,
        name: accountDisplayName(currentUser) ?? '',
        avatarUrl: accountAvatarUrl(currentUser),
    }
}
