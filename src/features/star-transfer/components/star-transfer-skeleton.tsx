import { LedgerSkeleton } from '@shared/components/ledger'
import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'

/**
 * The gate's loading state, and the route's `loading.tsx` shape.
 *
 * Composed from the parts the real screen uses, and the hero keeps its **purple** rather than becoming a
 * grey slab: the artwork behind it is a fixed image, so a neutral placeholder would be a
 * different-coloured block that then flips — two visual changes where there should be one. `/my-star`'s
 * skeleton makes the same call about its black card.
 *
 * The radii and the padding follow the screen (`md:` only, full-bleed below), so the placeholder and the
 * real thing have the same outline at every width — and the three heights that decide where the rows land
 * (tile **83**, Features heading **24**, history header **61**) are measured off the live screen rather
 * than eyeballed. That is the whole point of a skeleton: replacing it must move nothing.
 *
 * ## Its own module, and **not** `'use client'`
 *
 * It started life at the bottom of `star-transfer-view.tsx`, which was wrong for the route's
 * `loading.tsx`: that file is a server component, and importing the skeleton from a `'use client'`
 * module drags that module's whole graph — both dialog stacks, four hooks, base-ui's collapsible —
 * into the loading boundary, to draw three grey rectangles. Here every part it uses is hookless, so it
 * renders on the server for both callers and the loading chunk stays the size of what it draws.
 */
export function StarTransferSkeleton({ className }: { className?: string }) {
    return (
        <div
            className={cn('flex flex-1 flex-col', className)}
            data-testid="star-transfer-loading"
            aria-busy="true"
        >
            {/* The hero keeps its purple artwork rather than becoming a grey slab: the art is a fixed
                image, so a placeholder rectangle would be a different-coloured block that then flips —
                two visual changes where there should be one. Same call `/my-star`'s skeleton makes about
                its black card. */}
            <div className="flex min-h-[120px] items-center justify-between bg-(--primary-500) p-8 md:rounded-t-lg">
                <div className="flex flex-col gap-2">
                    <Skeleton w={120} h={14} />
                    <Skeleton w={140} h={32} delay={80} />
                </div>
                <Skeleton w={42} h={42} delay={160} />
            </div>
            <div className="flex flex-1 flex-col bg-(--primary-500) md:rounded-b-lg">
                <div className="flex flex-1 flex-col gap-2.5 bg-(--background-surface) p-3 md:rounded-lg">
                    {/* The Features heading: a 24px line box, measured off the real `<h2>`. */}
                    <div className="flex h-6 items-center">
                        <Skeleton w={72} h={14} />
                    </div>
                    {/*
                     * `flex-1`, and it is not cosmetic: `Skeleton` takes `w-full flex-none` when no width
                     * is given, so two of them in a flex row each claimed the panel's full width and could
                     * not shrink — the second one hung 340px past the viewport and the whole document
                     * scrolled sideways while the screen loaded. Measured at 1100px: two 588px blocks, the
                     * second ending at 1440.
                     */}
                    <div className="flex gap-2">
                        <Skeleton h={83} delay={80} className="w-auto flex-1" />
                        <Skeleton h={83} delay={160} className="w-auto flex-1" />
                    </div>
                    {/*
                     * The history header, at its **measured** 61px: `pt-6` + a 24px line box + `pb-3` + the
                     * 1px rule, which is the same arithmetic the sticky offsets depend on
                     * (`TransferHistoryPanel`). A 14px bar in a 30px box — what this was — dropped the rows
                     * 31px higher than they land, so the list jumped as it arrived.
                     */}
                    <div className="flex h-6 items-center border-(--separator-default) border-b pt-6 pb-3 box-content">
                        <Skeleton w={140} h={14} />
                    </div>
                    <LedgerSkeleton />
                </div>
            </div>
        </div>
    )
}
