import {
    ListRowRule,
    ListUserItem,
    ListUserItemAvatar,
    ListUserItemContent,
    ListUserItemInfo,
    ListUserItemPreview,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * The picker's loading shape — **the same DS row, with bars where the text goes.**
 *
 * Built from `ListUserItem*` rather than from `div`s with hand-guessed padding, which is the only
 * way the two can be guaranteed not to drift: the skeleton and `GiftRecipientRow` share the geometry
 * by *construction*, so a change to the DS port moves both. Every row is exactly 80px tall, so
 * nothing shifts when the results land.
 *
 * Two lines, not three — matching the real row, which has a name and a handle and no meta line —
 * hence `items-center` on the avatar and the preview. Each bar sits inside a box reserved at its
 * **real** line height (24 for the name, 21 for the handle) rather than at the bar's own 12px, for
 * the reason `skeleton.tsx` spells out.
 *
 * ## It does not stand in for the Following block
 *
 * That block is above the results and may not exist at all — an anonymous visitor never gets one,
 * and a signed-in one only gets it when a space they follow matches. A skeleton that drew it would
 * be wrong more often than right, and being wrong here means a block appearing in the loading state
 * and then vanishing, which is the layout shift the skeleton exists to prevent.
 *
 * `count` is 6 rather than a screenful, as on every other list in this app: six rows of shimmer
 * standing in for what turns out to be "no results" is a worse first impression than a brief wait.
 *
 * Server-renderable — no hooks — though nothing renders it from a `loading.tsx`: the term lives in
 * client state, so there is no server-known moment at which this is the right thing to show.
 */
export function GiftRecipientSkeleton({ count = 6 }: { count?: number }) {
    return (
        <ul data-testid="premium-gift-loading" aria-busy="true" className="list-none">
            {/* Keyed by a derived string rather than the bare index: these rows have no identity and
                never reorder, so the key only has to be stable and distinct. */}
            {Array.from({ length: count }, (_, index) => `gift-recipient-skeleton-${index}`).map(
                (key, index) => (
                    <li key={key}>
                        {/* The same Surface override the real row makes — a Listing-coloured
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
