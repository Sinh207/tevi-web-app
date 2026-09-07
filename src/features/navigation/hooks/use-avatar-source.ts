'use client'

import { accountAvatarUrl, useAuth } from '@features/auth'
import { useMyChannel } from '@features/channel'
import type { AvatarSourceInput } from '@shared/lib/avatar-source'

/**
 * Everything `<AnimatedAvatar>` needs for the signed-in account.
 *
 * ## Why this reads the channel and not just `/me`
 *
 * The animated avatar is a **channel** asset gated on Premium, and legacy is unambiguous about where
 * both live: its shared `userAvatar` passes `myChannel?.images?.thumb`, `myChannel?.images?.avatar_video`
 * and `isMyPremium` — never anything off the user object. `/me` carries an `avatar` but no clip and no
 * premium flag (B21 asks whether it ever will).
 *
 * That is only cheap because `MyChannelProvider` is global: this hook renders in the rail, the tab bar
 * and the drawer, on every page, so a per-caller fetch would be three requests for one answer.
 *
 * Falls back to `/me`'s avatar while the channel is still loading, so the shell shows a face rather
 * than a placeholder that then pops into a photo.
 *
 * That fallback goes through `accountAvatarUrl` (`features/auth/lib/account-profile.ts`), next to the
 * account switcher that shows nine other faces from the same field — the shell used to read
 * `currentUser.avatar` as a plain string, which is not what the API returns (`{ thumb, cover }`, as
 * legacy's 28 `currentUser?.avatar?.thumb` call sites attest), so the avatar was always the
 * placeholder. Every host it can return is allow-listed in `next.config.ts`, so both URLs go straight
 * to `next/image`.
 */
export function useAvatarSource(): AvatarSourceInput {
    const { currentUser } = useAuth()
    const { myChannel, isPremium } = useMyChannel()

    return {
        thumb: myChannel?.images.thumb ?? accountAvatarUrl(currentUser),
        avatarVideo: myChannel?.images.avatar_video ?? null,
        isPremium,
    }
}
