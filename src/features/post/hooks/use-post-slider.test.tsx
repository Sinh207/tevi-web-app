// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Post } from '../api/types'
import { sliderMedia, type UsePostSliderResult, usePostSlider } from './use-post-slider'

/**
 * The paging rules behind the full-screen viewer.
 *
 * What is left after `PostSlider` became a **scroller** is small and it is the part the list owns:
 * whether the viewer is open, at which post, and on which picture. Stepping, counting and asking
 * for the next page are questions about a scroll position and live in the component that has one.
 *
 * The claim worth keeping is the one no screenshot shows: a post **leaving the list while it is
 * open** — blocked, deleted, unbookmarked from the viewer itself.
 */

/** A post with one picture — the ordinary thing the viewer opens. */
function post(id: string, fields: Partial<Post> = {}): Post {
    return {
        id,
        required_packages: [],
        images: [{ uri: `https://x/${id}.jpg` }],
        ...fields,
    } as unknown as Post
}

const textOnly = (id: string) => post(id, { images: [] })

const CLIP = { playback: { hls: 'https://x/v.m3u8', url: null } }
/** A post with a clip and no pictures. */
const clip = (id: string) => post(id, { images: [], video: CLIP } as unknown as Partial<Post>)
/** A post carrying both — a **video** post, by iOS's and legacy's rule. */
const both = (id: string) => post(id, { video: CLIP } as unknown as Partial<Post>)

/** Locked for this reader, with `detail` saying what is behind the lock. */
function locked(id: string, detail: { images_count: number; video_duration_seconds?: number }) {
    return post(id, {
        images: [],
        product_id: 'p1',
        required_packages: [],
        viewer: 'STARGAZERS',
        need_unlock_package: true,
        unlock_detail: { text_length: 0, video_duration_seconds: null, ...detail },
    } as unknown as Partial<Post>)
}

const out: { current: UsePostSliderResult | null } = { current: null }

function Probe({ posts, mixed }: { posts: Post[]; mixed?: boolean }) {
    out.current = usePostSlider(posts, { mixed })
    return null
}

const three = [post('a'), post('b'), post('c')]

beforeEach(() => {
    out.current = null
})

describe('usePostSlider', () => {
    it('opens closed, and opens where it is told', () => {
        render(<Probe posts={three} />)
        expect(out.current?.open).toBeNull()

        act(() => out.current?.openAt(1, 2))
        expect(out.current?.open).toEqual({ index: 1, target: 2, media: 'image' })
    })

    /** A different post starts at its first picture: the reader chose the post, not a frame of it. */
    it('resets to the first picture when the post changes', () => {
        render(<Probe posts={three} />)
        act(() => out.current?.openAt(0, 3))
        act(() => out.current?.goTo(1))
        expect(out.current?.open).toEqual({ index: 1, target: 0, media: 'image' })
    })

    /** Moving while closed stays closed — the scroller can report an index after a dismiss. */
    it('ignores a move while it is closed', () => {
        render(<Probe posts={three} />)
        act(() => out.current?.goTo(2))
        expect(out.current?.open).toBeNull()
    })

    /**
     * ⚠ A post can **leave the list while it is open** — blocked, deleted, or unbookmarked from the
     * viewer's own rail. Clamping keeps the reader where they were: the row that moved up takes the
     * place of the one that went. Closing instead would throw them back to the feed for something
     * they did on purpose.
     */
    it('clamps rather than closing when the list shrinks under it', () => {
        const view = render(<Probe posts={three} />)
        act(() => out.current?.openAt(2, 0))
        expect(out.current?.open?.index).toBe(2)

        view.rerender(<Probe posts={three.slice(0, 2)} />)
        expect(out.current?.open?.index).toBe(1)
    })

    it('closes when the list empties', () => {
        const view = render(<Probe posts={three} />)
        act(() => out.current?.openAt(1, 0))
        view.rerender(<Probe posts={[]} />)
        expect(out.current?.open).toBeNull()
    })

    it('closes when asked', () => {
        render(<Probe posts={three} />)
        act(() => out.current?.openAt(1, 0))
        act(() => out.current?.close())
        expect(out.current?.open).toBeNull()
    })

    /**
     * ⚠ The lists hand the viewer **every** post they draw, and a text-only one has nothing for a
     * media viewer to show — it was a black screen with a caption. The viewer counts in its own
     * list, so the index the caller passes has to be translated, not reused.
     */
    it('skips posts with nothing to show, opening by identity', () => {
        render(<Probe posts={[textOnly('t1'), post('a'), textOnly('t2'), post('b')]} />)
        act(() => out.current?.openAt(3, 0))
        expect(out.current?.slides.map(slide => slide.id)).toEqual(['a', 'b'])
        expect(out.current?.open?.index).toBe(1)
    })

    it('opens nothing for a post with nothing to show', () => {
        render(<Probe posts={[textOnly('t1'), post('a')]} />)
        act(() => out.current?.openAt(0, 0))
        expect(out.current?.open).toBeNull()
    })

    /**
     * ⚠ **The press decides the list** — iOS's two viewers, `media_type=IMAGE` behind a picture and
     * `VIDEO` behind a clip. A reader who tapped a photograph does not scroll into a video.
     */
    it('a picture opens the picture posts, and a clip the clip posts', () => {
        const feed = [post('a'), clip('v1'), post('b'), clip('v2')]
        render(<Probe posts={feed} />)

        act(() => out.current?.openAt(2, 0))
        expect(out.current?.slides.map(slide => slide.id)).toEqual(['a', 'b'])
        expect(out.current?.open).toEqual({ index: 1, target: 0, media: 'image' })

        act(() => out.current?.close())
        act(() => out.current?.openAt(1, 'video'))
        expect(out.current?.slides.map(slide => slide.id)).toEqual(['v1', 'v2'])
        expect(out.current?.open).toEqual({ index: 0, target: 'video', media: 'video' })
    })

    /**
     * A post with both is a video post — but its own picture still opens on **it**, at the head of
     * the picture list, as iOS puts the tapped post at `items[0]` whatever its class.
     */
    it('keeps the pressed post in its list even when it is classed the other way', () => {
        render(<Probe posts={[post('a'), both('m'), post('b'), clip('v')]} />)
        act(() => out.current?.openAt(1, 0))
        expect(out.current?.slides.map(slide => slide.id)).toEqual(['a', 'm', 'b'])
        expect(out.current?.open?.index).toBe(1)
    })

    /** The channel's media grid is the one mixed list — iOS's `PostMediaClient`, both types. */
    it('pages through both in the media grid', () => {
        render(<Probe posts={[post('a'), clip('v'), textOnly('t'), post('b')]} mixed />)
        act(() => out.current?.openAt(0, 0))
        expect(out.current?.slides.map(slide => slide.id)).toEqual(['a', 'v', 'b'])
        expect(out.current?.open?.media).toBe('all')
    })
})

describe('sliderMedia', () => {
    it('classes a post by its media, a clip outranking pictures', () => {
        expect(sliderMedia(post('a'))).toBe('image')
        expect(sliderMedia(clip('v'))).toBe('video')
        expect(sliderMedia(both('m'))).toBe('video')
        expect(sliderMedia(textOnly('t'))).toBeNull()
    })

    /** A locked post's media is not in the payload — `unlock_detail` is what says it has any. */
    it('classes a locked post by what is behind the lock', () => {
        expect(sliderMedia(locked('l1', { images_count: 3 }))).toBe('image')
        expect(sliderMedia(locked('l2', { images_count: 3, video_duration_seconds: 42 }))).toBe(
            'video',
        )
        expect(sliderMedia(locked('l3', { images_count: 0 }))).toBeNull()
    })

    it('never takes a deleted post', () => {
        expect(sliderMedia(post('d', { deleted: true } as Partial<Post>))).toBeNull()
    })
})
