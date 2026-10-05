// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Post } from '../api/types'
import { type UsePostSliderResult, usePostSlider } from './use-post-slider'

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

function post(id: string): Post {
    return { id } as unknown as Post
}

const out: { current: UsePostSliderResult | null } = { current: null }

function Probe({ posts }: { posts: Post[] }) {
    out.current = usePostSlider(posts)
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
        expect(out.current?.open).toEqual({ index: 1, target: 2 })
    })

    /** A different post starts at its first picture: the reader chose the post, not a frame of it. */
    it('resets to the first picture when the post changes', () => {
        render(<Probe posts={three} />)
        act(() => out.current?.openAt(0, 3))
        act(() => out.current?.goTo(1))
        expect(out.current?.open).toEqual({ index: 1, target: 0 })
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
})
