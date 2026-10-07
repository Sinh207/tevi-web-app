import { ChannelEmptyState } from '@features/channel'
import {
    SEARCH_ART,
    SEARCH_CONTAINER,
    type SearchChannel,
    SearchFollowingSkeleton,
    SearchSkeleton,
} from '@features/search'
import { ListHeader, ListHeaderTitle } from '@shared/ui/list'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SearchPreview } from './preview'

export const metadata: Metadata = {
    title: 'Search',
    robots: { index: false, follow: false },
}

/**
 * Dev-only preview of `/search`'s parts: `pnpm dev`, then open /dev/search. 404s in production
 * (`proxy.ts` stops the request; the `notFound()` below is the belt to that braces).
 *
 * It exists for the reason `/dev/blocked-accounts` does — most of these states are otherwise
 * **unreachable without a live search service and a signed-in account that follows somebody whose
 * name matches what you type**. The Following grid in particular needs all three at once, and it
 * is the one part of the screen with geometry nobody has seen: `auto-fill` tracks, so the column
 * count is the window's rather than a breakpoint's, and the fixture below is deliberately large
 * enough to wrap.
 *
 * What it deliberately does **not** preview is `SearchView` itself — that component owns two
 * queries and a debounce, and a version of it that did not would be a second implementation of the
 * screen with its own drift. Type into the real `/search` for that. The states it adds (idle,
 * error) are `ChannelEmptyState` with different copy, and both are below.
 *
 * Every section that needs a **callback** lives in `preview.tsx` behind `'use client'`, and that
 * is a hard requirement rather than tidiness: a function cannot cross the server→client boundary,
 * so handing one to `SearchChannelRow` from here throws at render — while still answering 200. See
 * that file.
 *
 * The copy here is **English literals on purpose**: these are fixtures, and running them through
 * `t()` would mean a server component reading nine locale bundles to render a page that 404s in
 * production.
 */

/** Fixtures, covering the payload shapes a row has to survive rather than four nice names. */
const ROWS: SearchChannel[] = [
    {
        id: 's1',
        slug: 'ada',
        name: 'ada',
        display_name: 'Ada Lovelace',
        images: { thumb: null, avatar_video: null },
        verified_tick_badge: { image: null },
        is_premium: false,
        is_nsfw: false,
        follower_count: 40400,
        member_count: 276,
    },
    {
        // Premium: the name takes the brand gradient, and with no clip the avatar stays a still.
        id: 's2',
        slug: 'grace',
        name: null,
        display_name: 'Grace Hopper',
        images: { thumb: null, avatar_video: null },
        verified_tick_badge: { image: null },
        is_premium: true,
        is_nsfw: false,
        follower_count: null,
        member_count: null,
    },
    {
        // Sensitive: the labelled `nsfw` glyph sits in the name row, beside the name.
        id: 's3',
        slug: 'katherine',
        name: 'katherine',
        display_name: null,
        images: { thumb: null, avatar_video: null },
        verified_tick_badge: null,
        is_premium: false,
        is_nsfw: true,
        follower_count: 12,
        member_count: null,
    },
    {
        // No name at all: the row falls back to the handle, and prints it once rather than twice.
        id: 's4',
        slug: 'no-name-at-all',
        name: null,
        display_name: null,
        images: { thumb: null, avatar_video: null },
        verified_tick_badge: null,
        is_premium: false,
        is_nsfw: false,
        follower_count: 0,
        member_count: null,
    },
    {
        // The truncation case, in both the row and the strip.
        id: 's5',
        slug: 'a-handle-long-enough-to-have-to-truncate',
        name: null,
        display_name: 'A display name long enough that it has to truncate inside the row',
        images: { thumb: null, avatar_video: null },
        verified_tick_badge: null,
        is_premium: true,
        is_nsfw: true,
        follower_count: 1250000,
        member_count: 3800,
    },
]

/**
 * `FOLLOWING_GRID_SIZE` tiles — the ceiling, which is what a one-character term costs and the only
 * fixture that shows how many rows the grid can grow to. Resize the window: the track count comes
 * from `auto-fill`, so it is four across a phone and six or seven across the 612 column.
 */
const GRID: SearchChannel[] = [
    ...ROWS,
    ...Array.from({ length: 15 }, (_, index) => ({
        ...ROWS[0],
        id: `tile-${index}`,
        slug: `space-${index}`,
        display_name: `Space ${index}`,
    })),
]

const RECENTS = ['ada', 'grace hopper', 'katherine', '아', 'a recent term long enough to truncate']

/** The panel the real screen wraps every state in — repeated so the states read in context. */
const PANEL = 'overflow-hidden bg-(--background-surface) md:rounded-[var(--radius-xl)]'

/*
 * ⚠ The page's padding is `py-6` with **no side padding at all**, not `p-6`, and that is not
 * cosmetic. The real screen's column carries none either (the panel's own `px-4` is the inset),
 * so any padding here previews every panel narrower than it ships — 48px narrower with `p-6`.
 *
 * It shows up first in the Following grid, whose column count comes from `auto-fill` rather than
 * from breakpoints: with `p-6` the harness fitted three tracks at 375 where production fits four,
 * and six at 612 where production fits seven. That is exactly the measurement somebody opens this
 * page to take. The labels take their own `px-4` instead, which is the panel's inset.
 */

export default function DevSearchPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className={`flex flex-col gap-10 py-6 ${SEARCH_CONTAINER}`}>
            <header className="flex flex-col gap-1 px-4">
                <h1 className="type-title-t1-bold text-(--text-title)">Search</h1>
                <p className="type-dense-default text-(--text-body)">
                    `features/search` — the parts of /search that need a live service and a follow
                    list to reach. The field, the debounce and the two queries are on the real
                    route.
                </p>
            </header>

            <SearchPreview rows={ROWS} following={GRID} recents={RECENTS} />

            {/*
             * Both loading shapes, in the two compositions the views actually mount. The signed-in
             * one is what a typed term looks like while both queries are in flight — the strip's
             * tiles and its header above the rows — and it is the one worth eyeballing, since the
             * whole point of that block is that the real strip lands in the same box.
             */}
            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline px-4 text-(--text-body)">
                    loading — signed in, both queries in flight
                </h2>
                <div className={PANEL}>
                    <SearchFollowingSkeleton label="Following" />
                    <ListHeader rule={false}>
                        <ListHeaderTitle as="h2">Global search</ListHeaderTitle>
                    </ListHeader>
                    <SearchSkeleton count={3} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline px-4 text-(--text-body)">
                    loading — anonymous, results only
                </h2>
                <div className={PANEL}>
                    <SearchSkeleton count={3} />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline px-4 text-(--text-body)">
                    idle — nothing typed, no history
                </h2>
                <div className={PANEL}>
                    <ChannelEmptyState icon="search" title="Search creators" />
                </div>
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="type-micro-overline px-4 text-(--text-body)">nothing matched</h2>
                <div className={PANEL}>
                    <ChannelEmptyState
                        art={SEARCH_ART.empty}
                        title="Oops! No results found"
                        body="Try a different name or handle."
                    />
                </div>
            </section>
        </main>
    )
}
