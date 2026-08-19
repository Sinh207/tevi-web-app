import type { InfiniteData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { BlockedAccount } from '../api/types'
import {
    BLOCKED_FIRST_PAGE,
    BLOCKED_PAGE_SIZE,
    type BlockedAccountsPage,
    nextBlockedCursor,
    removeBlockedAccount,
} from './blocked-accounts-page'
import type { ThreadCursor } from './next-page-param'

/**
 * Both functions here fail *silently* when they are wrong — an unending list that re-requests
 * its last page, or a row the server has already deleted staying on screen — so the cases that
 * matter are the boundaries, not the happy path.
 */

function row(id: string): BlockedAccount {
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

function page(count: number, extra: Partial<BlockedAccountsPage> = {}): BlockedAccountsPage {
    return {
        results: Array.from({ length: count }, (_, index) => row(`b${index}`)),
        count: 100,
        ...extra,
    }
}

describe('nextBlockedCursor', () => {
    it('stops when the API says `next` is null, even on a full page', () => {
        // The exact-multiple case: 20 rows and no next page. Without the null check this
        // would cost a request that comes back empty on every list of 20, 40, 60…
        expect(nextBlockedCursor(page(BLOCKED_PAGE_SIZE, { next: null }), null)).toBeUndefined()
    })

    it('stops on a short page when the payload has no `next` at all', () => {
        expect(nextBlockedCursor(page(BLOCKED_PAGE_SIZE - 1), null)).toBeUndefined()
    })

    it('stops on an empty page', () => {
        expect(nextBlockedCursor(page(0), null)).toBeUndefined()
    })

    it('parses `next` when the payload carries one', () => {
        const next = 'https://api.tevi.com/core/v3/channel/my-channel/blocks/?page=2&page_size=20'
        expect(nextBlockedCursor(page(BLOCKED_PAGE_SIZE, { next }), BLOCKED_FIRST_PAGE)).toEqual({
            page: ['2'],
            page_size: ['20'],
        })
    })

    it('drops our own `verify` out of a parsed `next`', () => {
        // Replaying a stale HMAC is worse than sending none — the interceptor mints a fresh
        // one per request, and two `verify` params in the query are ambiguous.
        const next = 'https://api.tevi.com/x/?page=3&verify=abc123'
        expect(nextBlockedCursor(page(BLOCKED_PAGE_SIZE, { next }), null)).toEqual({
            page: ['3'],
        })
    })

    it('counts pages itself when the payload has no `next`', () => {
        expect(nextBlockedCursor(page(BLOCKED_PAGE_SIZE), BLOCKED_FIRST_PAGE)).toEqual({
            page: ['2'],
            page_size: [String(BLOCKED_PAGE_SIZE)],
        })
    })

    it('counts from the cursor it was given, not from a counter', () => {
        const third: ThreadCursor = { page: ['3'], page_size: ['20'] }
        expect(nextBlockedCursor(page(BLOCKED_PAGE_SIZE), third)).toEqual({
            page: ['4'],
            page_size: ['20'],
        })
    })

    it('falls back to page 2 when the cursor carries an unusable page number', () => {
        const broken: ThreadCursor = { page: ['not-a-number'] }
        expect(nextBlockedCursor(page(BLOCKED_PAGE_SIZE), broken)).toEqual({
            page: ['2'],
            page_size: [String(BLOCKED_PAGE_SIZE)],
        })
    })
})

describe('removeBlockedAccount', () => {
    function data(...pages: BlockedAccountsPage[]) {
        return {
            pages,
            pageParams: pages.map(() => null),
        } as InfiniteData<BlockedAccountsPage, ThreadCursor | null>
    }

    it('is a no-op on undefined', () => {
        expect(removeBlockedAccount(undefined, 'b1')).toBeUndefined()
    })

    it('returns the same object when the id is not there', () => {
        // Identity, not equality: `setQueryData` re-renders every subscriber on a new
        // reference, and a second call for the same row must not cost the list a render.
        const before = data({ results: [row('b1')], count: 1 })
        expect(removeBlockedAccount(before, 'nope')).toBe(before)
    })

    it('removes the row and takes the total down with it', () => {
        const after = removeBlockedAccount(
            data({ results: [row('b1'), row('b2')], count: 2 }),
            'b1',
        )
        expect(after?.pages[0].results.map(r => r.id)).toEqual(['b2'])
        expect(after?.pages[0].count).toBe(1)
    })

    it('decrements `count` on every page, since it is the total and lives on all of them', () => {
        const after = removeBlockedAccount(
            data({ results: [row('b1')], count: 40 }, { results: [row('b2')], count: 40 }),
            'b2',
        )
        expect(after?.pages.map(p => p.count)).toEqual([39, 39])
        expect(after?.pages[1].results).toEqual([])
    })

    it('floors `count` at zero rather than rendering a negative total', () => {
        const after = removeBlockedAccount(data({ results: [row('b1')], count: 0 }), 'b1')
        expect(after?.pages[0].count).toBe(0)
    })

    it('does not mutate the cached pages in place', () => {
        const before = data({ results: [row('b1'), row('b2')], count: 2 })
        removeBlockedAccount(before, 'b1')
        expect(before.pages[0].results).toHaveLength(2)
    })
})
