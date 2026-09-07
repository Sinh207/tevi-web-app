import type { PageCursor } from '@shared/lib/api/page-cursor'
import { firstPageParams, nextPagedCursor, type PagedList } from '@shared/lib/api/paged-list'
import type { InfiniteData } from '@tanstack/react-query'
import type { FollowedChannel } from '../api/types'

/**
 * Paging and cache surgery for the **followed-channels** list.
 *
 * The paging rules are [`shared/lib/api/paged-list.ts`](../../../shared/lib/api/paged-list.ts)'s — this is the same DRF
 * `?page=&page_size=` list the blocked accounts and the follow requests are — so what is here is
 * this list's own page size plus the two things neither of those needs: a **field patch** (pin and
 * mute change a row rather than removing it) and the **follow limit** the screen warns about.
 */

/**
 * Legacy's page size (`PAGE_SIZE` in `useFollowedChannels`), and load-bearing twice over as on the
 * other two lists: it is the request's `page_size` *and* the number the short-page stop condition
 * compares against. One constant, or the list stops after one page or never stops at all.
 */
export const FOLLOWING_PAGE_SIZE = 20

/**
 * How many live streams the Live now block asks for — legacy's `getFollowedChannelsLives(10)`.
 *
 * It is a **ceiling, not a page**: the endpoint takes `limit` and offers no cursor, so ten is all
 * this screen will ever show, and the "Show more" below the first five reveals the rest of the ten
 * rather than fetching. Somebody following forty live creators sees ten of them, which is legacy's
 * behaviour and is defensible for a strip above the list the screen is actually about — but it is a
 * *limit*, not a coincidence, and this is where it would grow.
 */
export const FOLLOWED_LIVES_LIMIT = 10

/**
 * How many of those the block shows before it offers "Show more" — legacy's own `LIMIT`.
 *
 * Presentation rather than transport, but it lives beside the fetch ceiling because the pair only
 * makes sense together: with the two equal there is no "Show more" to draw at all, and a reader
 * comparing them here is the one who notices.
 */
export const FOLLOWED_LIVES_COLLAPSED = 5

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export const FOLLOWING_FIRST_PAGE: PageCursor = firstPageParams(FOLLOWING_PAGE_SIZE)

/**
 * When the screen starts warning, and what it warns about.
 *
 * Legacy's numbers, and they are a **pair**: it warns past 900 that the ceiling is 1,000. Both are
 * the backend's rule and neither is enforced here — the client cannot refuse a follow it does not
 * make (the Follow button is on the channel page) and a client-side cap would only hide the
 * server's own error. So this is a notice, not a gate.
 *
 * ⚠ Legacy compares against a value that is **10 in development** (`process.env.ENV`), so the
 * warning is permanently on for anybody with more than ten follows on a dev build — which is why
 * this is one constant with no environment branch. A banner that only appears in production is a
 * banner nobody has seen before a customer does.
 */
export const FOLLOWING_WARN_AT = 900
export const FOLLOWING_LIMIT = 1000

/** A page of followed channels as the endpoint returns it — see `PagedList` for what `next` means. */
export type FollowedChannelsPage = PagedList<FollowedChannel>

/** The params for the next page, or `undefined` when there is none. See `nextPagedCursor`. */
export function nextFollowedCursor(
    page: FollowedChannelsPage,
    current: PageCursor | null,
): PageCursor | undefined {
    return nextPagedCursor(page, current, FOLLOWING_PAGE_SIZE)
}

/**
 * Drop one space from every page of the cached list, and take the total down with it.
 *
 * Keyed by **slug**, not by `id`, which is why this is not `removeListRow`: every action on this
 * screen addresses a row by slug — the endpoints take one, the link is `/@{slug}` — so the id never
 * enters the flow, and threading a second identifier through the hook to satisfy a shared helper
 * would be the tail wagging the dog. The two guarantees `removeListRow` documents are kept because
 * they are the ones that matter, not because the code is shared:
 *
 * - the **same object** comes back when the slug is not there, so `setQueryData` does not re-render
 *   every subscriber for a removal that removed nothing (a double-tap the pending state missed, a
 *   mutation retried);
 * - `count` is the *total* rather than the number loaded, so it is decremented once and written to
 *   every page, floored at zero.
 */
export function removeFollowedChannel(
    data: InfiniteData<FollowedChannelsPage, PageCursor | null> | undefined,
    slug: string,
): InfiniteData<FollowedChannelsPage, PageCursor | null> | undefined {
    if (!data) return data
    const found = data.pages.some(page => page.results.some(row => row.slug === slug))
    if (!found) return data

    return {
        ...data,
        pages: data.pages.map(page => ({
            ...page,
            count: Math.max(0, page.count - 1),
            results: page.results.filter(row => row.slug !== slug),
        })),
    }
}

/**
 * Patch one row in place — what pin, unpin, mute and unmute all do.
 *
 * **Not a removal, so `count` does not move**, and the row keeps its position: re-ordering a pinned
 * space to the top of the list is the *server's* answer to the next request, not something this
 * function guesses at. Legacy sorts the loaded pages itself, with a five-branch comparator that
 * reproduces neither ordering the endpoint offers — so a pinned row lands where legacy thinks it
 * belongs and then moves when the list is next fetched. Here the mark appears at once (which is the
 * feedback the press needs) and the order arrives with the refetch behind it.
 *
 * Returns the **same object** when the slug is not there, for the reason above.
 */
export function patchFollowedChannel(
    data: InfiniteData<FollowedChannelsPage, PageCursor | null> | undefined,
    slug: string,
    patch: Partial<FollowedChannel>,
): InfiniteData<FollowedChannelsPage, PageCursor | null> | undefined {
    if (!data) return data
    const found = data.pages.some(page => page.results.some(row => row.slug === slug))
    if (!found) return data

    return {
        ...data,
        pages: data.pages.map(page => ({
            ...page,
            results: page.results.map(row => (row.slug === slug ? { ...row, ...patch } : row)),
        })),
    }
}

/**
 * Flip one row's pin and **move it**, without asking the server where it goes.
 *
 * ## Why this exists rather than an invalidation
 *
 * Pinning used to patch the flag and then refetch, on the principle that the order is the server's
 * answer and this client should not guess at it. That principle is right and the implementation was
 * still wrong: `POST channels/{slug}/pin/` returns before the write is visible to
 * `GET followed-channels/`, so the refetch that followed it came back with the **old** order — and
 * often the old flag. The press appeared to do nothing, then the row jumped a second later, or not
 * at all. Reported from the real screen.
 *
 * So the client owns the move. That is not a workaround for a race: a reorder is the *point* of
 * pressing Pin, and an interaction whose whole result arrives on a later round trip has no business
 * waiting for one.
 *
 * ## The rule, stated once
 *
 * > **Pinned rows lead the list, most-recently-acted-on first. Everything else keeps the order the
 * > server gave it.**
 *
 * Which makes both presses one operation: the row moves to the head of the group it now belongs to.
 * Pin sends it to index 0; unpin drops it to the top of the unpinned run, immediately under the pins
 * that remain.
 *
 * Nothing else is re-sorted, and that is deliberate — the rows arrived in the current ordering's own
 * order, so a **stable** partition preserves it exactly. Legacy re-sorts the loaded pages by
 * `last_activity_at` instead, which is one of the two orderings the endpoint offers and simply wrong
 * under the other; this cannot make that mistake because it never compares two rows.
 *
 * ⚠ Where unpin lands is an **approximation, and it has to be**: the true slot depends on the
 * ordering key, and under `-follows__created_at` the row carries no field for it — the payload has no
 * `follows__created_at`. The head of the unpinned run is the one position that is defensible without
 * that field: the row visibly leaves the pins, which is what was asked for, and stops at the boundary
 * rather than being flung somewhere this client guessed. The next natural load settles it.
 *
 * Rows are moved **across pages**: a pinned row on page three belongs at the top of page one, so the
 * flattened list is re-chunked back into the original page lengths. `count`, `next` and `pageParams`
 * are untouched, so the query stays exactly as paginated as it was.
 *
 * Returns the same object when the slug is not there, as the other two helpers do.
 */
export function movePinnedFollowedChannel(
    data: InfiniteData<FollowedChannelsPage, PageCursor | null> | undefined,
    slug: string,
    pinned: boolean,
): InfiniteData<FollowedChannelsPage, PageCursor | null> | undefined {
    if (!data) return data

    const rows = data.pages.flatMap(page => page.results)
    const next = movePinnedRow(rows, slug, pinned)
    if (next === rows) return data

    let cursor = 0
    return {
        ...data,
        pages: data.pages.map(page => {
            const results = next.slice(cursor, cursor + page.results.length)
            cursor += page.results.length
            return { ...page, results }
        }),
    }
}

/**
 * The rule on a **flat array** — the one `movePinnedFollowedChannel` applies, with the paging peeled
 * off.
 *
 * Exported so `/dev/following` can show the real motion instead of a hand-rolled imitation of it: the
 * preview holds a plain array rather than an `InfiniteData`, and a second copy of the rule there is a
 * preview that drifts from the screen it previews. Same reason the barrel exports the *rows*.
 *
 * Returns the **same array** when the slug is not there, which is what lets the caller above skip
 * rebuilding its pages.
 */
export function movePinnedRow<T extends { slug: string; pin: boolean }>(
    rows: T[],
    slug: string,
    pinned: boolean,
): T[] {
    const index = rows.findIndex(row => row.slug === slug)
    if (index === -1) return rows

    const moved = { ...rows[index], pin: pinned }
    const rest = rows.filter((_, i) => i !== index)
    const firstUnpinned = rest.findIndex(row => !row.pin)
    // Pin: the very top. Unpin: the head of the unpinned run — or the end when every other row is
    // pinned, which is the head of an empty run and so the same rule rather than a special case.
    const at = pinned ? 0 : firstUnpinned === -1 ? rest.length : firstUnpinned
    return [...rest.slice(0, at), moved, ...rest.slice(at)]
}
