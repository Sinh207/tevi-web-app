import { Skeleton } from '@shared/ui/skeleton'

/**
 * `/get-star` while the two catalogues are in flight.
 *
 * Geometry is copied by hand from the real parts — `GatewayAccordion`'s `p-3` cards with their 28px
 * marks, the first one open on `StarPackageGrid`'s `p-4` tiles in two columns — for the reason
 * `CardManagementSkeleton` gives: these are plain boxes rather than a shared DS row, so the shape has
 * to be kept in step by reading them, not by sharing a component with them.
 *
 * ⚠ **Every box paints `--background-surface` explicitly.** The dark-mode trap
 * `my-membership-skeleton.tsx` documents: `--background-listing` is `--black` in Dark, the same value
 * as `--background`, so anything leaning on the default fill is a set of black stripes on the page in
 * one theme only — and it looks correct in Light, which is how it ships.
 *
 * Boxes reserve the **real** line heights rather than the bars' own 12px, per `skeleton.tsx`, so the
 * page does not jump when the catalogue lands.
 *
 * No hooks, so it is server-renderable. It is still driven from the view's `isLoading` rather than
 * from a `loading.tsx`: in this app a `loading.tsx` that imports a feature barrel yields a
 * CSP-blocked chunk and the skeleton silently never paints.
 *
 * Three cards and four tiles: enough to read as "an accordion, one open", short of filling a screen
 * with shimmer that a two-package catalogue would then contradict.
 *
 * **The masthead is not here.** It renders above this, outside the loading branch, because none of
 * its top half waits on a request — so a placeholder for it would be a grey box standing in for
 * something already on screen.
 */
export function GetStarSkeleton() {
    return (
        <div
            data-testid="payment-get-star-loading"
            aria-busy="true"
            className="flex flex-col gap-3"
        >
            <div className="flex h-[21px] items-center">
                <Skeleton w={116} />
            </div>
            {Array.from({ length: 3 }, (_, index) => `gateway-skeleton-${index}`).map(
                (key, index) => (
                    <div
                        key={key}
                        className="rounded-(--radius-lg) border border-(--separator-default) bg-(--background-surface)"
                    >
                        <div className="flex items-center gap-2 p-3">
                            {/* 28×28 — the card's mark, so nothing shifts when the logo decodes. */}
                            <Skeleton w={28} h={28} delay={index * 160} />
                            <div className="flex h-[21px] flex-1 items-center">
                                <Skeleton w={112} delay={index * 160} />
                            </div>
                            <div className="flex h-[18px] items-center">
                                <Skeleton w={64} delay={index * 160} />
                            </div>
                        </div>
                        {/* The first card opens on the seeded gateway, so it is drawn open. */}
                        {index === 0 && (
                            <div className="grid grid-cols-2 gap-2 border-(--separator-default) border-t p-3 pt-4">
                                {Array.from(
                                    { length: 4 },
                                    (_, tile) => `package-skeleton-${tile}`,
                                ).map((tileKey, tile) => (
                                    <div
                                        key={tileKey}
                                        className="flex flex-col items-center justify-center gap-1 rounded-(--radius-lg) border-2 border-(--separator-default) bg-(--background-surface) p-4"
                                    >
                                        <div className="flex h-[24px] items-center">
                                            <Skeleton w={72} delay={tile * 160} />
                                        </div>
                                        <div className="flex h-[21px] items-center">
                                            <Skeleton w={48} delay={tile * 160} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ),
            )}
        </div>
    )
}
