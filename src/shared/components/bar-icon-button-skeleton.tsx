import { Skeleton } from '@shared/ui/skeleton'

/**
 * What a `BarIconButton` looks like before its bar has loaded — for `loading.tsx` and the bar
 * skeletons.
 *
 * The control is a bare 24px glyph in a 40px target with no disc at rest, so the placeholder is a
 * glyph-sized mark in the same 40px box: the box keeps the bar's geometry identical across the swap,
 * and the mark matches what lands in it. A 40px circle — what every skeleton drew while the control
 * was a disc — would now be a shape the page never shows.
 *
 * Its own file, without `'use client'`, so a route's loading chunk does not pull in `Button`.
 */
export function BarIconButtonSkeleton({ delay }: { delay?: number }) {
    return (
        <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center">
            <Skeleton circle w={24} h={24} delay={delay} />
        </span>
    )
}

/**
 * The Star pill's placeholder, for a back-button bar's skeleton below `md` (`StarBalancePill` is
 * `md:hidden` on every such bar). Its chip is 32 tall in a 44 target, and ~104 wide for a five-digit
 * figure — reserving it is what keeps the title from sliding sideways when the bar resolves.
 */
export function StarPillSkeleton({ delay }: { delay?: number }) {
    return (
        <span aria-hidden="true" className="flex h-11 flex-none items-center md:hidden">
            <Skeleton w={104} h={32} delay={delay} className="rounded-full" />
        </span>
    )
}
