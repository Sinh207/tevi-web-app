'use client'

import { useMyChannel } from '@features/channel'
import { type ReplyComposerAuthor, ReplyDialog } from '@features/post'
import { useMemo } from 'react'

/**
 * The one mount of the reply popup — `PostComposerHost`'s sibling, for the same two reasons.
 *
 * **Once, not per card.** Every post in a feed offers *Comment*, so a dialog rendered beside the
 * button would be one portal per row. The openers write to a store
 * (`features/post/store/reply-store.ts`) and this renders it.
 *
 * **Here rather than in `features/post`.** The popup draws the reader's own avatar and name, which
 * come from `useMyChannel` — in `features/channel`, which imports `features/post`. Reading it
 * inside the post feature would close a barrel cycle, so the flattening happens in `app/`, which is
 * what `app/` is for.
 *
 * Costs one store subscription until something opens it: `ReplyDialog` renders `null` with no post.
 */
export function ReplyDialogHost() {
    const { myChannel, isPremium, verifiedTickBadge } = useMyChannel()

    /** The five fields the composer draws, flattened — `features/post` cannot name `Channel`. */
    const author = useMemo<ReplyComposerAuthor | null>(
        () =>
            myChannel
                ? {
                      name: myChannel.name ?? null,
                      slug: myChannel.slug ?? null,
                      thumb: myChannel.images?.thumb ?? null,
                      avatarVideo: myChannel.images?.avatar_video ?? null,
                      isPremium,
                      verifiedBadge: verifiedTickBadge,
                  }
                : null,
        [myChannel, isPremium, verifiedTickBadge],
    )

    return <ReplyDialog author={author} isPremiumReader={isPremium} />
}
