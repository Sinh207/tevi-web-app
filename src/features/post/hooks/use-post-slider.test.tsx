// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '../api/types'
import { type UsePostSliderResult, usePostSlider } from './use-post-slider'

/**
 * The paging rules behind the full-screen viewer.
 *
 * Every claim here is about a **race or an edge** that no screenshot shows: a post leaving the list
 * while it is being looked at, the ends of what is loaded, and asking for another page before the
 * reader arrives at the last one. The viewer's geometry is not tested — that is
 * `post-media-lightbox.tsx`'s, and it is visible.
 */

function post(id: string): Post {
    return { id } as unknown as Post
}

const out: { current: UsePostSliderResult | null } = { current: null }

function Probe({
    posts,
    onLoadMore,
    hasMore,
}: {
    posts: Post[]
    onLoadMore?: () => void
    hasMore?: boolean
}) {
    out.current = usePostSlider(posts, { onLoadMore, hasMore })
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
        expect(out.current?.post).toBeNull()

        act(() => out.current?.openAt(1, 2))
        expect(out.current?.open).toEqual({ index: 1, target: 2 })
        expect(out.current?.post?.id).toBe('b')
    })

    /**
     * The control is absent rather than disabled at each end — `PostMediaLightbox` draws nothing
     * for an undefined handler, which is how the reader is told there is nothing that way.
     */
    it('offers no step past either end', () => {
        render(<Probe posts={three} />)
        act(() => out.current?.openAt(0, 0))
        expect(out.current?.prev).toBeUndefined()
        expect(out.current?.next).toBeTypeOf('function')

        act(() => out.current?.openAt(2, 0))
        expect(out.current?.next).toBeUndefined()
        expect(out.current?.prev).toBeTypeOf('function')
    })

    /** A different post starts at its first picture: the reader chose the post, not a frame of it. */
    it('resets to the first picture when the post changes', () => {
        render(<Probe posts={three} />)
        act(() => out.current?.openAt(0, 3))
        act(() => out.current?.next?.())
        expect(out.current?.open).toEqual({ index: 1, target: 0 })
    })

    /**
     * ⚠ A post can **leave the list while it is open** — blocked, deleted, or unbookmarked from the
     * viewer's own action row. Clamping keeps the reader where they were: the row that moved up
     * takes the place of the one that went. Closing instead would throw them back to the feed for
     * something they did on purpose.
     */
    it('clamps rather than closing when the list shrinks under it', () => {
        const view = render(<Probe posts={three} />)
        act(() => out.current?.openAt(2, 0))
        expect(out.current?.post?.id).toBe('c')

        view.rerender(<Probe posts={three.slice(0, 2)} />)
        expect(out.current?.post?.id).toBe('b')
        expect(out.current?.open?.index).toBe(1)
    })

    it('closes when the list empties', () => {
        const view = render(<Probe posts={three} />)
        act(() => out.current?.openAt(1, 0))
        view.rerender(<Probe posts={[]} />)
        expect(out.current?.open).toBeNull()
    })

    /**
     * ⚠ The page is asked for **before** the end, not at it. A viewer that fetched on the last post
     * would stall at every page boundary — which is the one place a full-screen reader notices,
     * because there is nothing else on screen to look at while it loads.
     */
    it('asks for another page three posts from the end', () => {
        const onLoadMore = vi.fn()
        const many = Array.from({ length: 10 }, (_, i) => post(`p${i}`))
        render(<Probe posts={many} onLoadMore={onLoadMore} hasMore />)

        act(() => out.current?.openAt(5, 0))
        expect(onLoadMore).not.toHaveBeenCalled()

        act(() => out.current?.openAt(7, 0))
        expect(onLoadMore).toHaveBeenCalled()
    })

    it('does not ask when the list says there is no more', () => {
        const onLoadMore = vi.fn()
        const many = Array.from({ length: 10 }, (_, i) => post(`p${i}`))
        render(<Probe posts={many} onLoadMore={onLoadMore} hasMore={false} />)
        act(() => out.current?.openAt(9, 0))
        expect(onLoadMore).not.toHaveBeenCalled()
    })

    it('counts for the position label, and says nothing for a list of one', () => {
        const view = render(<Probe posts={three} />)
        act(() => out.current?.openAt(1, 0))
        expect(out.current?.positionLabel).toBe('2 / 3')

        view.rerender(<Probe posts={[post('only')]} />)
        expect(out.current?.positionLabel).toBeUndefined()
    })
})
