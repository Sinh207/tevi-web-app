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
 * The queue's loading shape — the same DS row, with bars where the text and the two buttons go.
 *
 * Built from `ListUserItem*` rather than from `div`s with hand-guessed padding, for the reason
 * `BlockedAccountsSkeleton` gives: the skeleton and the real row then share their geometry by
 * *construction*, so a change to the DS port moves both, and every row is exactly 80px tall so
 * nothing shifts when the data lands.
 *
 * Two 28×76 blocks in the CTA, not one and not a text bar. The real controls here are filled
 * `Button size="small"`s — a box each — so blocks are what actually arrives; the blocked list's
 * skeleton draws a bar instead because *its* CTA is boxless purple ink.
 *
 * Server-renderable — no hooks — so a `loading.tsx` could use it if the route ever wants one.
 *
 * `count` is 6, as on the blocked list and for the same reason: this queue is usually short or
 * empty, and a screenful of shimmer standing in for an empty state is a worse first impression
 * than a brief, honest wait.
 */
export function FollowRequestsSkeleton({ count = 6 }: { count?: number }) {
    return (
        <ul data-testid="channel-follow-requests-loading" aria-busy="true" className="list-none">
            {/* Keyed by a derived string rather than the bare index: these rows have no identity
                and never reorder, so the key only has to be stable and distinct. */}
            {Array.from({ length: count }, (_, index) => `follow-request-skeleton-${index}`).map(
                (key, index) => (
                    <li key={key}>
                        {/* Same Surface override the real row makes — a Listing-coloured
                            skeleton is a black stripe on the card in dark mode. */}
                        <ListUserItem className="bg-(--background-surface)">
                            <ListUserItemAvatar>
                                <Skeleton circle w={48} h={48} delay={index * 160} />
                            </ListUserItemAvatar>
                            <ListUserItemContent>
                                {index > 0 && <ListRowRule />}
                                <ListUserItemPreview>
                                    <ListUserItemInfo>
                                        {/* Each bar sits in a box reserved at its **real** line
                                            height — 24 for the name, 21 for the two dense lines
                                            — rather than at the bar's own 12px, per
                                            `skeleton.tsx`. */}
                                        <div className="flex h-[24px] items-center">
                                            <Skeleton w={148} delay={index * 160} />
                                        </div>
                                        <div className="flex h-[21px] items-center">
                                            <Skeleton w={96} delay={index * 160} />
                                        </div>
                                        <div className="flex h-[21px] items-center">
                                            <Skeleton w={124} delay={index * 160} />
                                        </div>
                                    </ListUserItemInfo>
                                    <ListUserItemCta className="gap-2 self-center">
                                        {/* `rounded-lg` overrides the DS bar's 4px radius to the
                                            Button's own 8 — the shape that actually arrives. */}
                                        <Skeleton
                                            w={76}
                                            h={28}
                                            className="rounded-lg"
                                            delay={index * 160}
                                        />
                                        <Skeleton
                                            w={76}
                                            h={28}
                                            className="rounded-lg"
                                            delay={index * 160}
                                        />
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
