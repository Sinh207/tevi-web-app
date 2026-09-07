import { cn } from '@shared/lib/utils'
import { Card, CardMeta } from '@shared/ui/card'
import { Skeleton } from '@shared/ui/skeleton'
import { PAYOUT_BLOCK } from '../lib/container'

/**
 * The withdraw form's loading state, **built from the same parts as the form**.
 *
 * The first version was three grey boxes of 96 / 140 / 180px — numbers picked to look about right, which
 * is the failure mode a skeleton has: it measures differently from the screen it stands in for, so the
 * whole column jumps as the data lands. Here every block is the real one with `Skeleton` where the text
 * goes, so the heights come out of the same padding and type as the form's.
 *
 * Two details that are the point rather than polish:
 *
 * - **The balance card is the real `Card type="balance"`**, gradient and all. It is the one block on this
 *   screen that does not depend on the two lists — the balance comes from a provider mounted above every
 *   route — so drawing it grey would be hiding a figure the app already has.
 * - **The option row is two cards side by side from `md`**, matching the form's `md:grid-cols-2`. A single
 *   full-width box there reflows into two the moment the options arrive, which is the most visible jump
 *   on the screen.
 *
 * The stagger is `delay` on each `Skeleton`, ramping down the column — the same ordering
 * `ActionRowsSkeleton` uses, so the two loading states on `/my-wallet` and here read as one app.
 */
export function PayoutRequestSkeletonForm() {
    return (
        <div aria-busy="true" className="flex flex-col gap-3">
            {/* Balance — the real card, since the figure does not wait on this screen's queries. */}
            <Card type="balance" className="flex-none">
                <CardMeta gap="8" justify="between" className="w-full items-center">
                    <Skeleton w={92} h={14} />
                    <Skeleton w={120} h={18} delay={60} />
                </CardMeta>
            </Card>

            {/* Withdraw amount: header + rate, then the field row, then the helper line. */}
            <section
                className={cn(PAYOUT_BLOCK, 'flex flex-col gap-2 bg-(--background-surface) p-3')}
            >
                <div className="flex items-baseline justify-between gap-3">
                    <Skeleton w={140} h={18} delay={80} />
                    <Skeleton w={110} h={14} delay={100} />
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex flex-1 items-center border-(--separator-default) border-b py-2">
                        <Skeleton w={128} h={20} delay={120} />
                    </div>
                    <Skeleton w={34} h={18} delay={140} />
                </div>
                <Skeleton w={220} h={12} delay={160} />
            </section>

            {/* Withdraw method: the section label, then the card with its 36px mark and four lines. */}
            <section className="flex flex-col gap-2">
                <Skeleton w={120} h={14} delay={180} />
                <div
                    className={cn(
                        PAYOUT_BLOCK,
                        'flex items-center gap-[10px] bg-(--background-surface) p-3',
                    )}
                >
                    <Skeleton w={36} h={36} circle delay={200} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Skeleton w={88} h={12} delay={220} />
                        <Skeleton w={150} h={18} delay={240} />
                        <Skeleton w={110} h={14} delay={260} />
                    </div>
                </div>
            </section>

            {/* Withdraw option: two cards from `md`, as the form lays them out. */}
            <section className="flex flex-col gap-2">
                <Skeleton w={112} h={14} delay={280} />
                <div className="grid gap-2 md:grid-cols-2">
                    {[0, 1].map(index => (
                        <div
                            key={index}
                            className={cn(
                                PAYOUT_BLOCK,
                                'flex flex-col gap-1 bg-(--background-surface) p-3',
                            )}
                        >
                            <div className="flex items-center gap-1">
                                <Skeleton w={20} h={20} circle delay={300 + index * 40} />
                                <Skeleton w={64} h={16} delay={320 + index * 40} />
                            </div>
                            <Skeleton w={44} h={12} delay={340 + index * 40} />
                            <Skeleton w={132} h={16} delay={360 + index * 40} />
                            <Skeleton w={56} h={12} delay={380 + index * 40} />
                        </div>
                    ))}
                </div>
            </section>

            {/* The summary's three lines — sub-receive, then two fees. */}
            <section
                className={cn(PAYOUT_BLOCK, 'flex flex-col gap-2 bg-(--background-surface) p-3')}
            >
                {[168, 150, 176].map((width, index) => (
                    <div key={width} className="flex items-center justify-between gap-3">
                        <Skeleton w={width} h={14} delay={460 + index * 40} />
                        <Skeleton w={96} h={14} delay={480 + index * 40} />
                    </div>
                ))}
            </section>
        </div>
    )
}
