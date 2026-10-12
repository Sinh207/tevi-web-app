import { describe, expect, it } from 'vitest'
import type { Post } from '../api/types'
import { holdsPost, postIdsOfChannel, replacePosts } from './post-cache'

const post = (id: string, slug: string, locked = true) =>
    ({ id, channel: { id: `c-${slug}`, slug }, need_unlock_package: locked }) as unknown as Post

const pages = (...rows: Post[][]) => ({
    pages: rows.map(results => ({ results, count: 0 })),
    pageParams: rows.map((_, i) => i),
})

describe('holdsPost', () => {
    it('finds a post in infinite pages and as a detail', () => {
        expect(holdsPost(pages([post('p0', 'a')], [post('p1', 'a')]), 'p1')).toBe(true)
        expect(holdsPost(post('p1', 'a'), 'p1')).toBe(true)
    })

    it('does not match an entry without the post', () => {
        expect(holdsPost(pages([post('p0', 'a')]), 'p1')).toBe(false)
        expect(holdsPost({ balance: 1 }, 'p1')).toBe(false)
        expect(holdsPost(undefined, 'p1')).toBe(false)
    })
})

describe('postIdsOfChannel', () => {
    it('collects only the posts of that space, case-insensitively, with or without @', () => {
        const data = pages([post('p0', 'Ada'), post('p1', 'bob'), post('p2', 'ada')])
        expect(postIdsOfChannel(data, '@ada')).toEqual(['p0', 'p2'])
    })
})

describe('replacePosts', () => {
    it('swaps the matching rows and keeps the rest by reference', () => {
        const other = post('p0', 'a')
        const data = pages([other, post('p1', 'a')])
        const fresh = post('p1', 'a', false)
        const next = replacePosts(data, new Map([['p1', fresh]]))
        expect(next.pages[0].results[1]).toBe(fresh)
        expect(next.pages[0].results[0]).toBe(other)
        expect(next).not.toBe(data)
    })

    it('returns the same reference when nothing matched', () => {
        const data = pages([post('p0', 'a')])
        expect(replacePosts(data, new Map([['p9', post('p9', 'a')]]))).toBe(data)
    })

    it('replaces a detail entry whole', () => {
        const fresh = post('p1', 'a', false)
        expect(replacePosts(post('p1', 'a'), new Map([['p1', fresh]]))).toBe(fresh)
    })
})
