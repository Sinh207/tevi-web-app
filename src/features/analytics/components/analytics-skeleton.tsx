import { Skeleton } from '@shared/ui/skeleton'

/**
 * The dashboard's loading shape.
 *
 * ## Built at the real geometry, and that is not tidiness
 *
 * Every box here is the size of the thing it stands in for: the 36px period track, the three-line
 * metric tabs, the 200px plot, the 56px thumbnails. A skeleton that is the wrong height produces the
 * jump `docs/DEFINITION_OF_DONE.md` §1 exists to prevent — and this screen is the worst case for it,
 * because the plot is 200px tall and lands *above* the top-earning list, so being 20px out moves
 * every row below it.
 *
 * The `200`, the `56` and the tab column widths are therefore stated in one place each:
 * `PLOT_HEIGHT` here mirrors `metric-chart.tsx`'s, and the comment on each block names its twin.
 *
 * ## No hooks, so it renders on the server
 *
 * Which is what lets the route's `loading.tsx` use the same component the view's own loading state
 * does. Three paths into this screen should not each invent their own idea of what it looks like
 * while loading — the earnings report's skeleton says the same thing.
 */

/** Mirrors `PLOT_HEIGHT` in `metric-chart.tsx`. */
const PLOT_HEIGHT = 200

/**
 * The whole screen, for the route's `loading.tsx` and for the moment before the session is known.
 *
 * Split into three exports rather than one, because after the first load the *bar* stays: pressing
 * `7 days` must not make the controls disappear and come back, so the view keeps them mounted and
 * swaps only the region that is refetching. A single all-or-nothing skeleton is what makes a period
 * press feel like a page navigation.
 */
export function AnalyticsSkeleton() {
    return (
        <div data-testid="analytics-loading" aria-busy="true" className="flex flex-col gap-4">
            {/* The period control: a 36px track, then the timezone/compare line under it. */}
            <div className="flex flex-col gap-3">
                <Skeleton h={36} className="rounded-[100px]" />
                <div className="flex items-center justify-between">
                    <Skeleton w={140} />
                    <Skeleton w={96} h={28} className="rounded-[100px]" />
                </div>
            </div>

            {/* The range summary — one line and its comparison note. */}
            <div className="flex flex-col gap-2">
                <Skeleton w={220} h={20} />
                <Skeleton w={180} />
            </div>

            <MetricPanelSkeleton />
            <TopEarningSkeleton />
        </div>
    )
}

/** The tab strip and the plot. Shown while a period's figures are in flight. */
export function MetricPanelSkeleton() {
    return (
        <div
            aria-busy="true"
            className="flex flex-col rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface)"
        >
            <div
                className={
                    // Clipped, not scrollable: the real strip scrolls, but a skeleton the reader can
                    // drag sideways invites them to interact with a placeholder — and at phone width
                    // four unclipped tab columns run past the card's own border.
                    'flex gap-4 overflow-hidden border-b border-(--separator-default) px-4 py-3'
                }
            >
                {[0, 1, 2, 3].map(index => (
                    <div key={`tab-${index}`} className="flex flex-none flex-col gap-1.5">
                        <Skeleton w={72} delay={index * 160} />
                        <Skeleton w={88} h={24} delay={index * 160} />
                        <Skeleton w={64} delay={index * 160} />
                    </div>
                ))}
            </div>
            <div className="flex flex-col gap-3 p-4">
                <Skeleton w={160} />
                <Skeleton h={PLOT_HEIGHT} className="rounded-[var(--radius-md)]" />
            </div>
        </div>
    )
}

/** Three rows at the real 56px thumbnail height, so the list does not resize when it lands. */
export function TopEarningSkeleton() {
    return (
        <div
            aria-busy="true"
            className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-(--separator-default) bg-(--background-surface) p-4"
        >
            <Skeleton w={160} h={20} />
            {[0, 1, 2].map(index => (
                <div key={`item-${index}`} className="flex items-center gap-3">
                    <Skeleton
                        w={56}
                        h={56}
                        delay={index * 160}
                        className="rounded-[var(--radius-md)]"
                    />
                    <div className="flex min-w-0 flex-auto flex-col gap-1.5">
                        <Skeleton w={64} h={20} delay={index * 160} className="rounded-[100px]" />
                        <Skeleton w="70%" delay={index * 160} />
                        <Skeleton w={104} delay={index * 160} />
                    </div>
                    <Skeleton w={72} h={20} delay={index * 160} />
                </div>
            ))}
        </div>
    )
}
