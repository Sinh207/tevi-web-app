'use client'

import { useAuth } from '@features/auth'
import type { Post } from '@features/post'
import { nextPageParam, type PageCursor } from '@shared/lib/api/page-cursor'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { homeApi, homeKeys } from '../api/home-api'
import { groupPosts, type PostGroup, reuseGroups, visibleCount } from '../lib/post-groups'

/**
 * The home feed: the posts of every space this account follows, grouped and paginated.
 *
 * ## The grouping is derived, not stored
 *
 * Legacy keeps `groupedPosts` in `useState` and folds each page into it as it arrives — which means
 * the feed is a second copy of the server's data living in component state, and every one of the
 * eight event-emitter handlers it wires up exists to patch that copy when something changes
 * elsewhere. `CLAUDE.md` bars exactly that: server state is TanStack Query's, and nothing mirrors it.
 *
 * Here the query owns the pages and `groupPosts` is run over them in a `useMemo`. An invalidation
 * therefore fixes the feed on its own — which is what `usePostActions` and `usePostUnlock` already
 * do (`postKeys.all`), so a delete, a pin, an unlock or a block corrects this list without home
 * knowing those actions exist.
 *
 * The fold is `O(n)` over posts and runs when the pages change, not per render.
 *
 * ## Blocking is the one thing state still holds
 *
 * A blocked space's posts have to leave the feed **immediately**, and the query cannot deliver that:
 * the invalidation refetches from page one, which both loses the reader's scroll position and, until
 * the backend's own filter catches up, can return the same posts. So the ids of blocked spaces are
 * kept locally and filtered out on read. It is a filter over server data, not a copy of it — the
 * distinction that keeps this on the right side of the rule.
 *
 * ## Why it keeps asking for pages
 *
 * A page of twenty posts can render as **one** card: twenty posts from one creator inside five
 * minutes is a single collapsed group. So a feed that stopped after one page could land the reader
 * on a screen with nothing to scroll and no way to ask for more. `needsMore` is that check, and it
 * is expressed in *cards drawn* rather than posts fetched, which is the number legacy gets wrong
 * (see `COLLAPSE_ABOVE`).
 *
 * It is bounded by `hasNextPage`, so a genuinely short feed stops rather than looping.
 */
const MIN_CARDS = 4

/**
 * `publicFeed` is the server's anonymous read of the same endpoint (`getPublicFeedForRequest`),
 * shown to a reader who is **not signed in** — the guest and the crawler, who otherwise got a sign-in
 * prompt and nothing else. It is one page, and deliberately stays one: the browser cannot ask for a
 * second, because the public gateway answers this path with an empty list for a guest's anonymous
 * bearer. A signed-in reader never sees it — their feed is theirs, fetched as them.
 *
 * Read as `!isAuthenticated`, which includes the bootstrap: the server renders before anyone is
 * known, so that is the branch the HTML is built from, and the first client render has to agree with
 * it. A signed-in reader spends the bootstrap behind the splash, as they did before.
 */
export function useHomeFeed({ publicFeed = null }: { publicFeed?: readonly Post[] | null } = {}) {
    const { activeId, isAuthenticated } = useAuth()
    const showPublic = !isAuthenticated && !!publicFeed && publicFeed.length > 0

    /**
     * Groups the reader has opened with *See more*, by `groupKey` — **not** by index.
     *
     * `hideChannel` removes groups from the middle of the list, so an index stops pointing at the
     * group it was recorded for: blocking a space above an opened group would close that group and
     * open whichever one slid into its place. Legacy keys this by index and has exactly that bug.
     */
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
    /** Spaces blocked in this session — see the note above on why this is not an invalidation. */
    const [blocked, setBlocked] = useState<ReadonlySet<string>>(() => new Set())

    const query = useInfiniteQuery({
        queryKey: homeKeys.feed(activeId),
        initialPageParam: null as PageCursor | null,
        queryFn: ({ pageParam, signal }) =>
            homeApi.getFeed({ cursor: pageParam, accountId: activeId, signal }),
        /*
         * `undefined` stops TanStack Query and `null` does not — returning `null` on the last page
         * leaves `hasNextPage` true forever and lets the sentinel re-fire against a list with
         * nothing left in it. `nextPageParam` wraps that one detail.
         */
        getNextPageParam: last => nextPageParam(last.next),
        /*
         * **Accounts only.** Legacy asks with whatever bearer the visitor carries, and a guest does
         * see posts there — but not from this request: the public gateway answers
         * `followed-channels/threads/` with an empty list for an anonymous bearer (measured on
         * staging). A guest's page is `publicFeed`, read by the server inside the cluster, so asking
         * again from the browser would only cost a request.
         */
        enabled: isAuthenticated,
    })

    /* The last answer, so an unchanged group keeps its identity — `reuseGroups` says why. */
    const previousGroups = useRef<readonly PostGroup[]>([])
    const groups = useMemo(() => {
        const pages = query.data?.pages ?? []
        /*
         * Folded across **all** pages in one pass rather than per page, which is what lets a
         * creator's run straddle a page boundary and still read as one group. Folding per page and
         * concatenating would split every such run at the seam.
         */
        const all = groupPosts(
            [],
            showPublic ? [...publicFeed] : pages.flatMap(page => page.results),
        )
        const next = reuseGroups(
            previousGroups.current,
            blocked.size === 0 ? all : all.filter(g => !g.channelId || !blocked.has(g.channelId)),
        )
        previousGroups.current = next
        return next
    }, [query.data, blocked, showPublic, publicFeed])

    const cards = visibleCount(groups, expanded)

    const toggleGroup = useCallback((key: string) => {
        setExpanded(current => {
            const next = new Set(current)
            if (!next.delete(key)) next.add(key)
            return next
        })
    }, [])

    const hideChannel = useCallback((channelId: string) => {
        setBlocked(current => new Set(current).add(channelId))
    }, [])

    return {
        groups,
        expanded,
        toggleGroup,
        hideChannel,
        // A guest never waits on this query — their page, if any, came from the server.
        isLoading: isAuthenticated && query.isLoading,
        isError: query.isError,
        refetch: query.refetch,
        fetchNextPage: query.fetchNextPage,
        // The public page is the only one there is — see `publicFeed` above.
        hasNextPage: showPublic ? false : query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        /**
         * Too few cards on screen to scroll, and there is another page to ask for.
         *
         * The view acts on this the same way it acts on the sentinel — the two are the same request
         * for the same reason, one triggered by geometry and one by arithmetic.
         */
        needsMore:
            !showPublic &&
            cards < MIN_CARDS &&
            query.hasNextPage &&
            !query.isLoading &&
            !query.isFetchingNextPage,
        /**
         * `true` only once the first page has come back **and** held nothing. Distinct from
         * `isLoading`: an empty state shown while a request is in flight tells the reader there is
         * nothing here when nobody knows that yet.
         */
        /*
         * Empty is legacy's `NoPost` ("Oops, your Home is a little lonely.", *Discover creators*)
         * for **everybody** — a guest included. An account's feed is empty once its first page came
         * back with nothing; a guest's is empty when the server had no public page to show
         * (`publicFeed`), since the browser does not ask on a guest's behalf. There is no separate
         * signed-out state on this tab.
         */
        isEmpty: groups.length === 0 && (isAuthenticated ? query.isSuccess : !showPublic),
        /** Showing the server's anonymous page rather than this reader's own feed. */
        isPublic: showPublic,
    }
}
