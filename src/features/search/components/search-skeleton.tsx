import { Skeleton } from '@shared/ui/skeleton'
import { SearchSectionHeader } from './search-section-header'

/**
 * A search list's loading shape — the same 56px rows `SearchChannelRow` draws, with bars where the
 * text goes, and optionally the section title above them.
 *
 * Geometry by construction rather than by eye: the list is the same `flex-col gap-3 px-4 md:px-6` and each
 * row the same `size-14` avatar slot, `gap-3`, and two lines 4 apart, so nothing moves when the
 * results land. Each bar sits in a box at its line's **real** height (21px for 14px text) rather
 * than the bar's own 12px — the trap `skeleton.tsx` spells out.
 *
 * ## The title prints its real words
 *
 * A section label is chrome, not data, so reserving a grey bar where "Following" is about to appear
 * would stand in for text we already have. `title` is a prop so this file stays hook-free.
 *
 * Whether a section belongs on screen at all is the caller's question: an anonymous visitor never
 * gets a Following section, so `SearchView` composes these per request it is actually waiting for.
 *
 * `count` is 6 rather than a screenful: six rows of shimmer standing in for "no results" is a worse
 * first impression than a short, honest wait.
 */
export function SearchSkeleton({
    count = 6,
    title,
    testId = 'search-loading',
}: {
    count?: number
    title?: string
    testId?: string
}) {
    return (
        <section data-testid={testId} aria-busy="true">
            {title && <SearchSectionHeader title={title} />}
            <ul className="flex list-none flex-col gap-3 px-4 pb-3 md:px-6">
                {Array.from({ length: count }, (_, index) => `search-skeleton-${index}`).map(
                    (key, index) => (
                        <li key={key} className="flex items-center gap-3">
                            <span className="flex size-14 flex-none items-center justify-center">
                                <Skeleton circle w={48} h={48} delay={index * 160} />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                                <span className="flex h-[21px] items-center">
                                    <Skeleton w={176} delay={index * 160} />
                                </span>
                                <span className="flex h-[21px] items-center">
                                    <Skeleton w={112} delay={index * 160} />
                                </span>
                            </span>
                        </li>
                    ),
                )}
            </ul>
        </section>
    )
}

/**
 * The **Following strip's** loading shape — the header it always wears, over a row of tiles.
 *
 * Built from the tile's own numbers (`FollowingTile`: `w-19` pinned, a 48px avatar, a 14/1.5 name
 * over a 12/1.5 handle, `gap-1`, `py-1`) and the track's own box (`-mx-6 px-6` inside `px-6 pb-4`,
 * `-4` below `md`, so the first tile lines up with the column the rows below use). Same construction rule as
 * `SearchSkeleton`: the placeholder and the real block share their geometry by *reading the same
 * classes*, not by two people measuring the same comp twice.
 *
 * ## The header prints its real words
 *
 * A section label is not data — it is the same string whatever comes back — so drawing a grey bar
 * where "Following" is about to appear would be reserving space for text we already have. Hence
 * `label` is a prop rather than a `Skeleton`: this file stays hook-free (`SearchSkeleton`'s note
 * says why that matters) and the caller, which has `t`, hands the word in.
 *
 * ## Four tiles, and why a count is a guess worth making here
 *
 * `SearchSkeleton` refuses to stand in for this block *on its own* — it cannot know whether a grid
 * will arrive at all. The caller can: this is drawn only while the followed-channels query is
 * **in flight**, which is a request whose answer lands in exactly this box. Four is the strip's
 * common case (a term matching two or three spaces you follow, plus one), and the block is one
 * fixed-height row either way — the strip scrolls rather than wraps, so unlike the grid this
 * replaced, being wrong about the count changes nothing about the height.
 *
 * `overflow-hidden` on the track, which the real strip gets from `overflow-x-auto`: four 76px tiles
 * and their gaps are 328px, so on a 320px phone the row would otherwise stick out of the panel and
 * put a horizontal scrollbar on the page.
 */
export function SearchFollowingSkeleton({ label, tiles = 4 }: { label: string; tiles?: number }) {
    return (
        <section data-testid="search-following-loading" aria-busy="true">
            {/* `rule={false}`, as the real strip's header is — see `SearchFollowingStrip` for why a
                block of tiles takes no hairline. */}
            <SearchSectionHeader title={label} />

            <div className="px-4 pb-4 md:px-6">
                <ul className="-mx-4 flex list-none items-start gap-2 overflow-hidden px-4 md:-mx-6 md:px-6">
                    {Array.from(
                        { length: tiles },
                        (_, index) => `search-tile-skeleton-${index}`,
                    ).map((key, index) => (
                        <li key={key} className="w-19 min-w-0 flex-none">
                            <div className="flex w-full flex-col items-center gap-1 py-1">
                                <Skeleton circle w={48} h={48} delay={index * 160} />
                                {/* Each bar inside a box reserved at the line's **real** height
                                        — 21 for the 14px name, 18 for the 12px handle — which is
                                        the trap `skeleton.tsx` spells out. */}
                                <div className="flex h-[21px] w-full items-center justify-center">
                                    <Skeleton w={56} delay={index * 160} />
                                </div>
                                <div className="flex h-[18px] w-full items-center justify-center">
                                    <Skeleton w={40} delay={index * 160} />
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}
