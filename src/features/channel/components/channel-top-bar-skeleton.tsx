import { BarIconButtonSkeleton } from '@shared/components/bar-icon-button-skeleton'
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
 * two are interchangeable.
 *
 * ## It matches the bar the page actually has, which took two corrections
 *
 * **40, not 44.** `ChannelTopBar` wears `BarIconButton`, a 40px target — the 44 here was the DS `App
 * Bar` button, which is what the *other* bar family uses (see that component's note). Four pixels
 * per button, on both sides.
 *
 * **Three placeholders, not two.** The real trailing cluster is share **and** the overflow menu,
 * `gap-2` apart, and the bar carries a **centred title**. Both arrived after this file was written,
 * so resolving the load grew a second button out of nothing and dropped a title into an empty middle.
 * A space with no `shareable_url` gets one trailing button rather than two — the skeleton draws the
 * common shape, as its stats strip does.
 */
export function ChannelTopBarSkeleton() {
    return (
        <div className="sticky top-0 z-20 bg-(--background-surface) md:bg-(--background) print:hidden">
            {/*
             * `px-0` — **copied from `ChannelTopBar` (`md:px-0` above, `max-md:px-0` below), and it
             * has to stay copied.** This
             * used to be `px-2`, which put the placeholder circle 8px from the column edge while
             * the real button sat at 16, so the bar's contents slid sideways the moment the
             * channel resolved — the exact class of shift this component exists to prevent, just
             * on the other axis. Measured, not inferred: `AppBarCluster` adds nothing of its own,
             * so the button's offset *is* the bar's padding.
             */}
            <div
                data-testid="channel-top-bar-loading"
                aria-busy="true"
                className={cn(
                    CHANNEL_CONTAINER,
                    'relative flex h-[60px] items-center justify-between px-0',
                )}
            >
                {/* `BarIconButton`'s 40px target, holding a glyph-sized mark — see that skeleton. */}
                <BarIconButtonSkeleton />

                {/*
                 * The centred title, at the height its text occupies: `AppBarTitleText` is
                 * `type-body-strong` (16), so the line box is 24 and the DS bar is 12 inside it.
                 * A fixed 160 rather than a share of the width — a name is a name at any viewport,
                 * and a percentage would make the placeholder grow into a headline on a desktop.
                 *
                 * **Absolutely centred, exactly as `AppBarTitle` is.** In the flow it rides
                 * `justify-between` between a 40px cluster and an 88px one, which put it 24px left
                 * of the bar's middle — a placeholder that then slides sideways when the real title
                 * lands. The RTL flip is the DS component's own: `start-1/2` is logical but the
                 * translate that pulls the box back onto its centre is not.
                 */}
                <div className="absolute start-1/2 top-1/2 flex h-[24px] -translate-x-1/2 -translate-y-1/2 items-center rtl:translate-x-1/2">
                    <Skeleton w={160} delay={160} />
                </div>

                {/* Share + the overflow menu, the cluster's own `gap-2` between them. */}
                <div className="flex items-center gap-2">
                    <BarIconButtonSkeleton delay={320} />
                    <BarIconButtonSkeleton delay={480} />
                </div>
            </div>
        </div>
    )
}
