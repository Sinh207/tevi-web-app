import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemCta,
    ListUserItemInfo,
    ListUserItemPreview,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * `/following`'s loading shape — the same DS row with bars where the three text lines go.
 *
 * Built from `ListUserItem*` rather than from `div`s with hand-guessed padding, for the reason
 * `BlockedAccountsSkeleton` gives: the skeleton and the real row then share their geometry by
 * *construction*, so a change to the DS port moves both, and every row is exactly 80px tall so
 * nothing shifts when the data lands.
 *
 * **Two** bars, matching the row: the handle rides the name line after the badges (legacy's
 * arrangement — see `following-channel-row.tsx`), so what is left is a name line and "Last activity
 * …". It was three while the row still used the DS comp's three-line stack; a skeleton that outlives
 * its row is a skeleton that shifts when the data lands, which is the one thing it exists to stop. The CTA is a 36px disc rather than a bar or a box: what arrives there is an
 * icon-only ghost `Button`, which is round-cornered and square, unlike the request queue's two
 * filled pills or the blocked list's boxless purple ink.
 *
 * Server-renderable — no hooks — though this route deliberately has no `loading.tsx`: the list is
 * account-scoped and has nothing to render before the bearer exists.
 *
 * `count` is 8 rather than the other two lists' 6. A follow list is the one of the three that is
 * *usually* long, so a screenful of shimmer is an honest preview of what is coming rather than a
 * stand-in for an empty state.
 */
export function FollowingSkeleton({ count = 8 }: { count?: number }) {
    return (
        <ul data-testid="channel-following-loading" aria-busy="true" className="list-none">
            {/* Keyed by a derived string rather than the bare index: these rows have no identity
                and never reorder, so the key only has to be stable and distinct. */}
            {Array.from({ length: count }, (_, index) => `following-skeleton-${index}`).map(
                (key, index) => (
                    <li key={key}>
                        {/* Same Surface override the real row makes — a Listing-coloured skeleton
                            is a black stripe on the card in dark mode. */}
                        <ListUserItem className="bg-(--background-surface)">
                            {/* `items-center` like the real row, which is two lines now. */}
                            <ListUserItemAvatar className="items-center">
                                <Skeleton circle w={48} h={48} delay={index * 160} />
                            </ListUserItemAvatar>
                            <ListUserItemContent>
                                {index > 0 && <ListRowRule />}
                                <ListUserItemPreview className="items-center">
                                    <ListUserItemInfo>
                                        {/* Each bar sits in a box reserved at its **real** line
                                            height — 24 for the name line, 21 for the dense one —
                                            rather than at the bar's own 12px, per `skeleton.tsx`.
                                            The first is wider than the old name bar because it now
                                            stands in for the name *and* the handle beside it. */}
                                        <div className="flex h-[24px] items-center">
                                            <Skeleton w={188} delay={index * 160} />
                                        </div>
                                        <div className="flex h-[21px] items-center">
                                            <Skeleton w={132} delay={index * 160} />
                                        </div>
                                    </ListUserItemInfo>
                                    <ListUserItemCta className="self-center">
                                        <Skeleton circle w={36} h={36} delay={index * 160} />
                                    </ListUserItemCta>
                                </ListUserItemPreview>
                            </ListUserItemContent>
                        </ListUserItem>
                    </li>
                ),
            )}
        </ul>
    )
}
