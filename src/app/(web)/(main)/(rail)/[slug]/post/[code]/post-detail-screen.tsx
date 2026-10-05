'use client'

import { useMyChannel } from '@features/channel'
import { type Post, PostDetailView, type ReplyComposerAuthor } from '@features/post'
import { useMemo } from 'react'

/**
 * The client boundary that tells the post screen who the reader is.
 *
 * Two facts, both from `useMyChannel`: whether they are **Premium** (paid interaction exempts them)
 * and their **own space** (the composer draws their avatar and name, as legacy's does).
 *
 * ## Why this file exists rather than a prop on the page
 *
 * Premium readers are **exempt from paid interaction** — `replyCost` says so — and the boolean is
 * `useMyChannel().isPremium`, which lives in `features/channel`. That feature imports
 * `features/post`, so the post feature cannot read it back without closing a barrel cycle: the card,
 * the action row and the reply composer have all carried an `isPremiumReader` prop with nobody to
 * pass it.
 *
 * The feed and the space page have no such problem — `features/home` and `features/channel` may both
 * read the provider directly, and now do. The **route** is the one surface with no feature above the
 * screen to fill the prop, and `page.tsx` is a server component, so it cannot call a hook. Hence one
 * client component whose entire job is to read one boolean and hand it down. That is composition,
 * which is what `app/` is for; no business logic moves here.
 *
 * ⚠ **Do not "simplify" this away by importing `useMyChannel` inside `features/post`.** It is not a
 * lint failure, it is a runtime one: ESM resolves the cycle by handing one side a half-initialised
 * module, which surfaces as `undefined is not a function` at render rather than at build.
 *
 * Until the flag is known, `isPremium` is `false` — the provider's own default while `my-channel/`
 * is in flight. A Premium reader who presses inside that window is quoted a price they do not owe;
 * the alternative, withholding the composer until the answer lands, would make every reader wait for
 * a request none of them is blocked by. The window closes with the first response.
 */
export function PostDetailScreen({
    identifier,
    serverPost,
}: {
    identifier: string
    serverPost: Post | null
}) {
    const { myChannel, isPremium, verifiedTickBadge } = useMyChannel()

    /**
     * The reader, flattened to the five fields the composer draws.
     *
     * Flattened here rather than passed as a `Channel`, because `features/post` cannot name that
     * type — the same boundary this file exists for. `null` while the account has no space, which
     * is a real state (a reader who has never created one): the composer then draws no avatar and
     * no identity line, and everything else about it still works.
     */
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
        <PostDetailView
            identifier={identifier}
            serverPost={serverPost}
            author={author}
            isPremiumReader={isPremium}
        />
    )
}
