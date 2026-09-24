'use client'

import { useMyChannel } from '@features/channel'
import {
    PostComposerDialog,
    type ReplyComposerAuthor,
    uploadLimitsFromBenefits,
    usePostComposerStore,
} from '@features/post'
import { usePremiumBenefits } from '@features/premium'
import { useMemo } from 'react'

/**
 * The one mount of the post composer.
 *
 * ## Why it is here and not in the control that opens it
 *
 * Two navigation shells offer *Create a post* and **both are in the DOM at once**, so a dialog
 * rendered beside either control would exist twice — two drafts, two sets of object URLs, and
 * base-ui focusing whichever came first. The openers write to a store
 * (`features/post/store/composer-store.ts`); this renders it once, inside the session stack, which
 * is the same arrangement `MiniAppHost` uses one line below for the same reason.
 *
 * ## Why in `app/` rather than in `features/post`
 *
 * The composer draws the author's own avatar and name, which come from `useMyChannel` — in
 * `features/channel`, which imports `features/post`. Reading it from inside the post feature would
 * close a barrel cycle, so the flattening happens here, exactly as
 * `…/post/[code]/post-detail-screen.tsx` does for the reply box. Composition, which is what `app/`
 * is for.
 *
 * ## It costs a subscription and nothing else
 *
 * `PostComposerDialog` renders `null` until `open` is true — base-ui mounts no portal for a closed
 * dialog — so a session that never posts pays one store subscription, the same bargain `MiniAppHost`
 * strikes.
 */
export function PostComposerHost() {
    const { myChannel, isPremium, verifiedTickBadge } = useMyChannel()
    const { benefits } = usePremiumBenefits()
    const isOpen = usePostComposerStore(state => state.isOpen)
    const setOpen = usePostComposerStore(state => state.setOpen)

    /**
     * What this account may upload — the duration and size ceilings, from the Premium benefit table.
     *
     * Read **here** for the same reason the author is: `features/premium` reaches `features/post`
     * through `features/channel`, so the post feature cannot ask for it.
     *
     * `v1/benefits/` is **platform-wide** — the same answer for everybody — so this works for a
     * reader without Premium too, and `isPremium` only picks which column of each row applies. That
     * is better than legacy manages: its ceilings come from the same table but through a provider
     * that is only populated on some screens, so it enforces nothing when the entitlement is absent.
     */
    const limits = useMemo(() => {
        const rows = benefits.find(b => b.slug === 'enhanced-storage-upload')?.details
        return uploadLimitsFromBenefits(rows, { isPremium })
    }, [benefits, isPremium])

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

    return (
        <PostComposerDialog open={isOpen} onOpenChange={setOpen} author={author} limits={limits} />
    )
}
