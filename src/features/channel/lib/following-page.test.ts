import type { PageCursor } from '@shared/lib/api/page-cursor'
import type { InfiniteData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { FollowedChannel } from '../api/types'
import {
    FOLLOWED_LIVES_COLLAPSED,
    FOLLOWED_LIVES_LIMIT,
    FOLLOWING_FIRST_PAGE,
    FOLLOWING_LIMIT,
    FOLLOWING_PAGE_SIZE,
    FOLLOWING_WARN_AT,
    type FollowedChannelsPage,
    movePinnedFollowedChannel,
    nextFollowedCursor,
    patchFollowedChannel,
    removeFollowedChannel,
} from './following-page'

/**
 * The two failures this file exists for are both **silent**, which is why they are assertions rather
 * than review comments: a stop condition that never fires shows an infinite list re-requesting its
 * last page, and a removal that misses shows a row the server no longer has, with a menu whose every
 * item 404s. Neither throws.
 */

function row(slug: string, extra: Partial<FollowedChannel> = {}): FollowedChannel {
    return {
        id: `id-${slug}`,
        slug,
        name: slug,
        images: { thumb: null, cover: null, avatar_video: null },
        verified_tick_badge: null,
        is_premium: false,
        last_activity_at: null,
        pin: false,
        notification_settings: null,
        ...extra,
    } as FollowedChannel
}

function page(slugs: string[], count = slugs.length, next?: string | null): FollowedChannelsPage {
    return { results: slugs.map(slug => row(slug)), count, next }
}

function infinite(
    pages: FollowedChannelsPage[],
): InfiniteData<FollowedChannelsPage, PageCursor | null> {
    return { pages, pageParams: pages.map(() => null) }
}

describe('following page size', () => {
    /**
     * One constant feeding both the request and the stop condition. With the two out of step the
     * list either stops after page one or never stops at all — see the constant's own note.
     */
    it('asks for the page size the stop condition compares against', () => {
        expect(FOLLOWING_FIRST_PAGE).toEqual({
            page: ['1'],
            page_size: [String(FOLLOWING_PAGE_SIZE)],
        })
    })

    /** The warning has to be *under* the ceiling or it can never fire before the backend refuses. */
    it('warns below the limit it names', () => {
        expect(FOLLOWING_WARN_AT).toBeLessThan(FOLLOWING_LIMIT)
    })

    /** Equal, and there is no "Show more" to draw — the strip would silently lose its disclosure. */
    it('fetches more live streams than it shows collapsed', () => {
        expect(FOLLOWED_LIVES_COLLAPSED).toBeLessThan(FOLLOWED_LIVES_LIMIT)
    })
})

describe('nextFollowedCursor', () => {
    it('stops on an explicit null, even at an exact page multiple', () => {
        const full = page(
            Array.from({ length: FOLLOWING_PAGE_SIZE }, (_, i) => `s${i}`),
            40,
            null,
        )
        expect(nextFollowedCursor(full, FOLLOWING_FIRST_PAGE)).toBeUndefined()
    })

    it('stops on a short page, which is the rule that works with no `next` at all', () => {
        expect(nextFollowedCursor(page(['a', 'b']), FOLLOWING_FIRST_PAGE)).toBeUndefined()
    })

    /** Counted off the cursor that produced this page, never an internal counter — a refetch
     *  replays every page, and a counter would drift on each one. */
    it('counts from the cursor when the payload carries no `next`', () => {
        const full = page(
            Array.from({ length: FOLLOWING_PAGE_SIZE }, (_, i) => `s${i}`),
            40,
        )
        expect(nextFollowedCursor(full, FOLLOWING_FIRST_PAGE)).toEqual({
            page: ['2'],
            page_size: [String(FOLLOWING_PAGE_SIZE)],
        })
    })

    /**
     * **`undefined`, never `null`** — `null` is a legitimate page param, so returning it leaves
     * `hasNextPage` true forever and the sentinel re-fires against a list with nothing left.
     */
    it('never answers null', () => {
        expect(nextFollowedCursor(page([]), null)).not.toBeNull()
    })
})

describe('removeFollowedChannel', () => {
    it('drops the row from every page and takes the total with it', () => {
        const data = infinite([page(['a', 'b'], 3), page(['c'], 3)])
        const next = removeFollowedChannel(data, 'b')
        expect(next?.pages.flatMap(p => p.results.map(r => r.slug))).toEqual(['a', 'c'])
        expect(next?.pages.map(p => p.count)).toEqual([2, 2])
    })

    /** The second call for the same row — a double-tap the pending state missed, a retried
     *  mutation — must not re-render every subscriber. */
    it('returns the same object when the slug is not there', () => {
        const data = infinite([page(['a'])])
        expect(removeFollowedChannel(data, 'zzz')).toBe(data)
    })

    /** A `count` the backend was already under-reporting must not render as `-1`. */
    it('floors the total at zero', () => {
        const data = infinite([page(['a'], 0)])
        expect(removeFollowedChannel(data, 'a')?.pages[0]?.count).toBe(0)
    })

    /** Matched on **slug**, not id — every action on this screen addresses a row that way. */
    it('matches on the slug rather than the id', () => {
        const data = infinite([page(['a', 'b'])])
        expect(removeFollowedChannel(data, 'id-a')).toBe(data)
    })
})

describe('patchFollowedChannel', () => {
    it('writes the field and leaves the position and the total alone', () => {
        const data = infinite([page(['a', 'b'], 2)])
        const next = patchFollowedChannel(data, 'b', { pin: true })
        expect(next?.pages[0]?.results.map(r => r.slug)).toEqual(['a', 'b'])
        expect(next?.pages[0]?.results[1]?.pin).toBe(true)
        expect(next?.pages[0]?.count).toBe(2)
    })

    it('leaves every other row untouched', () => {
        const data = infinite([page(['a', 'b'])])
        const next = patchFollowedChannel(data, 'b', { pin: true })
        expect(next?.pages[0]?.results[0]).toBe(data.pages[0]?.results[0])
    })

    it('returns the same object when the slug is not there', () => {
        const data = infinite([page(['a'])])
        expect(patchFollowedChannel(data, 'zzz', { pin: true })).toBe(data)
    })

    it('handles an undefined cache, which is the state before the first page lands', () => {
        expect(patchFollowedChannel(undefined, 'a', { pin: true })).toBeUndefined()
        expect(removeFollowedChannel(undefined, 'a')).toBeUndefined()
    })
})

/**
 * The reorder, which exists because `POST .../pin/` returns before `GET followed-channels/` can see
 * it — so a refetch came back with the old order and the press looked like it had done nothing.
 * These pin the rule rather than the arithmetic: **pinned rows lead, most-recently-acted-on first,
 * and everything else keeps the order it arrived in.**
 */
describe('movePinnedFollowedChannel', () => {
    const slugs = (data: ReturnType<typeof infinite> | undefined) =>
        data?.pages.flatMap(p => p.results.map(r => `${r.slug}${r.pin ? '*' : ''}`))

    function withPins(spec: string[]): ReturnType<typeof infinite> {
        return infinite([
            {
                results: spec.map(s => row(s.replace('*', ''), { pin: s.endsWith('*') })),
                count: spec.length,
                next: null,
            },
        ])
    }

    it('sends a pinned row to the very top', () => {
        const data = withPins(['a', 'b', 'c'])
        expect(slugs(movePinnedFollowedChannel(data, 'c', true))).toEqual(['c*', 'a', 'b'])
    })

    it('puts the newest pin above the older ones', () => {
        const data = withPins(['a*', 'b', 'c'])
        expect(slugs(movePinnedFollowedChannel(data, 'c', true))).toEqual(['c*', 'a*', 'b'])
    })

    /** Unpin drops it to the head of the unpinned run — under the pins that remain, not to the end. */
    it('drops an unpinned row just below the remaining pins', () => {
        const data = withPins(['a*', 'b*', 'c', 'd'])
        expect(slugs(movePinnedFollowedChannel(data, 'a', false))).toEqual(['b*', 'a', 'c', 'd'])
    })

    it('handles unpinning the only pin', () => {
        const data = withPins(['a*', 'b', 'c'])
        expect(slugs(movePinnedFollowedChannel(data, 'a', false))).toEqual(['a', 'b', 'c'])
    })

    /** Every other row pinned: the unpinned run is empty, so the head of it is the end. */
    it('handles unpinning when everything else is pinned', () => {
        const data = withPins(['a*', 'b*', 'c*'])
        expect(slugs(movePinnedFollowedChannel(data, 'b', false))).toEqual(['a*', 'c*', 'b'])
    })

    /**
     * It never compares two rows, so the order the server sent survives intact — which is what makes
     * it correct under *both* orderings. Legacy re-sorts by `last_activity_at`, one of the two.
     */
    it('re-sorts nothing else', () => {
        const data = withPins(['a', 'b', 'c', 'd'])
        expect(slugs(movePinnedFollowedChannel(data, 'd', true))).toEqual(['d*', 'a', 'b', 'c'])
    })

    /** A pinned row on page two belongs at the top of page one — the move crosses pages, and the
     *  page *lengths* stay exactly as they were so nothing about the pagination shifts. */
    it('moves a row across pages and keeps the page shapes', () => {
        const data = infinite([page(['a', 'b'], 4), page(['c', 'd'], 4)])
        const next = movePinnedFollowedChannel(data, 'd', true)
        expect(next?.pages.map(p => p.results.map(r => r.slug))).toEqual([
            ['d', 'a'],
            ['b', 'c'],
        ])
        expect(next?.pages.map(p => p.results.length)).toEqual([2, 2])
        expect(next?.pages.map(p => p.count)).toEqual([4, 4])
        expect(next?.pageParams).toEqual(data.pageParams)
    })

    it('returns the same object when the slug is not there', () => {
        const data = withPins(['a'])
        expect(movePinnedFollowedChannel(data, 'zzz', true)).toBe(data)
    })

    it('handles an undefined cache', () => {
        expect(movePinnedFollowedChannel(undefined, 'a', true)).toBeUndefined()
    })
})
