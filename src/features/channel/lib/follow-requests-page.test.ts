import type { PageCursor } from '@shared/lib/api/page-cursor'
import type { InfiniteData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { FollowRequest } from '../api/types'
import {
    clearFollowRequests,
    FOLLOW_REQUESTS_COUNT_PAGE,
    FOLLOW_REQUESTS_FIRST_PAGE,
    FOLLOW_REQUESTS_PAGE_SIZE,
    type FollowRequestsPage,
    nextFollowRequestCursor,
    removeFollowRequest,
} from './follow-requests-page'

/**
 * The paging rules are `shared/lib/api/paged-list.ts`'s and are pinned for the blocked list already, so what is
 * asserted here is what is **this** list's own: that its page size reaches both the request and
 * the stop condition, and the clearing the bulk actions depend on.
 *
 * `clearFollowRequests` is the one worth the most words. It fails in two directions and neither
 * throws: keep too much and the screen offers Accept buttons for rows the server has already
 * dealt with; keep too little — an empty `pages` array — and TanStack Query treats the query as
 * unloaded, so the skeleton flashes over what should be an empty state.
 */

function row(id: string): FollowRequest {
    return {
        id,
        created_at: null,
        user: {
            id: `u-${id}`,
            name: null,
            display_name: null,
            slug: '',
            avatar: { thumb: null, avatar_video: null },
            verified_tick_badge: null,
            is_premium: false,
        },
    }
}

function page(count: number, extra: Partial<FollowRequestsPage> = {}): FollowRequestsPage {
    return {
        results: Array.from({ length: count }, (_, index) => row(`r${index}`)),
        count: 100,
        ...extra,
    }
}

function infinite(
    ...pages: FollowRequestsPage[]
): InfiniteData<FollowRequestsPage, PageCursor | null> {
    return { pages, pageParams: pages.map(() => null) }
}

describe('the request params', () => {
    /**
     * The page size is in the cursor *and* in the stop condition. A first page that asked for a
     * different number than `nextFollowRequestCursor` compares against would stop the list after
     * one page or never stop it at all — which is why both read one constant.
     */
    it('asks for the list at the size the stop condition assumes', () => {
        expect(FOLLOW_REQUESTS_FIRST_PAGE).toEqual({
            page: ['1'],
            page_size: [String(FOLLOW_REQUESTS_PAGE_SIZE)],
        })
    })

    /** The badge asks for one row, not zero — see the constant for why zero is not safe. */
    it('asks for one row when it only wants the count', () => {
        expect(FOLLOW_REQUESTS_COUNT_PAGE).toEqual({ page: ['1'], page_size: ['1'] })
    })
})

describe('nextFollowRequestCursor', () => {
    it('stops when the API says `next` is null, even on a full page', () => {
        expect(
            nextFollowRequestCursor(page(FOLLOW_REQUESTS_PAGE_SIZE, { next: null }), null),
        ).toBeUndefined()
    })

    it('stops on a short page when the payload has no `next` at all', () => {
        expect(nextFollowRequestCursor(page(FOLLOW_REQUESTS_PAGE_SIZE - 1), null)).toBeUndefined()
    })

    it('counts the next page off the cursor that produced this one', () => {
        expect(
            nextFollowRequestCursor(page(FOLLOW_REQUESTS_PAGE_SIZE), {
                page: ['3'],
                page_size: [String(FOLLOW_REQUESTS_PAGE_SIZE)],
            }),
        ).toEqual({ page: ['4'], page_size: [String(FOLLOW_REQUESTS_PAGE_SIZE)] })
    })

    it('prefers the `next` the payload carries over its own arithmetic', () => {
        const next =
            'https://api.tevi.com/core/v3/channel/my-channel/follow-requests/?page=7&page_size=20'
        expect(
            nextFollowRequestCursor(page(FOLLOW_REQUESTS_PAGE_SIZE, { next }), null),
        ).toMatchObject({ page: ['7'] })
    })
})

describe('removeFollowRequest', () => {
    it('takes the answered row out of every page and the total down with it', () => {
        const data = infinite(
            { results: [row('a'), row('b')], count: 5 },
            { results: [row('c')], count: 5 },
        )
        const next = removeFollowRequest(data, 'b')
        expect(next?.pages.flatMap(p => p.results.map(r => r.id))).toEqual(['a', 'c'])
        expect(next?.pages.map(p => p.count)).toEqual([4, 4])
    })

    it('returns the same object when the id is not there', () => {
        const data = infinite({ results: [row('a')], count: 1 })
        expect(removeFollowRequest(data, 'zzz')).toBe(data)
    })
})

describe('clearFollowRequests', () => {
    it('empties the list and zeroes the total', () => {
        const data = infinite(
            { results: [row('a'), row('b')], count: 40 },
            { results: [row('c')], count: 40 },
        )
        const next = clearFollowRequests(data)
        expect(next?.pages).toEqual([{ results: [], count: 0, next: null }])
    })

    /**
     * The load-bearing half: **one** page, not none. `pages: []` reads as a query that has never
     * resolved, so the view would drop back to its skeleton over an empty queue.
     */
    it('keeps one page, so the query stays loaded', () => {
        const next = clearFollowRequests(infinite(page(20), page(20)))
        expect(next?.pages).toHaveLength(1)
        expect(next?.pageParams).toHaveLength(1)
    })

    it('returns the same object when there was nothing to clear', () => {
        const data = infinite({ results: [], count: 0 })
        expect(clearFollowRequests(data)).toBe(data)
    })

    it('does nothing to an unloaded query', () => {
        expect(clearFollowRequests(undefined)).toBeUndefined()
    })
})
