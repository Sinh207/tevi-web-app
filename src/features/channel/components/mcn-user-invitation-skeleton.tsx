import { Skeleton } from '@shared/ui/skeleton'

/**
 * The letter's lines, each with its own id — the widths repeat, so an index or the width alone is not
 * a stable key and Biome rejects both. `delay` is the DS's 160ms stagger, stated here rather than
 * derived from a loop counter for the same reason.
 */
const LETTER_LINES = [
    { id: 'greeting', w: '40%', delay: 0 },
    { id: 'intro-1', w: '100%', delay: 160 },
    { id: 'intro-2', w: '75%', delay: 320 },
    { id: 'means', w: '55%', delay: 480 },
] as const

/** The two bullets, indented — shorter than the paragraph lines because a bullet is one clause. */
const BULLET_LINES = [
    { id: 'creator', w: '65%', delay: 640 },
    { id: 'permission', w: '85%', delay: 800 },
] as const

/**
 * `/mcn-user-invitation/verify` while the invitation is in flight — and the **same** component the
 * route's `loading.tsx` renders, so the streaming gap and the in-screen wait are one picture rather
 * than two that shift into each other.
 *
 * It draws the screen's real geometry, top to bottom: the tinted sender strip, the headline, the
 * centred support link, the letter with its two bullets, the expiry notice, and the two buttons
 * **side by side** — which is the one shape that must not be copied from the creator screen's
 * skeleton, where they are stacked.
 *
 * The sender strip is reserved at its real height and **without its tint**: a skeleton is a
 * reservation for a shape, and painting the green band before the name that sits on it exists reads
 * as a loaded block with missing text. Legacy's own skeleton is a generic stack of eight rounded
 * blocks that matches none of this, so its layout jumps twice as the screen resolves.
 *
 * ⚠ **Heights go in the `h` prop, never in `className`.** `Skeleton` writes `height` into its inline
 * `style` (defaulting to the DS's 12px bar), and an inline style beats a Tailwind class — so an `h-6`
 * here is silently a 12px bar and the reservation is wrong by half.
 *
 * Rows are reserved at their **line box**, not their font size, which is what
 * `docs/DEFINITION_OF_DONE.md` §1 is really asking for: 14/400 with a 1.5 line-height occupies 21px,
 * and a 14px bar in a 14px row collapses the layout. Hence the bars are shorter than the rows and the
 * rows carry the height.
 *
 * No hooks, so it renders on the server.
 */
export function McnUserInvitationSkeleton() {
    return (
        <div className="flex flex-col">
            {/* The sender strip: a 12px "From" label over a 16/600 name, beside a timestamp.
                24 + 24 + 24 of padding is the 72px the real band occupies. */}
            <div className="flex items-start justify-between gap-3 border-(--separator-default) border-b px-3 py-3">
                <div className="flex flex-col gap-2">
                    <Skeleton w={40} h={10} />
                    <Skeleton w={160} h={14} />
                </div>
                <Skeleton w={96} h={12} delay={160} />
            </div>

            <div className="flex flex-col gap-[10px] p-3">
                {/* Headline — 20/700, so a 30px line box, and it wraps to two lines for most
                    network names. */}
                <div className="flex flex-col gap-2">
                    <div className="flex h-[30px] items-center">
                        <Skeleton w="90%" h={16} />
                    </div>
                    <div className="flex h-[30px] items-center">
                        <Skeleton w="55%" h={16} delay={160} />
                    </div>
                </div>

                {/* The support link, centred as the real one is. */}
                <div className="flex h-[36px] items-center justify-center">
                    <Skeleton w={220} h={12} delay={320} />
                </div>

                <div className="flex flex-col gap-4 px-3 py-2">
                    {LETTER_LINES.map(({ id, w, delay }) => (
                        <div key={id} className="flex h-[21px] items-center">
                            <Skeleton w={w} h={12} delay={delay} />
                        </div>
                    ))}
                    {/* Indented with the same `ps-6` the real list uses, so the bullets do not
                        appear to shift inward when the letter arrives. */}
                    <div className="flex flex-col gap-1 ps-6">
                        {BULLET_LINES.map(({ id, w, delay }) => (
                            <div key={id} className="flex h-[21px] items-center">
                                <Skeleton w={w} h={12} delay={delay} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* The footer: the expiry notice, then Reject and Accept in a row. */}
                <div className="flex flex-col gap-4 px-3 pt-2 pb-6">
                    <Skeleton h={16} />
                    {/* `grid-cols-2`, mirroring the real footer — which uses a grid rather than a
                        flex row because `Button` is `shrink-0`; see the note there. */}
                    <div className="grid grid-cols-2 gap-3">
                        <Skeleton h={48} className="rounded-(--radius-lg)" />
                        <Skeleton h={48} className="rounded-(--radius-lg)" delay={160} />
                    </div>
                </div>
            </div>
        </div>
    )
}
