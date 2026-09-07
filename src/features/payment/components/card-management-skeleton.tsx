import { Skeleton } from '@shared/ui/skeleton'

/**
 * The loading shape of the card screen: the section header, then bordered boxes where the cards go.
 *
 * Geometry is copied from `SavedCardRow` deliberately and by hand — `px-3 py-4`, the 42×27 mark, the
 * two text lines, the 36px trailing button — because the row is a plain box rather than a DS `ListRow`
 * this time. That is the trade the arrangement buys: the boxes match the web app, and the skeleton has
 * to be kept in step with them by reading the row rather than by sharing a component with it.
 *
 * ⚠ **Each box paints `--background-surface` explicitly.** The dark-mode trap
 * `my-membership-skeleton.tsx` documents: `--background-listing` is `--black` in Dark, the same value
 * as `--background`, so anything that leans on the default fill is three black stripes on the page in
 * one theme only — and it looks correct in Light, which is how it ships.
 *
 * Boxes are reserved at the **real** line heights (24 for the number, 21 for the expiry) rather than at
 * the bars' own 12px, per `skeleton.tsx` — otherwise every box is short and the list jumps when the
 * data lands.
 *
 * No hooks, so it is server-renderable; it is still driven from the hook's `isLoading` rather than from
 * a `loading.tsx`, because a `loading.tsx` importing a feature barrel in this app yields a CSP-blocked
 * chunk and the skeleton silently never paints.
 *
 * `count` is 3: most accounts have one or two cards, and a screenful of shimmer standing in for a
 * single row is a worse first impression than a brief, honest wait.
 */
export function CardManagementSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div data-testid="payment-cards-loading" aria-busy="true" className="flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex h-[24px] items-center">
                    <Skeleton w={132} />
                </div>
                <div className="flex h-7 items-center">
                    <Skeleton w={112} h={28} />
                </div>
            </div>

            <ul className="m-0 flex list-none flex-col gap-3 px-4 pb-4">
                {Array.from({ length: count }, (_, index) => `card-skeleton-${index}`).map(
                    (key, index) => (
                        <li
                            key={key}
                            className="flex items-center gap-3 rounded-(--radius-xl) border border-(--separator-default) bg-(--background-surface) px-3 py-4"
                        >
                            {/* 42×27 — the scheme mark's 780:500 box, so nothing shifts when it decodes. */}
                            <Skeleton w={42} h={27} delay={index * 160} />
                            <div className="flex min-w-0 flex-1 flex-col">
                                <div className="flex h-[24px] items-center">
                                    <Skeleton w={148} delay={index * 160} />
                                </div>
                                <div className="flex h-[21px] items-center">
                                    <Skeleton w={96} delay={index * 160} />
                                </div>
                            </div>
                            <div className="flex size-9 flex-none items-center justify-center">
                                <Skeleton w={20} h={20} delay={index * 160} />
                            </div>
                        </li>
                    ),
                )}
            </ul>
        </div>
    )
}
