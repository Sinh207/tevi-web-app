import type { Post } from '@features/post'

/**
 * A run of consecutive posts from one space, close enough together to read as one act of posting.
 *
 * ## Why the feed groups at all
 *
 * A creator uploading five photographs one after another produces five rows, and without grouping
 * they push everybody else off the screen. Legacy collapses such a run into a single card with a
 * *See more*, which is the whole reason `PostCard` takes an `onSeeMore`.
 *
 * ## The rule, and both halves of it
 *
 * **Same channel, and within five minutes of the group's anchor.** Neither alone is enough: time
 * alone would merge two different creators posting in the same minute, and channel alone would
 * merge a space's post from today with its post from last week the moment nobody else posted in
 * between.
 *
 * `GROUP_WINDOW_MS` is legacy's `GROUP_TIME_THRESHOLD` (300 seconds).
 */
export interface PostGroup {
    /** The space these posts belong to. `null` for rows whose channel did not parse. */
    channelId: string | null
    /** The **anchor** — the first post's timestamp, which later posts are measured against. */
    createdAt: string | null
    posts: Post[]
}

export const GROUP_WINDOW_MS = 5 * 60 * 1000

/**
 * How many posts a group shows before it offers *See more*.
 *
 * ⚠ **Legacy renders *one* here, not three, and the two numbers in its code disagree.**
 *
 * `PostGroup` renders `posts[0]` alone when `posts.length > 3 && !isExpanded`, while
 * `useTabPosts.totalVisiblePosts` counts `Math.min(group.posts.length, 3)` for the same group. One
 * of the two is wrong and it is the counter: it feeds the "have I filled a screen yet" heuristic,
 * so a feed of four-post groups thinks it is showing three times what it draws and stops asking for
 * more pages too early — which is how home ends up with a short feed and no scroll.
 *
 * This module follows the **renderer** (collapsed shows one) and counts the same number, so the
 * two cannot disagree. `COLLAPSE_ABOVE` is the threshold; a group of exactly three still shows all
 * three, as legacy's renderer does.
 */
export const COLLAPSE_ABOVE = 3

/**
 * Fold a page of posts into the groups built so far.
 *
 * ## Append-only, and it must be
 *
 * The feed is an infinite list: page two arrives after page one is on screen, and a post from page
 * two can legitimately belong to the **last group of page one** — a creator's run that straddles
 * the page boundary. So this takes the existing groups and extends them rather than regrouping
 * everything, which is also what keeps a re-render from re-deriving the whole feed.
 *
 * Only the **last** group is a merge candidate. The feed is ordered, so a post that does not join
 * the tail cannot belong to anything earlier — and checking every group would make a feed of a
 * thousand posts quadratic for a case the ordering rules out.
 *
 * ## The anchor does not move
 *
 * Each post is measured against the group's `createdAt`, which is the **first** post's, not the
 * previous one's. Measuring against the previous post would let a slow drip of posts four minutes
 * apart chain into one group spanning an hour — legacy compares against `lastGroup.createdAt` and
 * never updates it, so this is its behaviour as well as the sensible one.
 *
 * A post with no timestamp, or a channel with no id, starts its own group: neither can be compared,
 * and merging on `null === null` would fold every unparseable row into one card.
 */
export function groupPosts(groups: PostGroup[], posts: Post[]): PostGroup[] {
    if (posts.length === 0) return groups

    const next = [...groups]

    for (const post of posts) {
        const channelId = post.channel?.id ?? null
        const createdAt = post.created_at
        const last = next[next.length - 1]

        if (
            last &&
            channelId !== null &&
            createdAt !== null &&
            canMerge(last, channelId, createdAt)
        ) {
            // Replaced rather than mutated: the array is rendered, and React compares by identity.
            next[next.length - 1] = { ...last, posts: [...last.posts, post] }
            continue
        }

        next.push({ channelId, createdAt, posts: [post] })
    }

    return next
}

function canMerge(group: PostGroup, channelId: string, createdAt: string): boolean {
    if (group.channelId !== channelId) return false
    if (group.createdAt === null) return false

    const anchor = Date.parse(group.createdAt)
    const time = Date.parse(createdAt)
    // An unparseable date is not "zero apart" — it is unknown, and unknown must not merge.
    if (Number.isNaN(anchor) || Number.isNaN(time)) return false

    return Math.abs(time - anchor) <= GROUP_WINDOW_MS
}

/**
 * A group's identity, for anything that has to remember something about it across renders.
 *
 * ⚠ **Never its index.** The list is filtered (`withoutChannel`, when a space is blocked) and it
 * grows from both ends over time, so an index points at a different group the moment either
 * happens — legacy keys both its expand state *and* its measured heights by index, and a block
 * therefore closes the group the reader opened and opens one they did not. iOS keys its height
 * cache by `post.id` for exactly this reason.
 *
 * The first post's id is the natural key: `groupPosts` never produces an empty group, a post's id
 * is unique, and a group's first post does not change — later posts join at the tail.
 */
export function groupKey(group: PostGroup): string {
    return group.posts[0].id
}

/** Whether this group hides anything behind a *See more*. */
export function isCollapsible(group: PostGroup): boolean {
    return group.posts.length > COLLAPSE_ABOVE
}

/**
 * The posts a group actually draws.
 *
 * Collapsed groups show **one**, per the note on `COLLAPSE_ABOVE`. Expanded ones show everything —
 * there is no second step, so *See more* reveals the whole run rather than three more at a time.
 */
export function visiblePosts(group: PostGroup, expanded: boolean): Post[] {
    return isCollapsible(group) && !expanded ? group.posts.slice(0, 1) : group.posts
}

/**
 * How many cards the feed is currently drawing.
 *
 * The number the "do I have enough to fill a screen" check reads, and the one legacy computes
 * inconsistently with its own renderer. Derived from `visiblePosts` rather than recomputed, so the
 * two cannot drift again.
 */
export function visibleCount(groups: PostGroup[], expanded: ReadonlySet<string>): number {
    return groups.reduce(
        (total, group) => total + visiblePosts(group, expanded.has(groupKey(group))).length,
        0,
    )
}

/**
 * Drop every group belonging to one space.
 *
 * What a successful **block** does to the feed: the reader has said they do not want to see this
 * person, and leaving their posts on screen until the next refetch is the one outcome that makes
 * the action look broken. Legacy does the same (`filterOutChannel`).
 *
 * Reporting is deliberately **not** wired to this. Legacy's report path also unfollows the space
 * and strips it from the feed; that is a product decision this app has not made — its report dialog
 * offers *Report* and *Report and block* as separate buttons, so blocking is the one that removes
 * anything.
 */
export function withoutChannel(groups: PostGroup[], channelId: string): PostGroup[] {
    return groups.filter(group => group.channelId !== channelId)
}

/**
 * `next`, with every group that did not change swapped for the object `previous` already held.
 *
 * The feed regroups **all** pages whenever one arrives — it has to, a run can straddle the seam —
 * so every group is a new object after every page, and every memoised row in `HomePostFeed`
 * re-rendered on each append: twenty new posts cost the whole mounted feed. TanStack Query already
 * keeps the old pages' post objects (structural sharing), so a group whose posts are the same
 * objects in the same order is the same group, and keeping its identity is what lets the row skip.
 *
 * The one group that does change on an append is the last one, when the new page continues its
 * run — that one is new, correctly.
 */
export function reuseGroups(previous: readonly PostGroup[], next: PostGroup[]): PostGroup[] {
    if (previous.length === 0) return next
    const byKey = new Map(previous.map(group => [groupKey(group), group]))
    return next.map(group => {
        const old = byKey.get(groupKey(group))
        return old && sameGroup(old, group) ? old : group
    })
}

function sameGroup(a: PostGroup, b: PostGroup): boolean {
    return (
        a.channelId === b.channelId &&
        a.createdAt === b.createdAt &&
        a.posts.length === b.posts.length &&
        a.posts.every((post, index) => post === b.posts[index])
    )
}
