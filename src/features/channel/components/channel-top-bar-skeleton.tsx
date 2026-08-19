import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { CHANNEL_CONTAINER } from '../lib/container'

/**
 * The bar's shape while the channel is unknown.
 *
 * ## Why this exists at all
 *
 * Without it the page shifts by exactly 60px the moment the channel resolves: the loading state had
 * no bar, the loaded state has a 60-tall sticky one, so everything below jumps down. And because
 * `loading.tsx` renders the same skeleton, that jump is the *first* thing a visitor sees.
 *
 * It reserves the same 60px, the same sticky position and the same z-index as `ChannelTopBar`, so the
 * two are interchangeable. The back button is real rather than a placeholder circle — it works without
 * knowing anything about the channel, and a visitor who lands on a slow page should be able to leave
 * it. That is the one thing worth *not* skeletonising.
 */
export function ChannelTopBarSkeleton() {
    return (
        <div className="sticky top-0 z-20 bg-(--background) print:hidden">
            {/*
             * `px-4 md:px-0` — **copied from `ChannelTopBar`, and it has to stay copied.** This
             * used to be `px-2`, which put the placeholder circle 8px from the column edge while
             * the real button sat at 16, so the bar's contents slid sideways the moment the
             * channel resolved — the exact class of shift this component exists to prevent, just
             * on the other axis. Measured, not inferred: `AppBarCluster` adds nothing of its own,
             * so the button's offset *is* the bar's padding.
             */}
            <div
                aria-busy="true"
                className={cn(
                    CHANNEL_CONTAINER,
                    'flex h-[60px] items-center justify-between px-4 md:px-0',
                )}
            >
                {/*
                 * Two buttons and nothing between them — the real bar has no title, so a placeholder
                 * for one would appear on load and then vanish, which is a shift in the opposite
                 * direction to the one this component prevents.
                 */}
                {/* 44px is the DS `1-icon` App Bar button box, so the real bar's button lands here. */}
                <Skeleton circle w={44} h={44} />
                <Skeleton circle w={44} h={44} delay={160} />
            </div>
        </div>
    )
}
