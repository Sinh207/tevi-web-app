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
 * The list's loading shape — the same DS row, with bars where the text goes.
 *
 * Built from `ListUserItem*` rather than from `div`s with hand-guessed padding, which is the only way
 * the two can be guaranteed not to drift: the skeleton and the real row share the geometry by
 * *construction*, so a change to the DS port moves both. It also makes DoD §1's "a skeleton matching
 * the final layout's shape" hold for free — every row is exactly 80px tall, so nothing shifts when
 * the data lands.
 *
 * Each bar sits in a box reserved at its **real** line height (24 for the identity line, 21 for the
 * two dense metas) rather than at the bar's own 12px, for the reason `skeleton.tsx` spells out.
 *
 * Server-renderable — no hooks — so a `loading.tsx` could use it if the route ever wants one.
 *
 * `count` is 5 rather than a screenful: most accounts hold a handful of memberships, and a screen of
 * shimmer standing in for what turns out to be an empty state is a worse first impression than a
 * brief, honest wait. Same call as `BlockedAccountsSkeleton`.
 */
export function MyMembershipSkeleton({ count = 5 }: { count?: number }) {
    return (
        <ul data-testid="membership-loading" aria-busy="true" className="list-none">
            {/* Keyed by a derived string rather than the bare index: these rows have no identity and
                never reorder, so the key only has to be stable and distinct. */}
            {Array.from({ length: count }, (_, index) => `membership-skeleton-${index}`).map(
                (key, index) => (
                    <li key={key}>
                        {/* Same Surface override the real row makes — a Listing-coloured skeleton is
                            a black stripe across the card in dark mode. */}
                        <ListUserItem className="bg-(--background-surface)">
                            <ListUserItemAvatar>
                                <Skeleton circle w={48} h={48} delay={index * 160} />
                            </ListUserItemAvatar>
                            <ListUserItemContent>
                                {index > 0 && <ListRowRule />}
                                <ListUserItemPreview>
                                    <ListUserItemInfo>
                                        <div className="flex h-[24px] items-center">
                                            <Skeleton w={168} delay={index * 160} />
                                        </div>
                                        <div className="flex h-[21px] items-center">
                                            <Skeleton w={132} delay={index * 160} />
                                        </div>
                                        <div className="flex h-[21px] items-center">
                                            <Skeleton w={108} delay={index * 160} />
                                        </div>
                                    </ListUserItemInfo>
                                    {/* The price stack: the Star figure, and the cash line under it.
                                        Top-aligned and end-aligned, as the real one is. */}
                                    <ListUserItemCta className="flex-col items-end gap-0">
                                        <div className="flex h-[21px] items-center">
                                            <Skeleton w={56} delay={index * 160} />
                                        </div>
                                        <div className="flex h-[18px] items-center">
                                            <Skeleton w={40} delay={index * 160} />
                                        </div>
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
