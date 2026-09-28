'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
 * ## Paging **loads**, it does not just move
 *
 * `onLoadMore` is called as the reader approaches the end rather than when they hit it — a viewer
 * that fetched only on the last post would stall on every page boundary, which is the one place a
 * full-screen reader notices. `LOAD_AHEAD` is how many posts from the end that is.
 */

/** How close to the end of what is loaded before the next page is asked for. */
const LOAD_AHEAD = 3

export interface PostSliderTarget {
    /** Position in `posts`. */
    index: number
    /** Which image was tapped, or the clip. */
    target: number | 'video'
}

export interface UsePostSliderResult {
    /** `null` when the viewer is closed. */
    open: PostSliderTarget | null
    /** The post being viewed, or `null`. Resolved here so a caller never indexes the array itself. */
    post: Post | null
    openAt: (index: number, target: number | 'video') => void
    close: () => void
    /** `undefined` at the ends, which is how `PostMediaLightbox` knows to draw no control. */
    prev: (() => void) | undefined
    next: (() => void) | undefined
    /** `3 / 40`, or `undefined` for a list of one. */
    positionLabel: string | undefined
}

export function usePostSlider(
    posts: Post[],
    {
        onLoadMore,
        hasMore = false,
    }: {
        /** Ask the list for another page. Safe to call repeatedly; the list debounces. */
        onLoadMore?: () => void
        hasMore?: boolean
    } = {},
): UsePostSliderResult {
    const [open, setOpen] = useState<PostSliderTarget | null>(null)

    /*
     * A post can leave the list while it is being viewed — blocked, deleted, unbookmarked from the
     * viewer's own action row. Clamping rather than closing keeps the reader where they were: the
     * row under them takes the place of the one that went.
     */
    const index = open === null ? -1 : Math.min(open.index, posts.length - 1)
    const post = index >= 0 ? (posts[index] ?? null) : null

    useEffect(() => {
        if (open !== null && posts.length === 0) setOpen(null)
    }, [open, posts.length])

    /** Approaching the end is what asks for more, not reaching it. */
    useEffect(() => {
        if (index < 0 || !hasMore) return
        if (index >= posts.length - LOAD_AHEAD) onLoadMore?.()
    }, [index, posts.length, hasMore, onLoadMore])

    const step = useCallback(
        (delta: 1 | -1) => {
            setOpen(current => {
                if (current === null) return current
                const next = current.index + delta
                if (next < 0 || next >= posts.length) return current
                // A different post starts at its first picture; the reader chose the post, not a frame.
                return { index: next, target: 0 }
            })
        },
        [posts.length],
    )

    const positionLabel = useMemo(
        () => (index >= 0 && posts.length > 1 ? `${index + 1} / ${posts.length}` : undefined),
        [index, posts.length],
    )

    return {
        open: open === null ? null : { index, target: open.target },
        post,
        openAt: useCallback((at, target) => setOpen({ index: at, target }), []),
        close: useCallback(() => setOpen(null), []),
        prev: index > 0 ? () => step(-1) : undefined,
        next: index >= 0 && index < posts.length - 1 ? () => step(1) : undefined,
        positionLabel,
    }
}
