import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { EVENT_CARD, EVENT_PADDING } from '../lib/container'

/**
 * The event page, one moment earlier.
 *
 * ## It reserves the blocks that are always there, and nothing else
 *
 * Banner, status chip, title, schedule, action row, host card, watch panel. What it does **not**
 * draw is the description card, and that is the rule rather than an omission: most events have no
 * description, so reserving one would make the page *shrink* on load for the majority. A skeleton
 * that guesses is worse than one that under-reserves — the same call `docs/DEFINITION_OF_DONE.md`
 * §1 asks for, and the reason each bar below sits inside a row of its real height.
 *
 * ## Two callers, one file
 *
 * `loading.tsx` (the route's own boundary, before the server fetch resolves) and `EventScreen`'s
 * loading branch (a client navigation with nothing seeded). They are the same layout at two
 * moments, so a second copy would be a second thing to keep in step — and the failure mode is
 * silent: the skeleton and the page simply stop matching.
 *
 * It is a **server component** (no `'use client'`), which is what lets `loading.tsx` stay one.
 *
 * ⚠ Every bar passes `h` as a **prop**, never `className="h-6"`: `Skeleton` writes its height as an
 * inline style, which beats a class, so a Tailwind height is silently ignored and the bar stays
 * 12px. That has bitten in this repo before.
 */
export function EventSkeleton() {
    return (
        <>
            <section className={cn('flex min-w-0 flex-col overflow-clip', EVENT_CARD)}>
                {/* The banner is a block, not a bar — `aspect-video` so it reserves exactly what
                    the real one occupies at every width. */}
                {/* The banner's own corners — `EVENT_CARD` rounds at every width, so the skeleton
                    has to as well or the block it stands in for changes shape on load. */}
                <Skeleton h="100%" className="aspect-video w-full rounded-none rounded-t-2xl" />

                <div className={cn('flex items-center', EVENT_PADDING, 'py-3 md:py-3')}>
                    {/* The chip: 20 tall, which is `Badge size="small"`. */}
                    <Skeleton w={92} h={20} className="rounded-(--radius-fill)" />
                </div>
                <hr className="border-(--separator-default)" />

                <div className={cn('flex min-w-0 flex-col gap-4', EVENT_PADDING)}>
                    {/* `type-title-t1-semibold` is 24/1.4 ⇒ a 34px row. Two lines, because a
                        creator-typed title routinely wraps once in a 612px column. */}
                    <div className="flex flex-col gap-1">
                        <div className="flex h-[34px] items-center">
                            <Skeleton w="82%" h={16} />
                        </div>
                        <div className="flex h-[34px] items-center">
                            <Skeleton w="46%" h={16} delay={160} />
                        </div>
                    </div>
                    {/* The schedule: a 36px tile beside two lines of 20px. */}
                    <div className="flex items-center gap-2">
                        <Skeleton w={36} h={36} className="rounded-(--radius-md)" />
                        <div className="flex flex-col gap-1">
                            <div className="flex h-[20px] items-center">
                                <Skeleton w={104} delay={160} />
                            </div>
                            <div className="flex h-[20px] items-center">
                                <Skeleton w={56} delay={320} />
                            </div>
                        </div>
                    </div>
                </div>
                <hr className="border-(--separator-default)" />

                {/* The action row — `Button size="medium"` is 40 tall. */}
                <div className={cn(EVENT_PADDING)}>
                    <Skeleton h={40} className="rounded-(--radius-md)" />
                </div>
            </section>

            {/* The host card: a 40px avatar beside two lines. */}
            <div className={cn('flex items-center gap-3', EVENT_CARD, EVENT_PADDING)}>
                <Skeleton w={40} circle />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex h-[18px] items-center">
                        <Skeleton w={72} delay={160} />
                    </div>
                    <div className="flex h-[20px] items-center">
                        <Skeleton w="52%" delay={320} />
                    </div>
                </div>
            </div>

            {/* The watch panel: a 48px disc, a title, a sentence, and one large button. Centred,
                because the real one is. */}
            <div
                className={cn(
                    'flex flex-col items-center gap-4',
                    EVENT_CARD,
                    EVENT_PADDING,
                    'py-6 md:py-8',
                )}
            >
                <Skeleton w={48} circle />
                <div className="flex w-full max-w-[340px] flex-col items-center gap-2">
                    <div className="flex h-[26px] items-center">
                        <Skeleton w={168} h={16} delay={160} />
                    </div>
                    <div className="flex h-[20px] items-center">
                        <Skeleton w={240} delay={320} />
                    </div>
                </div>
                {/* `Button size="large"` is 48 tall. */}
                <Skeleton
                    h={48}
                    className="w-full max-w-[340px] rounded-(--radius-md)"
                    delay={480}
                />
            </div>
        </>
    )
}
