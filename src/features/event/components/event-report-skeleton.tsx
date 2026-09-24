import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import {
    EVENT_ORDERS_HEADER,
    EVENT_PANEL,
    EVENT_SEARCH_HEIGHT,
    EVENT_TABS_HEIGHT,
} from '../lib/container'

/**
 * One order row, the moment before it has a buyer in it.
 *
 * Exported because `EventOrdersPanel` draws exactly this while its own query is in flight, and the
 * two used to be **separate copies of identical markup**. That is not a tidiness point: the header
 * above them was also two copies, and it drifted — 13px and a missing hairline — with nothing
 * failing, because each copy was individually plausible. One component is what makes that
 * impossible rather than merely unlikely.
 *
 * ⚠ No `'use client'` here, deliberately. `loading.tsx` must stay a server component (see
 * `skeleton.ts` for what importing the barrel does to it), and a module with no directive works in
 * both trees — which is what lets the client panel and the server boundary share one row.
 *
 * The reserved boxes are `EventOrderRow`'s measured parts: a 48px avatar, and a text column of a
 * 20px name over an 18px timestamp. The row's height is the avatar's, so the text column cannot
 * change it — which is why those two are allowed to be approximate and the avatar is not.
 */
export function EventOrderRowsSkeleton({ rows = 6 }: { rows?: number }) {
    return (
        <div className="flex flex-col">
            {Array.from({ length: rows }, (_, index) => `event-order-skeleton-${index}`).map(
                (key, index) => (
                    <div
                        key={key}
                        className="flex items-center gap-3 border-b border-(--separator-default) px-4 py-3 last:border-b-0"
                    >
                        <Skeleton w={48} circle delay={index * 160} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex h-[20px] items-center">
                                <Skeleton w="60%" delay={index * 160} />
                            </div>
                            <div className="flex h-[18px] items-center">
                                <Skeleton w="40%" delay={index * 160 + 80} />
                            </div>
                        </div>
                        <Skeleton w={48} delay={index * 160} />
                    </div>
                ),
            )}
        </div>
    )
}

/**
 * The report page, one moment earlier — the tab track, the search pill, and six rows.
 *
 * Two callers, as always with a skeleton in this app: the route's `loading.tsx` (before the server
 * fetch resolves) and `EventReportScreen`'s own branch, which covers the beat while the session
 * resolves and the ownership verdict is still `'unknown'`. Two ideas of what the page looks like
 * while it loads is one layout shift.
 *
 * A **server component** (no `'use client'`), which is what lets `loading.tsx` stay one.
 *
 * It carries `EVENT_PANEL` itself, so the skeleton and the real list are the same card — the screen
 * wraps only the panel, because the panel is what the block is *for*.
 *
 * ## ⚠ The header is `EVENT_ORDERS_HEADER`, not a hand-written copy of it
 *
 * This block was written out longhand here and again in `EventOrdersPanel`, and the two diverged.
 * Measured, the real header stands at **125px** — `pt-4` 16 + a 36px segmented control + `gap-3` 12
 * + a 48px search bar + `pb-3` 12 + a 1px rule — and this one reserved **112**: it had lost the
 * `pt-4` and the `border-b` when those were added to the panel, and it drew the tab track at
 * `h={40}` for a control that measures 36. So the whole list stepped down 13px and grew a hairline
 * the instant the view arrived, which is precisely the shift a skeleton exists to prevent.
 *
 * Nothing could have caught it. Both blocks were individually correct, both rendered, every test
 * passed — the only way to see it is to measure the two and compare, which is now unnecessary
 * because there is one of them.
 *
 * ⚠ Heights are passed as the `h` **prop**, never `className="h-6"`: `Skeleton` writes its height as
 * an inline style, which beats a class, so a Tailwind height is silently ignored and the bar stays
 * 12px.
 */
export function EventReportSkeleton() {
    return (
        // The same block the real list sits in — `docs/DESIGN_SYSTEM.md` §6's single-panel branch.
        // A skeleton painted differently from the thing it stands in for is §6's own visible half
        // of getting this wrong.
        <div className={cn('flex min-w-0 flex-1 flex-col md:overflow-clip', EVENT_PANEL)}>
            <div className={EVENT_ORDERS_HEADER}>
                <Skeleton h={EVENT_TABS_HEIGHT} className="rounded-(--radius-fill)" />
                <Skeleton h={EVENT_SEARCH_HEIGHT} className="rounded-[24px]" delay={160} />
            </div>

            <EventOrderRowsSkeleton />
        </div>
    )
}
