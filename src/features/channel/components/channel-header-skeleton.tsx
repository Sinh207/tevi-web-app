import { cn } from '@shared/lib/utils'
import { Skeleton } from '@shared/ui/skeleton'
import { CHANNEL_PADDING } from '../lib/container'

/**
 * The header's loading shape.
 *
 * ## The DoD item this is written to actually pass
 *
 * §1 asks for "a skeleton matching the final layout's shape", and the way that requirement gets
 * failed is by giving each bar the height of its text. A 16px line of `type-body-*` occupies **24px**
 * once its 1.5 line-height is counted, so a 12px bar in a 12px row collapses the block and
 * everything below it jumps when the real content lands.
 *
 * So each row here reserves its **real** height and puts the DS's 12px bar inside it. The numbers
 * are derived, not chosen: `type-body-*` (16) → 24, `type-dense-*` (14) → 21, `type-title-t2-*` (20)
 * → 30. Same paddings, same gaps and the same negative overlap as `channel-header.tsx`, so toggling
 * between the two in `/dev` should move nothing.
 *
 * Server-renderable — no hooks — which is why `loading.tsx` and `/my-space`'s waiting state can both
 * use it.
 */
export function ChannelHeaderSkeleton({ className }: { className?: string }) {
    return (
        <section
            data-testid="channel-header-loading"
            aria-busy="true"
            className={cn(
                'flex w-full flex-col rounded-none bg-(--background-surface) md:rounded-t-[var(--radius-xl)]',
                // Same clip as the real header: the cover block is full-width and square, so without
                // it the corners poke through the rounded card at `md` and up — and a skeleton that
                // does not match the shape it stands in for is the one thing it must not be.
                'overflow-hidden',
                className,
            )}
        >
            {/* Same ratio as the real cover, so the block below it starts at the same offset. */}
            <Skeleton h="auto" className="aspect-[402/140] w-full rounded-none" />

            <div className={cn('flex min-w-0 flex-col gap-3 md:gap-6', CHANNEL_PADDING)}>
                <div className="-mt-9 flex min-w-0 items-end gap-3 md:-mt-[76px]">
                    {/*
                     * 80 → 120 at `md`, and the lift above, both matching `channel-header.tsx`
                     * exactly. These two files have to move together: a skeleton whose avatar is 80
                     * where the real one is 120 shifts everything below it by 40px on load, which is
                     * the single defect a skeleton exists to prevent.
                     */}
                    <Skeleton
                        circle
                        /*
                         * **Sized by class, not by `w`/`h`** — and that is the whole fix, not a
                         * style preference. Those two props are written as **inline styles**
                         * (`shared/ui/skeleton.tsx`), and an inline `width: 80px` outranks every
                         * class, so the `md:size-[120px]` beside them did nothing: the avatar stayed
                         * 80 at every width while the real one grows to 120 at `md`. Measured
                         * against the real header on the same page — the block below it started 40px
                         * too high, which is exactly the shift the comment above swears this file
                         * exists to prevent, sitting in the file the whole time.
                         *
                         * `size-20` is 80. Anything responsive on a `Skeleton` has to go through
                         * `className` for the same reason; reach for `w`/`h` only for a fixed box.
                         */
                        className="size-20 ring-4 ring-(--background) md:size-[120px] md:ring-(--background-surface)"
                    />

                    {/* Four columns, matching a fully-populated header: a 24-tall value row over a
                        21-tall label row. The real strip renders 1–4 columns, so this is the
                        widest case — reserving less would shrink on load. */}
                    <div className="flex min-w-0 flex-1 items-end gap-2">
                        {[0, 1, 2, 3].map(index => (
                            <div key={index} className="flex min-w-0 flex-1 flex-col items-center">
                                <div className="flex h-[24px] items-center">
                                    <Skeleton w={40} delay={index * 160} />
                                </div>
                                <div className="flex h-[21px] items-center">
                                    <Skeleton w={56} delay={index * 160} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                    {/*
                     * The identity block is **51 tall with no gap inside it** — the DS pins
                     * `CardUserHeader[type=space]` at exactly that, 30 for the name row over 21 for
                     * the hint. This used to be two siblings of the outer `gap-3`, which put 12px
                     * between them and made the skeleton 63 where the real header is 51: a 12px
                     * error on every channel, data or no data. Measured in the browser against
                     * `/dev/space`, which is what that page is for.
                     */}
                    <div className="flex min-w-0 flex-col">
                        {/* Name row: 30 tall (20px × 1.5), with the two badge circles beside it. */}
                        <div className="flex h-[30px] items-center gap-1">
                            <Skeleton w={180} />
                            <Skeleton circle w={18} h={18} delay={160} />
                            <Skeleton circle w={18} h={18} delay={320} />
                        </div>
                        {/* Link hint: 21 tall (14px × 1.5). */}
                        <div className="flex h-[21px] items-center">
                            <Skeleton w={150} />
                        </div>
                    </div>

                    {/*
                     * Bio — three lines at descending widths, the shape a paragraph really has.
                     *
                     * ⚠ **No gap between the lines.** They are the line boxes of one `<p>`, and a
                     * paragraph has none: its 24px comes from `type-body-default`'s line-height, not
                     * from spacing. The `gap-2` that used to be here added 8px twice, so a three-line
                     * bio reserved 88 against the real 72 — and the 16px landed on the action row
                     * below, on every channel. Each row still reads as its own line because the DS
                     * bar is 12 inside a 24 box; the air is the line box's, exactly as in the real
                     * paragraph.
                     */}
                    <div className="flex flex-col">
                        {['100%', '96%', '60%'].map((width, index) => (
                            <div key={width} className="flex h-[24px] items-center">
                                <Skeleton w={width} delay={index * 160} />
                            </div>
                        ))}
                    </div>

                    {/*
                     * Four social marks, then the joined-date row, at 20 — which is the header's
                     * *ink*, not any one of its nominal sizes. A brand mark is drawn at 24 and a
                     * UI glyph at 20 precisely so that both land near 19.4px of actual artwork
                     * (`SOCIAL_MARK_SIZE`); a placeholder stands in for what is painted. These
                     * were 24 and 20: the first matched the header while it was still oversized,
                     * the second matched nothing at all.
                     *
                     * `gap-1` and not the row's own `gap-0`, because these circles stand in for
                     * the *glyphs* and are drawn without the 24px anchor that holds the real
                     * marks apart. 4px here is the separation that row actually shows.
                     *
                     * The **row** is `h-6` even though the circles are 20: each real mark sits in a
                     * `size-6` anchor (`channel-bio.tsx`), so the row is 24 tall and the artwork
                     * inside it is not. Without the height this row measured 20 and every channel's
                     * action row sat 4px high.
                     */}
                    <div className="flex h-6 items-center gap-1">
                        {[0, 1, 2, 3].map(index => (
                            <Skeleton key={index} circle w={20} h={20} delay={index * 160} />
                        ))}
                    </div>
                    <div className="flex h-[24px] items-center gap-1">
                        <Skeleton circle w={20} h={20} />
                        <Skeleton w={130} />
                    </div>
                </div>

                {/* The action row: two 48-tall buttons, the DS `size="large"` height. */}
                <div className="flex items-center gap-2">
                    <Skeleton h={48} className="flex-1 rounded-[var(--radius-lg)]" />
                    <Skeleton h={48} className="flex-1 rounded-[var(--radius-lg)]" delay={160} />
                </div>
            </div>
        </section>
    )
}
