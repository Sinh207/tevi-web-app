import {
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowRule,
    ListRowText,
    ListRowTitleRow,
    ListRowTrailing,
} from '@shared/ui/list'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * The list's loading state, built from this row's own parts.
 *
 * The same rule `LedgerSkeleton` states: a skeleton assembled from different parts than the rows it
 * stands in for measures differently, and the list then jumps as it resolves. Legacy's payout skeleton
 * is the row component itself with an `isLoading` prop, which is the same idea reached differently —
 * this keeps the real row free of a branch it only needs once.
 */
export function PayoutRequestSkeleton({ count = 5 }: { count?: number }) {
    return (
        <div data-testid="payout-row-loading" aria-busy="true" className="flex flex-col">
            {Array.from({ length: count }, (_, index) => index).map((index, position) => (
                <ListRow key={`payout-skeleton-${index}`} rightAction>
                    <ListRowLeading className="w-[44px]">
                        <Skeleton w={36} h={36} circle delay={position * 160} />
                    </ListRowLeading>
                    <ListRowContent>
                        {position > 0 && <ListRowRule />}
                        <ListRowAccessory rightAction>
                            <ListRowText rightAction>
                                <ListRowTitleRow>
                                    <Skeleton w="55%" delay={position * 160} />
                                </ListRowTitleRow>
                                <Skeleton w="35%" delay={position * 160 + 80} />
                            </ListRowText>
                            <ListRowTrailing className="flex-col items-end gap-1">
                                <Skeleton w={72} delay={position * 160} />
                                <Skeleton w={48} h={10} delay={position * 160 + 80} />
                            </ListRowTrailing>
                        </ListRowAccessory>
                    </ListRowContent>
                </ListRow>
            ))}
        </div>
    )
}
