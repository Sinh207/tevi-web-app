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
 * The inbox's loading shape — the same DS row, with bars where the text goes.
 *
 * Built from `ListUserItem*` rather than from `div`s with hand-guessed padding, which is the only
 * way the two can be guaranteed not to drift: the skeleton and the real row share the geometry by
 * *construction*, so a change to the DS port moves both. That also makes DoD §1's "a skeleton
 * matching the final layout's shape" hold for free — every row is exactly 80px, so nothing shifts
 * when the data lands.
 *
 * Two bars, not three: the real row is a title line and a two-line body, and the second bar stands
 * in for both — a third bar would promise a row height that only the long notifications have. Each
 * sits in a box reserved at its **real** line height (24 for the title row, 21 for the dense body)
 * rather than at the bar's own 12px, for the reason `skeleton.tsx` spells out.
 *
 * Server-renderable — no hooks — though the route has no `loading.tsx`: a feature-barrel import
 * from one is what produces the CSP-blocked chunk this repo has hit before, and the view renders
 * this itself while the query is in flight.
 *
 * `count` is 8, a screenful on a phone. Higher than the blocked list's 6 on purpose: an inbox is
 * long for almost everybody, so a short shimmer that then fills to twenty rows reads as a jump.
 */
export function NotificationSkeleton({ count = 8 }: { count?: number }) {
    return (
        <ul data-testid="notification-loading" aria-busy="true" className="list-none">
            {/* Keyed by a derived string rather than the bare index: these rows have no identity
                and never reorder, so the key only has to be stable and distinct. */}
            {Array.from({ length: count }, (_, index) => `inbox-skeleton-${index}`).map(
                (key, index) => (
                    <li key={key}>
                        {/* The Surface override the real row makes — a Listing-coloured skeleton
                            is a black stripe on the card in Dark. */}
                        <ListUserItem className="bg-(--background-surface)">
                            <ListUserItemAvatar>
                                <Skeleton circle w={48} h={48} delay={index * 160} />
                            </ListUserItemAvatar>
                            <ListUserItemContent>
                                {index > 0 && <ListRowRule />}
                                <ListUserItemPreview className="items-center">
                                    <ListUserItemInfo>
                                        <div className="flex h-[24px] items-center">
                                            <Skeleton w={168} delay={index * 160} />
                                        </div>
                                        <div className="flex h-[21px] items-center">
                                            <Skeleton w="80%" delay={index * 160} />
                                        </div>
                                    </ListUserItemInfo>
                                    <ListUserItemCta className="self-center">
                                        {/* The kebab's 36px box (DS `Button size="medium"`),
                                            reserved so nothing shifts, with a 20px disc where the
                                            three dots land. */}
                                        <div className="flex size-9 items-center justify-center">
                                            <Skeleton circle w={20} h={20} delay={index * 160} />
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
