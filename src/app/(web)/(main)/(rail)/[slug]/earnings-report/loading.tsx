import { EARNINGS_CONTAINER, EarningsReportSkeleton } from '@features/earnings'

/**
 * Shown during the streaming gap and on a client-side navigation into the report.
 *
 * It exists to **override** `app/(web)/(main)/[slug]/loading.tsx`, which is the channel page's skeleton
 * — a cover photo, an avatar and a tab strip. Without this file that is what a creator sees for
 * the moment before their earnings screen arrives, because a `loading.tsx` covers its segment and
 * everything nested under it. A skeleton that stands in for the wrong screen is worse than none:
 * it promises a layout that never appears.
 *
 * `EarningsReportSkeleton` has no hooks, so it renders on the server — the same component the
 * view's own loading state uses, which is the point. Three paths into this screen should not each
 * invent their own idea of what it looks like while loading.
 *
 * The bar is **not** drawn here. It is server-rendered by the page itself, so during the gap the
 * real one is already on screen; a second one in the skeleton would flash and be replaced.
 */
export default function Loading() {
    return (
        <main className="flex flex-1 flex-col">
            <div className={`${EARNINGS_CONTAINER} flex flex-1 flex-col gap-4 pb-6`}>
                <EarningsReportSkeleton />
            </div>
        </main>
    )
}
