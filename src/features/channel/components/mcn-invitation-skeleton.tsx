import { Skeleton } from '@shared/ui/skeleton'

/**
 * The letter's five bars, each with its own id — the widths repeat (`100%` twice), so an index or the
 * width alone is not a stable key and Biome rejects both. `delay` is the DS's 160ms stagger, stated
 * here rather than derived from a loop counter for the same reason.
 */
const LETTER_LINES = [
    { id: 'greeting', w: '40%', delay: 0 },
    { id: 'intro-1', w: '100%', delay: 160 },
    { id: 'intro-2', w: '100%', delay: 320 },
    { id: 'respond', w: '65%', delay: 480 },
    { id: 'regards', w: '30%', delay: 640 },
] as const

/**
 * `/invitation/verify` while the invitation is in flight — and the **same** component the route's
 * `loading.tsx` renders, so the streaming gap and the in-screen wait are one picture rather than two
 * that shift into each other.
 *
 * It draws the screen's real geometry, top to bottom: the 172px hero band, the "Joining … network!"
 * headline, the MCN-name chip, the two rate figures inside their dashed frame, five lines of letter,
 * and the two stacked buttons. Legacy's own skeleton is a generic stack of eight rounded blocks that
 * matches none of that, so its layout jumps twice as the screen resolves.
 *
 * The hero is a **solid block, not a shimmer of the illustration**: the real thing is a full-bleed
 * gradient image, and a skeleton is a reservation for a shape, never a guess at a picture.
 *
 * ⚠ **Heights go in the `h` prop, never in `className`.** `Skeleton` writes `height` into its inline
 * `style` (defaulting to the DS's 12px bar), and an inline style beats a Tailwind class — so an
 * `h-6` here is silently a 12px bar and the reservation is wrong by half. `MCN_PARTNERSHIP_SKELETON`
 * next door has that bug today; it is not copied here.
 *
 * Rows are reserved at their **line box**, not their font size, which is what
 * `docs/DEFINITION_OF_DONE.md` §1 is really asking for: 14/400 with a 1.5 line-height occupies 21px,
 * and a 14px bar in a 14px row collapses the layout. Hence the bars are shorter than the rows and
 * the rows carry the height.
 *
 * No hooks, so it renders on the server.
 */
export function McnInvitationSkeleton() {
    return (
        <div className="flex flex-col">
            {/* The hero band, at exactly the height the image occupies — see `MCN_INVITATION_ART`. */}
            <Skeleton h={172} className="rounded-none" />

            <div className="flex flex-col gap-[10px] p-3">
                {/* Headline — 18/600, so a 27px line box. */}
                <div className="flex h-[27px] items-center">
                    <Skeleton w="70%" h={16} />
                </div>

                {/* The MCN-name chip: a filled row with a trailing help disc. */}
                <div className="flex items-center justify-between gap-3 rounded-(--radius-md) bg-(--background-subtle) px-3 py-2">
                    <Skeleton w={180} h={14} />
                    <Skeleton w={24} h={24} circle />
                </div>

                {/* The two rates, inside the same dashed frame the real block uses. */}
                <div className="flex items-center justify-evenly rounded-(--radius-md) border border-(--separator-default) border-dashed px-3 py-2">
                    {[0, 1].map(i => (
                        <div key={i} className="flex flex-col items-center gap-2">
                            <Skeleton w={90} h={14} delay={i * 160} />
                            <Skeleton w={64} h={28} delay={i * 160} />
                        </div>
                    ))}
                </div>

                {/* The letter. Five lines, the last two short — which is what a paragraph ending
                    mid-line looks like; a block of equal-width bars reads as a table. */}
                <div className="flex flex-col gap-2 px-3 py-2">
                    {LETTER_LINES.map(({ id, w, delay }) => (
                        <div key={id} className="flex h-[21px] items-center">
                            <Skeleton w={w} h={12} delay={delay} />
                        </div>
                    ))}
                </div>

                {/* The footer: the commitment notice, then Agree over Reject. */}
                <div className="flex flex-col gap-3 px-3 pt-2 pb-6">
                    <Skeleton h={32} />
                    <Skeleton h={48} className="rounded-(--radius-lg)" />
                    <Skeleton h={48} className="rounded-(--radius-lg)" />
                </div>
            </div>
        </div>
    )
}
