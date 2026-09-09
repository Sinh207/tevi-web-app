import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { DONATION_CARD, DONATION_PANEL } from '../lib/container'

/**
 * `/monetization/donation`'s loading shape — the analytics banner, the range row, the supporter
 * tile, and the supporters panel with four rows in it.
 *
 * The same boxes at the same sizes as the real screen, which is a correctness measure rather than
 * tidiness: `EarningsReportSkeleton` records what a hand-rolled skeleton costs when it measures
 * differently from the thing it stands in for.
 *
 * ## It draws the **overview**, and never the wall
 *
 * The state this is standing in for is "we have not asked yet", and the two answers it resolves into
 * are the overview and the intro wall. Drawing either is a guess; drawing the overview is the guess
 * that costs less, because a wall is a single centred block and a reader who lands on it sees one
 * thing appear rather than a layout rearranging. `/monetization/loading.tsx` makes the same call
 * about its banner and states the reasoning.
 *
 * ## It is **not** painted as a surface, and that is the screen's own rule
 *
 * `/monetization/membership`'s skeleton paints its hero in the tier card's tint because that screen
 * is a surface plane below `md`, where a `--background-surface` placeholder is not mismatched but
 * *invisible*. This screen keeps the page colour (see `DONATION_CARD`), so surface blocks are
 * exactly right here — and copying membership's treatment across would be the same mistake in the
 * other direction.
 *
 * No hooks and no `'use client'`, so it renders on the server and a route's `loading.tsx` can use it
 * through `@features/monetization/skeleton` — never through the barrel, which would make the loading
 * boundary a client entry chunk the CSP refuses. That file carries the post-mortem.
 *
 * One `data-testid`, on the root, published as `aria-busy` — `docs/TEST_IDS.md`'s rule for a
 * skeleton: nothing inside it is named.
 */
export function DonationDashboardSkeleton({ className }: { className?: string }) {
    return (
        <div
            aria-busy="true"
            data-testid="monetization-donation-loading"
            className={cn('flex flex-1 flex-col gap-3', className)}
        >
            {/* The analytics banner: tinted and outlined, so it is reserved as itself rather than as
                a grey bar that then turns lilac. */}
            <div className="h-[60px] flex-none rounded-xl border border-(--primary-300) bg-(--primary-50)" />

            {/* The range row — a date label and the filter chip opposite it. */}
            <div className="flex h-8 flex-none items-center justify-between">
                <Skeleton w={120} h={14} />
                <Skeleton w={104} h={28} delay={80} />
            </div>

            <div className={cn('flex flex-none flex-col gap-1.5 p-4', DONATION_CARD)}>
                <Skeleton w={140} h={16} />
                <Skeleton w={64} h={26} delay={160} />
            </div>

            <div className={cn('flex flex-1 flex-col overflow-hidden', DONATION_PANEL)}>
                <div className="border-(--separator-default) border-b px-4 py-3">
                    <Skeleton w={100} h={16} />
                </div>
                <div className="flex flex-col gap-3 p-4">
                    {[0, 1, 2, 3].map(row => (
                        <div key={row} className="flex items-center gap-3 py-1">
                            <Skeleton w={48} h={48} delay={row * 80} />
                            <div className="flex flex-1 flex-col gap-1">
                                <Skeleton w={160} h={14} delay={row * 80} />
                                <Skeleton w={200} h={12} delay={row * 80 + 40} />
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <Skeleton w={56} h={20} delay={row * 80} />
                                <Skeleton w={44} h={16} delay={row * 80 + 40} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
