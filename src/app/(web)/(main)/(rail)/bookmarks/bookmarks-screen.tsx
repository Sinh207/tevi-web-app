'use client'

import { useMyChannel } from '@features/channel'
import { BookmarkList } from '@features/post'

/**
 * The client boundary that tells the bookmark list who the reader is.
 *
 * One fact — whether they are **Premium**, which exempts them from paid interaction on the cards
 * this screen renders. `useMyChannel` lives in `features/channel`, which imports `features/post`,
 * so the list cannot read it back without closing a barrel cycle.
 * `[slug]/post/[code]/post-detail-screen.tsx` carries the long form of why that is a runtime
 * failure rather than a lint one, and why a client component in `app/` is the answer.
 *
 * `page.tsx` is a server component and cannot call a hook, which is the other half of why this file
 * exists at all.
 */
export function BookmarksScreen() {
    const { isPremium } = useMyChannel()

    return <BookmarkList isPremiumReader={isPremium} />
}
