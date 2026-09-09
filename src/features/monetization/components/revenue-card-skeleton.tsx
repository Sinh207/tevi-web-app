import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * `RevenueCard`'s loading shape — the same boxes at the same sizes as the real card.
 *
 * That is a correctness measure rather than tidiness: `EarningsReportSkeleton`'s doc records what a
 * hand-rolled skeleton costs when it measures differently from the thing it stands in for (a 20px
 * jump per row on every load).
 *
 * ## Its own file, and not a second export from `revenue-card.tsx`
 *
 * `loading.tsx` is a **server** module in the route tree, and it reaches this through
 * `@features/monetization/skeleton`. Sharing a file with `RevenueCard` would defeat that: that file
 * is `'use client'` and pulls `next/link`, `@shared/ui/icon` and `@features/payout/routes` in behind
 * it, so the loading boundary becomes its own client entry chunk — which this app's CSP (nonce +
 * `'strict-dynamic'`) refuses to load, leaving the skeleton silently unpainted.
 * `features/star-transfer/skeleton.ts` carries the full post-mortem; this is the same door.
 *
 * No hooks and no `'use client'`, so it renders on the server.
 */
export function RevenueCardSkeleton({ className }: { className?: string }) {
    return (
        <div
            aria-busy="true"
            className={cn(
                'flex flex-none flex-col gap-3 rounded-xl bg-(--background-surface) p-4',
                className,
            )}
        >
            <div className="flex flex-col gap-1">
                <Skeleton w={96} h={14} />
                <Skeleton w={168} h={32} delay={160} />
                <Skeleton w={200} h={12} delay={320} />
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-(--background) p-3">
                <Skeleton w={140} h={14} />
            </div>
        </div>
    )
}
