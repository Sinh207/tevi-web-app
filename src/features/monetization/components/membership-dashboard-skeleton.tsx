import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { MEMBERSHIP_LIST_PANEL } from '../lib/container'

/**
 * `/monetization/membership`'s loading shape — the hero card, the panel header, the tabs, the search
 * field and four member rows.
 *
 * The same boxes at the same sizes as the real screen, which is a correctness measure rather than
 * tidiness: `EarningsReportSkeleton` records what a hand-rolled skeleton costs when it measures
 * differently from the thing it stands in for (a 20px jump per row on every load).
 *
 * No hooks and no `'use client'`, so it renders on the server and a route's `loading.tsx` can use it
 * through `@features/monetization/skeleton` — never through the barrel, which would make the loading
 * boundary a client entry chunk the CSP refuses. That file carries the post-mortem.
 *
 * One `data-testid`, on the root, published as `aria-busy` — `docs/TEST_IDS.md`'s rule for a
 * skeleton: nothing inside it is named.
 */
export function MembershipDashboardSkeleton({ className }: { className?: string }) {
    return (
        <div
            aria-busy="true"
            data-testid="monetization-membership-loading"
            className={cn('flex flex-1 flex-col gap-3', className)}
        >
            {/*
             * The tier card's **own** ground, not `--background-surface`: below `md` the screen is
             * that surface (`MEMBERSHIP_SCREEN`), so a surface-coloured placeholder there is not a
             * mismatched colour — it is invisible, and the hero silently stops being reserved at all.
             * Painting it as the card it stands in for is also what keeps the two moments of this
             * screen measuring the same.
             */}
            <div className="flex min-h-[100px] flex-none flex-col justify-center gap-2 rounded-xl border border-(--primary-300) bg-(--primary-50) px-6 py-4">
                <Skeleton w={140} h={16} />
                <Skeleton w={96} h={24} delay={160} />
            </div>

            {/*
             * The list panel's two ends, same as the real screen's — full-bleed below `md`, a card
             * from `md`. A skeleton that measures differently from the thing it stands in for is the
             * defect this file exists to avoid, and a card-shaped skeleton resolving into a
             * full-bleed panel is that defect at the widest possible scale.
             */}
            <div
                className={cn(
                    'flex flex-col overflow-hidden bg-(--background-surface)',
                    MEMBERSHIP_LIST_PANEL,
                )}
            >
                <div className="border-(--separator-default) border-b px-4 py-3">
                    <Skeleton w={88} h={16} />
                </div>
                <div className="flex flex-col gap-3 p-4">
                    <Skeleton w={220} h={36} />
                    <Skeleton w="100%" h={40} delay={120} />
                    {[0, 1, 2, 3].map(row => (
                        <div key={row} className="flex items-center gap-3 py-1">
                            <Skeleton w={44} h={44} delay={row * 80} />
                            <div className="flex flex-1 flex-col gap-1">
                                <Skeleton w={160} h={14} delay={row * 80} />
                                <Skeleton w={120} h={12} delay={row * 80 + 40} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
