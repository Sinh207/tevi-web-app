import type { PageCursor } from '@shared/lib/api/page-cursor'
import { firstPageParams, nextPagedCursor, type PagedList } from '@shared/lib/api/paged-list'
import type { GiftRecipient } from '../api/gift-types'

/**
 * Paging for the recipient picker's global list.
 *
 * The rules themselves are [`shared/lib/api/paged-list.ts`](../../../shared/lib/api/paged-list.ts)'s
 * — this is the same DRF `?page=&page_size=` list the search screen and the blocked list page — so
 * what lives here is this list's own numbers and nothing else. Both of them fail *quietly* if they
 * disagree with the request, which is why they are constants rather than literals at two call sites:
 * a stop condition that never fires is a list re-requesting its last page forever.
 */

/**
 * Legacy's page size for this screen (`PAGE_SIZE` in `giftPremium/hooks/useSearchCreator`), and
 * load-bearing twice: it is the request's `page_size` **and** the number the short-page stop
 * condition compares against.
 */
export const GIFT_RECIPIENT_PAGE_SIZE = 20

/** The first request's params. `page` is explicit so the fallback cursor can count from it. */
export const GIFT_RECIPIENT_FIRST_PAGE: PageCursor = firstPageParams(GIFT_RECIPIENT_PAGE_SIZE)

/** A page of recipients as the endpoint returns it — see `PagedList` for what `next` means. */
export type GiftRecipientPage = PagedList<GiftRecipient>

/** The params for the next page, or `undefined` when there is none. */
export function nextGiftRecipientCursor(
    page: GiftRecipientPage,
    current: PageCursor | null,
): PageCursor | undefined {
    return nextPagedCursor(page, current, GIFT_RECIPIENT_PAGE_SIZE)
}

/**
 * How many followed spaces the shortcut list asks for.
 *
 * Legacy's `getFollowedChannels(1, 20, q)` — one page, never paginated, which is the right shape
 * for what it is: a short block of the people you already follow, shown whole, with the exhaustive
 * answer in the list underneath. A ceiling rather than a typical size: the endpoint filters by the
 * term server-side, so a real search matches one or two of them.
 *
 * A separate constant from {@link GIFT_RECIPIENT_PAGE_SIZE} even though both are 20 — they answer
 * different questions, and one of them moving is not a reason for the other to.
 */
export const GIFT_FOLLOWING_SIZE = 20
