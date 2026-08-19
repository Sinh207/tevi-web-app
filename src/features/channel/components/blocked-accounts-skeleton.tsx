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
 * Built from `ListUserItem*` rather than from `div`s with hand-guessed padding, which is the
 * only way the two can be guaranteed not to drift: the skeleton and the real row share the
 * geometry by *construction*, so a change to the DS port moves both. It also makes the DoD §1
 * requirement ("a skeleton matching the final layout's shape") hold for free — every row is
 * exactly 80px tall, so nothing shifts when the data lands.
 *
 * Each text bar sits inside a box reserved at its **real** line height (24 for the name,
 * 21 for the two dense lines) rather than at the bar's own 12px, for the reason
 * `skeleton.tsx` spells out.
 *
 * Server-renderable — no hooks — so a `loading.tsx` could use it if the route ever wants one.
 *
 * `count` is 6, not a screenful: this list is usually short (most people have blocked nobody
 * or a handful), and six rows of shimmer standing in for what turns out to be an empty state
 * is a worse first impression than a brief, honest wait.
 */
export function BlockedAccountsSkeleton({ count = 6 }: { count?: number }) {
    return (
        <ul aria-busy="true" className="list-none">
            {/* Keyed by a derived string rather than the bare index: these rows have no
                identity and never reorder, so the key only has to be stable and distinct —
                and `key={index}` is the shape that is a real bug on a list that *does*
                reorder, which is why the linter refuses to tell the two apart. */}
            {Array.from({ length: count }, (_, index) => `blocked-skeleton-${index}`).map(
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
                                    <ListUserItemCta className="self-center">
                                        {/* 36 × 88 — the DS `Button size="medium"` height, and the
                                        width the word "Unblock" occupies at 14/500 plus its
                                        16px side padding. */}
                                        <Skeleton
                                            w={88}
                                            h={36}
                                            delay={index * 160}
                                            className="rounded-[var(--radius-lg)]"
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
