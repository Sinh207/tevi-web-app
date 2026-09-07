import { cn } from '@shared/lib/utils'
import Image from 'next/image'

/**
 * The channel's cover image.
 *
 * ## The one place this deviates from legacy's literals, and it deviates *toward* the DS
 *
 * Legacy hard-codes two heights: `136` below `md`, `213` at `md` and up. The DS says the cover
 * raster is **402×140** in the Figma frame. 402:140 at 390px wide is 135.8; at 612px it is 213.1.
 * Legacy's two magic numbers are just the DS aspect ratio measured at two widths — so an
 * `aspect-ratio` reproduces both *and* every width in between, which the fixed heights get wrong.
 * The 612px container cap means it never exceeds 213.
 *
 * ## No cover still reserves the band — a deliberate break from legacy
 *
 * Legacy returns `null` when `images.cover` is empty, so a creator without one gets a header of a
 * different *shape*: no band, and an avatar with nothing to overlap. That leaves two layouts to
 * think about instead of one, and the one nobody designed is the one a brand-new account sees.
 *
 * Here the band is always there, filled with `--background-segment` when there is no art. The
 * avatar's negative offset then always has something to sit against, the header is the same height
 * whether or not a cover exists, and the empty state reads as "no cover yet" rather than as a
 * broken page.
 *
 * `priority` is on when there *is* art: on a channel page it is the LCP element, and letting it
 * lazy-load is the single easiest way to lose that metric. `alt=""` because it is decoration — the
 * accessible name for the channel is the heading, and describing a backdrop adds nothing.
 */
export function ChannelCover({
    src,
    /**
     * How much of the cover to withhold, and the two answers are not the same thing.
     *
     * - **`strong`** — a sensitive space whose gate is unanswered. The blur is cosmetic and the
     *   *request* is what withholds the art: `quality={10}` at a 64px `sizes` fetches a thumbnail,
     *   so what reaches the browser is a smudge no devtools recovers. A CSS filter over the
     *   full-resolution cover would leave the withheld image one style toggle away — and would be
     *   bytes spent on exactly the content being withheld.
     * - **`soft`** — a space that is closed to this reader (unpublished, protected). Nothing here is
     *   unsafe to look at; the art is just behind a door. So the real image is fetched and only
     *   softened, enough to read as "not open" while still showing whose space it is.
     *
     * `scale-110` because a blur samples past its own edges: without it the band shows a soft,
     * lighter frame where the filter runs out of pixels.
     */
    blurred = false,
}: {
    src: string | null
    blurred?: false | 'soft' | 'strong'
}) {
    return (
        <div
            className={cn(
                'relative w-full overflow-hidden bg-(--background-segment)',
                /*
                 * **A withheld cover is a shorter band.** The DS ratio draws 402:140 because the
                 * band is *art* — at `strong` it is not: what is fetched is a 64px thumbnail and
                 * what is painted is a smudge, so 140 of it is 140 of nothing, pushing the name,
                 * the stats and the gate's own question down the page on the one screen whose whole
                 * job is to ask that question.
                 *
                 * 402:80 rather than "as short as possible": the avatar still straddles the edge and
                 * its lift is measured off the cover's bottom, so the band has to stay clear of
                 * `md`'s `-76`. 80/402 is 78px at a 390 phone and 122px at the 612 cap — above the
                 * lift at both widths, so the header keeps the same shape and only the band loses
                 * height. `soft` is untouched: that art is the real image and still worth its
                 * space.
                 */
                blurred === 'strong' ? 'aspect-[402/80]' : 'aspect-[402/140]',
            )}
        >
            {src && (
                <Image
                    src={src}
                    alt=""
                    fill
                    priority
                    quality={blurred === 'strong' ? 10 : undefined}
                    // The column is capped at 612, so above that width the browser must not keep
                    // asking for viewport-sized art.
                    sizes={blurred === 'strong' ? '64px' : '(max-width: 612px) 100vw, 612px'}
                    className={cn(
                        'object-cover',
                        blurred && 'scale-110',
                        blurred === 'strong' && 'blur-2xl',
                        // 6px over a full-resolution cover: the shapes and the palette survive, the
                        // detail does not. `blur-2xl` here would look like the same withholding as a
                        // sensitive space, which is a different statement.
                        blurred === 'soft' && 'blur-[6px]',
                    )}
                />
            )}
        </div>
    )
}
