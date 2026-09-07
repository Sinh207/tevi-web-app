import type { PageCursor } from '@shared/lib/api/page-cursor'
import { describe, expect, it } from 'vitest'
import type { SearchChannel } from '../api/types'
import {
    nextSearchCursor,
    SEARCH_FIRST_PAGE,
    SEARCH_PAGE_SIZE,
    type SearchChannelsPage,
} from './search-page'

/**
 * The stop condition, which is the one thing on this screen that fails **loudly to nobody**: a
 * `getNextPageParam` that never returns `undefined` leaves `hasNextPage` true forever, and the
 * intersection sentinel then re-requests the last page for as long as the reader sits at the
 * bottom of the list. Nothing throws; the network tab is the only place it shows.
 *
 * The rules themselves live in `shared/lib/api/paged-list.ts` and are tested there. What is
 * pinned here is that **this list's page size is wired through both places it has to be** — the
 * first request's params and the short-page comparison. Getting those out of step is the other
 * silent failure: the list stops after one page, or never stops.
 */

function page(rows: number, next?: string | null): SearchChannelsPage {
    return {
        results: Array.from({ length: rows }, (_, index) => ({
            slug: `space-${index}`,
        })) as SearchChannel[],
        count: rows,
        next,
    }
}

const cursor = (n: number): PageCursor => ({
    page: [String(n)],
    page_size: [String(SEARCH_PAGE_SIZE)],
})

describe('SEARCH_FIRST_PAGE', () => {
    /**
     * `page` is explicit rather than left to the server's default, because the fallback cursor
     * counts from it — a first page with no `page` param has nothing to add 1 to.
     */
    it('asks for page 1 at the page size', () => {
        expect(SEARCH_FIRST_PAGE).toEqual({ page: ['1'], page_size: [String(SEARCH_PAGE_SIZE)] })
    })
})

describe('nextSearchCursor', () => {
    it('stops on an explicit next: null even when the page is full', () => {
        expect(nextSearchCursor(page(SEARCH_PAGE_SIZE, null), cursor(1))).toBeUndefined()
    })

    it('stops on a short page, which is the only rule that works with no `next` key', () => {
        expect(nextSearchCursor(page(SEARCH_PAGE_SIZE - 1), cursor(1))).toBeUndefined()
        expect(nextSearchCursor(page(0), cursor(1))).toBeUndefined()
    })

    /**
     * The backend's own `next`, reduced to its query — the URL is never fetched, because it is
     * absolute and may carry an internal hostname or miss `origins.ts` and silently lose the
     * bearer. See `page-cursor.ts`.
     */
    it('prefers the query of the backend’s own next URL', () => {
        const next = nextSearchCursor(
            page(SEARCH_PAGE_SIZE, 'https://api.tevi.com/search/v3/channel/?page=2&q=ada'),
            cursor(1),
        )
        expect(next).toEqual({ page: ['2'], q: ['ada'] })
    })

    /** No `next` at all: count off the cursor that produced this page. */
    it('falls back to page + 1, counted from the cursor rather than from a counter', () => {
        expect(nextSearchCursor(page(SEARCH_PAGE_SIZE), cursor(3))).toEqual(cursor(4))
        // A refetch replays page one with a `null` param; the fallback must still say 2.
        expect(nextSearchCursor(page(SEARCH_PAGE_SIZE), null)).toEqual(cursor(2))
    })

    /**
     * `undefined`, never `null` — `null` is a legitimate page param, so returning it is what
     * leaves `hasNextPage` true against a list with nothing left.
     */
    it('returns undefined rather than null when there is no next page', () => {
        expect(nextSearchCursor(page(1, null), cursor(1))).not.toBeNull()
        expect(nextSearchCursor(page(1, null), cursor(1))).toBeUndefined()
    })
})
