import {
    BarIconButtonSkeleton,
    StarPillSkeleton,
} from '@shared/components/bar-icon-button-skeleton'
import { cn } from '@shared/lib/utils'
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
 * `gap-2` apart. It arrived after this file was written, so resolving the load grew a second button
 * out of nothing. (The bar used to carry a centred title too; it no longer does, so neither does this.)
 * A space with no `shareable_url` gets one trailing button rather than two — the skeleton draws the
 * common shape, as its stats strip does.
 */
export function ChannelTopBarSkeleton() {
    return (
        <div className="sticky top-0 z-20 bg-(--background-surface) md:bg-(--background) max-sm:h-0 max-sm:bg-transparent print:hidden">
            {/*
             * `px-0 max-sm:px-4` and `max-sm:h-0` — **copied from `ChannelTopBar`, and they have to
             * stay copied.** Below `sm` the real bar sits over the cover with no layout height, so a
             * skeleton that kept its 60px would drop the whole page 60px on arrival. This
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
                    'relative flex h-[60px] items-center justify-between px-0 max-sm:px-4',
                )}
            >
                {/* Back + the Star pill, as one cluster with `AppBarCluster`'s `gap-2`. */}
                <div className="flex items-center gap-2">
                    {/* `BarIconButton`'s 40px target, holding a glyph-sized mark — see that skeleton. */}
                    <BarPlaceholder />
                    {/* The Star pill, below `md` — `ChannelTopBar` carries it there. Below `sm` it sits
                        on the cover skeleton, so it is the same solid plate as the controls. */}
                    <span
                        aria-hidden="true"
                        className="h-8 w-[104px] flex-none rounded-full bg-black/25 sm:hidden"
                    />
                    <span className="contents max-sm:hidden">
                        <StarPillSkeleton delay={160} />
                    </span>
                </div>

                {/* Share + the overflow menu, the cluster's own `gap-2` between them. */}
                <div className="flex items-center gap-2">
                    <BarPlaceholder delay={320} />
                    <BarPlaceholder delay={480} />
                </div>
            </div>
        </div>
    )
}

/**
 * One control's placeholder, in the shape the bar will actually have: the glyph-sized mark from `sm`
 * (ghost controls), and below `sm` the dark 40px plate the real controls wear over the cover. That
 * plate is drawn **solid rather than shimmering** — a skeleton block on the cover's own skeleton is
 * the same grey on the same grey, i.e. invisible.
 */
function BarPlaceholder({ delay }: { delay?: number }) {
    return (
        <>
            <span
                aria-hidden="true"
                className="size-10 flex-none rounded-full bg-black/25 sm:hidden"
            />
            <span className="contents max-sm:hidden">
                <BarIconButtonSkeleton delay={delay} />
            </span>
        </>
    )
}
