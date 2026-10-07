import { normalizePost, type Post } from '@features/post'
import { describe, expect, it } from 'vitest'
import {
    COLLAPSE_ABOVE,
    groupKey,
    groupPosts,
    isCollapsible,
    reuseGroups,
    visibleCount,
    visiblePosts,
    withoutChannel,
} from './post-groups'

/**
 * Fixtures go through the parser, as `features/post`'s own do.
 *
 * It matters more here than usual: `created_at` is a **normalised ISO string** by the time the card
 * sees it (`nullableTimestamp` converts epoch milliseconds), and this module compares those strings
 * with `Date.parse`. A hand-typed fixture carrying a raw epoch number would pass tests against a
 * payload shape the app never produces.
 */
function post(overrides: { id: string; channel?: string | null; at?: number | null }): Post {
    const parsed = normalizePost({
        id: overrides.id,
        created_at: overrides.at === undefined ? BASE : overrides.at,
        channel: overrides.channel === null ? null : { id: overrides.channel ?? 'ch-1' },
    })
    if (!parsed) throw new Error('fixture did not parse')
    return parsed
}

/** An arbitrary fixed instant; every offset below is relative to it. */
const BASE = 1_760_000_000_000
const MINUTES = (n: number) => BASE + n * 60_000

describe('groupPosts', () => {
    it('merges consecutive posts from one space inside the window', () => {
        const groups = groupPosts(
            [],
            [
                post({ id: 'a' }),
                post({ id: 'b', at: MINUTES(2) }),
                post({ id: 'c', at: MINUTES(4) }),
            ],
        )

        expect(groups).toHaveLength(1)
        expect(groups[0].posts.map(p => p.id)).toEqual(['a', 'b', 'c'])
    })

    it('starts a new group for a different space, however close in time', () => {
        const groups = groupPosts(
            [],
            [post({ id: 'a' }), post({ id: 'b', channel: 'ch-2', at: BASE + 1000 })],
        )
        expect(groups.map(g => g.channelId)).toEqual(['ch-1', 'ch-2'])
    })

    it('starts a new group past the five-minute window', () => {
        const groups = groupPosts([], [post({ id: 'a' }), post({ id: 'b', at: MINUTES(6) })])
        expect(groups).toHaveLength(2)
    })

    /**
     * The anchor is the **first** post's timestamp and never moves. Measuring against the previous
     * post instead would let a drip of posts four minutes apart chain into one group spanning an
     * hour — the failure mode is a card that hides an afternoon of posting behind one *See more*.
     */
    it('measures against the group anchor, not the previous post', () => {
        const groups = groupPosts(
            [],
            [
                post({ id: 'a' }),
                post({ id: 'b', at: MINUTES(4) }),
                // Four minutes after `b`, but eight after the anchor — so it does not join.
                post({ id: 'c', at: MINUTES(8) }),
            ],
        )
        expect(groups).toHaveLength(2)
        expect(groups[0].posts.map(p => p.id)).toEqual(['a', 'b'])
        expect(groups[1].posts.map(p => p.id)).toEqual(['c'])
    })

    /**
     * Page two arriving after page one is the case the append-only signature exists for: a
     * creator's run can straddle the boundary, and regrouping per page would split it at the seam.
     */
    it('merges a run that straddles a page boundary', () => {
        const first = groupPosts([], [post({ id: 'a' })])
        const second = groupPosts(first, [post({ id: 'b', at: MINUTES(1) })])

        expect(second).toHaveLength(1)
        expect(second[0].posts.map(p => p.id)).toEqual(['a', 'b'])
    })

    /** Only the tail is a merge candidate — the feed is ordered, so nothing earlier can match. */
    it('never merges into a group that is not the last', () => {
        const groups = groupPosts(
            [],
            [
                post({ id: 'a' }),
                post({ id: 'b', channel: 'ch-2' }),
                // Same space and same instant as `a`, but `ch-2` is now the tail.
                post({ id: 'c' }),
            ],
        )
        expect(groups.map(g => g.posts.map(p => p.id))).toEqual([['a'], ['b'], ['c']])
    })

    /**
     * Rows that cannot be compared start their own group. Merging on `null === null` would fold
     * every unparseable row in the feed into a single card.
     */
    it('does not merge rows with no channel or no timestamp', () => {
        const groups = groupPosts(
            [],
            [post({ id: 'a', channel: null }), post({ id: 'b', channel: null })],
        )
        expect(groups).toHaveLength(2)

        const undated = groupPosts([], [post({ id: 'c', at: null }), post({ id: 'd', at: null })])
        expect(undated).toHaveLength(2)
    })

    it('returns the groups unchanged for an empty page', () => {
        const groups = groupPosts([], [post({ id: 'a' })])
        expect(groupPosts(groups, [])).toBe(groups)
    })

    /** The array is rendered, and React compares by identity — a mutated group would not re-render. */
    it('replaces the merged group rather than mutating it', () => {
        const first = groupPosts([], [post({ id: 'a' })])
        const second = groupPosts(first, [post({ id: 'b', at: MINUTES(1) })])

        expect(second[0]).not.toBe(first[0])
        expect(first[0].posts).toHaveLength(1)
    })
})

describe('visiblePosts', () => {
    const run = (n: number) =>
        groupPosts(
            [],
            Array.from({ length: n }, (_, i) => post({ id: `p${i}`, at: BASE + i * 1000 })),
        )[0]

    it('draws a group whole up to the threshold', () => {
        for (let n = 1; n <= COLLAPSE_ABOVE; n++) {
            expect(visiblePosts(run(n), false)).toHaveLength(n)
            expect(isCollapsible(run(n))).toBe(false)
        }
    })

    /**
     * Above the threshold a collapsed group draws **one**, which is legacy's renderer. Its own
     * counter says three for the same group; the mismatch feeds the "have I filled a screen"
     * heuristic and makes the feed stop asking for pages too early.
     */
    it('draws exactly one card for a collapsed run, and all of them once expanded', () => {
        const group = run(5)
        expect(isCollapsible(group)).toBe(true)
        expect(visiblePosts(group, false).map(p => p.id)).toEqual(['p0'])
        expect(visiblePosts(group, true)).toHaveLength(5)
    })
})

describe('visibleCount', () => {
    it('counts what is drawn, collapsed groups included', () => {
        const groups = groupPosts(
            [],
            [
                // A run of four from ch-1 → collapses to one card.
                ...Array.from({ length: 4 }, (_, i) => post({ id: `a${i}`, at: BASE + i * 1000 })),
                // Two from ch-2 → drawn whole.
                post({ id: 'b0', channel: 'ch-2', at: MINUTES(10) }),
                post({ id: 'b1', channel: 'ch-2', at: MINUTES(11) }),
            ],
        )

        expect(groups).toHaveLength(2)
        expect(visibleCount(groups, new Set())).toBe(1 + 2)
        // Expanding the first group reveals its other three. Keyed by `groupKey`, not by index —
        // see its own note on why an index cannot survive a block.
        expect(visibleCount(groups, new Set([groupKey(groups[0])]))).toBe(4 + 2)
    })
})

describe('withoutChannel', () => {
    it('drops every group belonging to one space and keeps the rest', () => {
        const groups = groupPosts(
            [],
            [
                post({ id: 'a' }),
                post({ id: 'b', channel: 'ch-2', at: MINUTES(10) }),
                post({ id: 'c', at: MINUTES(20) }),
            ],
        )

        const left = withoutChannel(groups, 'ch-1')
        expect(left).toHaveLength(1)
        expect(left[0].channelId).toBe('ch-2')
    })
})

describe('reuseGroups', () => {
    const a = post({ id: 'a', channel: 'ch-1' })
    const b = post({ id: 'b', channel: 'ch-1', at: MINUTES(1) })
    const c = post({ id: 'c', channel: 'ch-2', at: MINUTES(2) })
    const d = post({ id: 'd', channel: 'ch-2', at: MINUTES(3) })
    const e = post({ id: 'e', channel: 'ch-3', at: MINUTES(4) })

    it('keeps the object of every group an appended page did not touch', () => {
        const first = groupPosts([], [a, b, c])
        const second = reuseGroups(first, groupPosts([], [a, b, c, d, e]))

        // `a, b` is untouched: same object, which is what lets its memoised row skip.
        expect(second[0]).toBe(first[0])
        // The page continued `c`'s run, so that group really did change.
        expect(second[1]).not.toBe(first[1])
        expect(second[1].posts).toEqual([c, d])
        expect(second[2].posts).toEqual([e])
    })

    it('treats a post replaced by a refetch as a change', () => {
        const first = groupPosts([], [a, b])
        const edited = post({ id: 'b', channel: 'ch-1', at: MINUTES(1) })
        expect(reuseGroups(first, groupPosts([], [a, edited]))[0]).not.toBe(first[0])
    })

    it('returns the new list as it is on the first answer', () => {
        const next = groupPosts([], [a])
        expect(reuseGroups([], next)).toBe(next)
    })
})
