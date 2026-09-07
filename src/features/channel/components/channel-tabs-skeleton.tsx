import { Skeleton } from '@shared/ui/skeleton'
import { CHANNEL_PADDING } from '../lib/container'

/**
 * The tab strip's loading shape, and one panel's worth of rows under it.
 *
 * ## Why this exists
 *
 * `ChannelSkeleton` used to stop at the action row. Measured against the live page at 430px, the
 * real layout puts a 48px tab track at y=497 and a list under it, so resolving the load made a whole
 * navigation bar and its panel appear out of nothing — the single largest jump on the screen, and
 * the one a skeleton exists to prevent. It went unnoticed because the loading state is the one
 * screen you cannot reach by browsing; `/dev/space` is now how it gets looked at.
 *
 * ## The geometry is the DS's, not a guess
 *
 * The underline segmented control is `h-12` per item with `inset 0 -1px --separator-default` as the
 * track rule (`shared/ui/segmented-control.tsx`), and the selected item swaps that for
 * `inset 0 -2px --text-title`. Both are reproduced here rather than approximated with a border,
 * because a border would add a pixel to the track and shift everything below it.
 *
 * Three columns, not four: `live` is owner-only and ownership is not known server-side, so the
 * skeleton draws the set every visitor gets. Appending a fourth later widens the columns without
 * moving anything vertically, which is the same reason `channel-tabs.tsx` appends rather than swaps.
 *
 * The first column carries the selected rule. `posts` is always the default tab, so the skeleton can
 * say which one is coming without knowing anything.
 */
export function ChannelTabsSkeleton() {
    return (
        // `aria-busy` on the root, which is this repo's loading contract — every other
        // `*-skeleton.tsx` carries it, and it is what a suite waits for the absence of rather than
        // sleeping. This file was the one that had it only on the inner track. See docs/TEST_IDS.md.
        <div
            data-testid="channel-tabs-loading"
            aria-busy="true"
            className="flex min-w-0 flex-col bg-(--background-surface) md:rounded-b-[var(--radius-xl)]"
        >
            {/*
             * Same wrapper the real bar gets in `channel-tabs.tsx` — including the `md:` surface,
             * without which the track paints a band a shade off the card it sits in.
             */}
            <div className="bg-(--background-surface) px-3 md:px-6">
                <div aria-hidden="true" className="flex w-full items-stretch">
                    {[0, 1, 2].map(index => (
                        <div
                            key={index}
                            className={`flex h-12 min-w-0 flex-1 basis-0 items-center justify-center px-2 ${
                                index === 0
                                    ? 'shadow-[inset_0_-2px_0_var(--text-title)]'
                                    : 'shadow-[inset_0_-1px_0_var(--separator-default)]'
                            }`}
                        >
                            <Skeleton w={56} delay={index * 160} />
                        </div>
                    ))}
                </div>
            </div>

            {/*
             * A few rows of the panel. Posts is the default tab and its rows are a 40px thumbnail
             * over two lines of text, so this is that shape — enough to fill the fold rather than
             * leaving the page ending at the tab strip, which reads as "there is nothing here".
             */}
            <div className={`flex min-w-0 flex-col gap-3 ${CHANNEL_PADDING}`}>
                {[0, 1, 2, 3].map(index => (
                    <div
                        key={index}
                        className="flex min-w-0 items-center gap-3 rounded-[var(--radius-xl)] border border-(--separator-default) p-3"
                    >
                        <Skeleton
                            w={40}
                            h={40}
                            className="rounded-[var(--radius-md)]"
                            delay={index * 160}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex h-[21px] items-center">
                                <Skeleton w="70%" delay={index * 160} />
                            </div>
                            <div className="flex h-[18px] items-center">
                                <Skeleton w={96} delay={index * 160} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
