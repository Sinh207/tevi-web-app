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
                 * **The DS ratio for every state, a withheld cover included.** A sensitive space's
                 * band used to be cut to 402:80, on the grounds that a smudge was not worth 140px.
                 * It read as a broken header instead (product call, 2026-10-07): the identity block
                 * looked crushed under a sliver, and since the skeleton cannot know a space is
                 * sensitive and draws 402:140, the page also jumped 60px when it resolved. The gate
                 * below now fills the column, so the extra band costs it nothing.
                 */
                'aspect-[402/140]',
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
