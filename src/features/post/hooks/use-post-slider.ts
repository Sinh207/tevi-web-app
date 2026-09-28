'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Post } from '../api/types'

/**
 * The state behind the full-screen media viewer, for a surface that has a **list** of posts.
 *
 * ## Why the list owns this and the viewer does not
 *
 * Legacy's `ViewMediaSlide` fetches the next posts itself, with a `typePost` discriminator and a
 * branch per feed. Four feeds here already page — home, a space's threads, bookmarks, a collection
 * — and each does it with the rules in `shared/lib/api/paged-list.ts`. A viewer that paged too
 * would be a fifth copy of those rules, keyed differently, drifting on its own schedule.
 *
 * So the viewer asks and the list answers. This hook is the answer, written once: which post is
 * open, how to step, and when to ask the list for another page.
 *
 * ## What it does **not** do, since the viewer became a scroller
 *
 * `PostSlider` renders every loaded post as a snap target and reads the index off its own
 * `scrollTop`, so stepping, counting and asking for the next page all live there — they are
 * questions about a scroll position, and this hook has none. What is left is the part the **list**
 * owns: whether the viewer is open, at which post, and on which picture.
 *
 * That is smaller than the first version, which carried `prev`/`next`/`positionLabel` for a viewer
 * that showed one post at a time. Those moved rather than disappeared.
 */

export interface PostSliderTarget {
    /** Position in `posts`. */
    index: number
    /** Which image was tapped, or the clip. */
    target: number | 'video'
}

export interface UsePostSliderResult {
    /** `null` when the viewer is closed. */
    open: PostSliderTarget | null
    openAt: (index: number, target: number | 'video') => void
    /** The viewer scrolled to a different post, or a chevron was pressed. */
    goTo: (index: number) => void
    close: () => void
}

export function usePostSlider(posts: Post[]): UsePostSliderResult {
    const [open, setOpen] = useState<PostSliderTarget | null>(null)

    /*
     * A post can leave the list while it is being viewed — blocked, deleted, unbookmarked from the
     * viewer's own action row. Clamping rather than closing keeps the reader where they were: the
     * row under them takes the place of the one that went.
     */
    const index = open === null ? -1 : Math.min(open.index, posts.length - 1)

    useEffect(() => {
        if (open !== null && posts.length === 0) setOpen(null)
    }, [open, posts.length])

    return {
        open: open === null ? null : { index, target: open.target },
        openAt: useCallback((at, target) => setOpen({ index: at, target }), []),
        goTo: useCallback(
            (at: number) =>
                // A different post starts at its first picture: the reader chose the post, not a frame.
                setOpen(current => (current === null ? current : { index: at, target: 0 })),
            [],
        ),
        close: useCallback(() => setOpen(null), []),
    }
}
