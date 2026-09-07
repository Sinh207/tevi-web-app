import { Skeleton } from '@shared/ui/skeleton'

/**
 * The loading state, shaped like the screen it stands in for — headline, one row, three fold rows.
 *
 * Legacy's own skeleton is 304 lines that redraw every row of the expanded screen, which is a skeleton
 * for a layout the reader will not see: both sections arrive folded. This matches what actually
 * appears, so nothing jumps as it resolves.
 */
export function PayoutDetailSkeleton() {
    return (
        <div data-testid="payout-detail-loading" aria-busy="true" className="flex flex-col">
            <div className="flex flex-col items-center gap-2 px-2 py-8">
                <Skeleton w={180} h={32} />
                <Skeleton w={120} h={14} delay={160} />
                <Skeleton w={88} h={14} delay={240} />
            </div>
            {[0, 1, 2, 3].map(index => (
                <div
                    key={`payout-detail-skeleton-${index}`}
                    className="flex items-center justify-between gap-3 border-(--separator-default) border-t py-4"
                >
                    <Skeleton w={index === 0 ? 88 : 120} h={14} delay={index * 160} />
                    <Skeleton
                        w={index === 0 ? 160 : 20}
                        h={index === 0 ? 14 : 20}
                        delay={index * 160 + 80}
                    />
                </div>
            ))}
        </div>
    )
}
