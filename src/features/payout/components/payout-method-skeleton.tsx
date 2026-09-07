import { Skeleton } from '@shared/ui/skeleton'
import { PAYOUT_CARD } from '../lib/container'

/**
 * The saved-methods list, loading — the **card's** own geometry, so nothing moves as it resolves.
 *
 * `PAYOUT_CARD` is shared with the real item rather than re-declared: the padding, the radius and the
 * 36px mark slot are exactly what the list will measure a moment later, and a skeleton assembled from
 * its own numbers is how a list ends up stepping on arrival. Four bars, because the card has four
 * lines.
 *
 * Three cards, not five: this list is a handful of methods, where the tracking list is a scroll of
 * history. A skeleton longer than the thing it stands in for promises a list that is not coming.
 */
export function PayoutMethodSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div data-testid="payout-method-loading" aria-busy="true" className="flex flex-col gap-3">
            {Array.from({ length: count }, (_, index) => index).map(position => (
                <div
                    key={`payout-method-skeleton-${position}`}
                    // `cursor-pointer` and the hover colour come with the shared class and are
                    // harmless on a div that has no handler; `pointer-events-none` keeps the cursor
                    // honest anyway.
                    className={`${PAYOUT_CARD} pointer-events-none`}
                >
                    <Skeleton w={36} h={36} delay={position * 160} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Skeleton w="40%" h={10} delay={position * 160} />
                        <Skeleton w="55%" delay={position * 160 + 80} />
                        <Skeleton w="45%" delay={position * 160 + 120} />
                        <Skeleton w="60%" h={10} delay={position * 160 + 160} />
                    </span>
                </div>
            ))}
        </div>
    )
}
