import {
    ListHeader,
    ListHeaderTitle,
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemInfo,
    ListUserItemPreview,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * The results list's loading shape — the same DS row, with bars where the text goes.
 *
 * Built from `ListUserItem*` rather than from `div`s with hand-guessed padding, which is the only
 * way the two can be guaranteed not to drift: the skeleton and the real row share the geometry by
 * *construction*, so a change to the DS port moves both. Every row is exactly 80px tall, so
 * nothing shifts when the results land. Same construction, and the same reasoning, as
 * `BlockedAccountsSkeleton`.
 *
 * ## It draws the results and nothing above them
 *
 * The Following strip and its header sit above this list on the real screen, and they are
 * `SearchFollowingSkeleton`'s (below) rather than part of this one — because whether they belong on
 * screen at all is the *caller's* question, not this file's. An anonymous visitor never gets a
 * strip, and a signed-in one gets it only while that second query is in flight; a skeleton that
 * drew the block unconditionally would be wrong for everybody in the first group. So the two pieces
 * are composed by the view (`SearchView`, `CreatorPickerView`), which knows which requests it is
 * waiting for.
 *
 * ## Two lines, not three
 *
 * Matching `SearchChannelRow`, which has a name and a handle and no meta line — hence
 * `items-center` on the avatar and the preview, as the real row uses. Each bar sits inside a box
 * reserved at its **real** line height (24 for the name, 21 for the handle) rather than at the
 * bar's own 12px, for the reason `skeleton.tsx` spells out.
 *
 * Server-renderable — no hooks — though the route's `loading.tsx` deliberately does **not** draw
 * it: the term lives in client state, so the first thing the real screen paints is the Recents
 * list, and rows there would be a shift into a state that never contains rows. That boundary draws
 * the chrome only; see `app/(web)/(main)/(rail)/search/loading.tsx`.
 *
 * `count` is 6 rather than a screenful, as on the blocked list: six rows of shimmer standing in
 * for what turns out to be "no results" is a worse first impression than a brief, honest wait.
 */
export function SearchSkeleton({ count = 6 }: { count?: number }) {
    return (
        <ul data-testid="search-loading" aria-busy="true" className="list-none">
            {/* Keyed by a derived string rather than the bare index: these rows have no identity
                and never reorder, so the key only has to be stable and distinct — and
                `key={index}` is the shape that is a real bug on a list that *does* reorder,
                which is why the linter refuses to tell the two apart. */}
            {Array.from({ length: count }, (_, index) => `search-skeleton-${index}`).map(
                (key, index) => (
                    <li key={key}>
                        {/* Same Surface override the real row makes — a Listing-coloured
                            skeleton is a black stripe on the card in dark mode. */}
                        <ListUserItem className="bg-(--background-surface)">
                            <ListUserItemAvatar className="items-center">
                                <Skeleton circle w={48} h={48} delay={index * 160} />
                            </ListUserItemAvatar>
                            <ListUserItemContent>
                                {index > 0 && <ListRowRule />}
                                <ListUserItemPreview className="items-center">
                                    <ListUserItemInfo>
                                        <div className="flex h-[24px] items-center">
                                            <Skeleton w={148} delay={index * 160} />
                                        </div>
                                        <div className="flex h-[21px] items-center">
                                            <Skeleton w={96} delay={index * 160} />
                                        </div>
                                    </ListUserItemInfo>
                                </ListUserItemPreview>
                            </ListUserItemContent>
                        </ListUserItem>
                    </li>
                ),
            )}
        </ul>
    )
}

/**
 * The **Following strip's** loading shape — the header it always wears, over a row of tiles.
 *
 * Built from the tile's own numbers (`FollowingTile`: `w-19` pinned, a 48px avatar, a 14/1.5 name
 * over a 12/1.5 handle, `gap-1`, `py-1`) and the track's own box (`-mx-4 px-4` inside `px-4 pb-4`,
 * so the first tile lines up with the 16px column the rows below use). Same construction rule as
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
            <ListHeader rule={false}>
                <ListHeaderTitle as="h2">{label}</ListHeaderTitle>
            </ListHeader>

            <div className="px-4 pb-4">
                <ul className="-mx-4 flex list-none items-start gap-2 overflow-hidden px-4">
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
