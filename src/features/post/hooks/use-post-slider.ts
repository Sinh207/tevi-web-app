'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Post } from '../api/types'
import { postDisplay } from '../lib/post-access'
import { videoSrc } from '../lib/post-media'

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

/**
 * Which list a post belongs to in the viewer — its clip, its pictures, or nothing to show.
 *
 * ⚠ **The viewer is a media viewer, and the lists behind it are not.** Legacy never hands it a feed:
 * `useViewMediaSlide` fetches its own posts with a `media_type` filter, so a text-only post never
 * reaches it. Handing the viewer the feed as it is made every text-only post a **black screen**
 * with a caption at the foot.
 *
 * **A clip outranks pictures**, which is iOS's own rule (`Post.swift`, `contents`: video first, else
 * images) and legacy web's (`viewMediaSlide`'s `mediaType` memo): a post carrying both is a video
 * post. A locked post's media is not in the payload, so it is classed by what `unlock_detail` says
 * is behind the lock, in the same order; a locked text-only post is still a text post.
 */
export type SliderMedia = 'image' | 'video'

export function sliderMedia(post: Post): SliderMedia | null {
    const display = postDisplay(post)
    if (display === 'deleted') return null
    if (display === 'locked') {
        const detail = post.unlock_detail
        if ((detail?.video_duration_seconds ?? 0) > 0) return 'video'
        return (detail?.images_count ?? 0) > 0 ? 'image' : null
    }
    if (videoSrc(post.video) !== null) return 'video'
    return (post.images?.length ?? 0) > 0 ? 'image' : null
}

/**
 * What the viewer pages through: one kind of post, or — the channel's media grid only — both.
 *
 * ⚠ **The press decides the list.** iOS has two viewers with two families of clients: a picture
 * opens `PostPreviewImageNewViewController` over `media_type=IMAGE`, a clip opens
 * `PostPlayerNewViewController` over `media_type=VIDEO`. A reader who tapped a photograph and
 * scrolled into someone's video — or the other way round — was shown a list they did not choose.
 * The one mixed list is the media grid (`PostMediaClient`, `IMAGE` + `VIDEO`), which is a grid of
 * both to begin with.
 */
export type SliderFilter = SliderMedia | 'all'

/**
 * The tapped post is **always** in its own list, whatever its class: on iOS it is `items[0]` before
 * the fetch lands. That matters for a post with both — tapping its picture opens the picture list
 * with it at the head, though by the rule above it is a video post.
 */
function pickSlides(posts: Post[], filter: SliderFilter, anchorId: string): Post[] {
    return posts.filter(post => {
        const media = sliderMedia(post)
        if (media === null) return false
        return post.id === anchorId || filter === 'all' || media === filter
    })
}

export interface PostSliderTarget {
    /** Position in `slides`. */
    index: number
    /** Which image was tapped, or the clip. */
    target: number | 'video'
    /** Which list the press opened — and so which of a post's two media its slide shows. */
    media: SliderFilter
}

export interface UsePostSliderResult {
    /** The posts the viewer pages through. Empty while it is closed. */
    slides: Post[]
    /** `null` when the viewer is closed. `index` is a position in `slides`. */
    open: PostSliderTarget | null
    /** `index` is a position in the **list's** posts, as the caller has it. */
    openAt: (index: number, target: number | 'video') => void
    /** The viewer scrolled to a different post, or a chevron was pressed. */
    goTo: (index: number) => void
    close: () => void
}

interface OpenState {
    anchorId: string
    filter: SliderFilter
    index: number
    target: number | 'video'
}

export function usePostSlider(
    posts: Post[],
    {
        /** The channel's media grid: one list of pictures and clips together. */
        mixed = false,
    }: { mixed?: boolean } = {},
): UsePostSliderResult {
    const [open, setOpen] = useState<OpenState | null>(null)
    const anchorId = open?.anchorId ?? null
    const filter = open?.filter ?? null
    // Keyed on the list and the press, not on `open`: scrolling moves the index, not the list.
    const slides = useMemo(
        () => (anchorId === null || filter === null ? [] : pickSlides(posts, filter, anchorId)),
        [posts, anchorId, filter],
    )

    /*
     * A post can leave the list while it is being viewed — blocked, deleted, unbookmarked from the
     * viewer's own action row. Clamping rather than closing keeps the reader where they were: the
     * row under them takes the place of the one that went.
     */
    const index = open === null ? -1 : Math.min(open.index, slides.length - 1)

    useEffect(() => {
        if (open !== null && slides.length === 0) setOpen(null)
    }, [open, slides.length])

    return {
        slides,
        open: open === null ? null : { index, target: open.target, media: open.filter },
        /*
         * Translated by **identity**: the caller counts in its own list and the viewer in `slides`,
         * and a post with nothing to show opens nothing.
         */
        openAt: useCallback(
            (at: number, target: number | 'video') => {
                const id = posts[at]?.id
                if (id === undefined) return
                const list: SliderFilter = mixed ? 'all' : target === 'video' ? 'video' : 'image'
                const slide = pickSlides(posts, list, id).findIndex(post => post.id === id)
                if (slide !== -1) setOpen({ anchorId: id, filter: list, index: slide, target })
            },
            [posts, mixed],
        ),
        goTo: useCallback(
            (at: number) =>
                // A different post starts at its first picture: the reader chose the post, not a frame.
                setOpen(current =>
                    current === null ? current : { ...current, index: at, target: 0 },
                ),
            [],
        ),
        close: useCallback(() => setOpen(null), []),
    }
}
