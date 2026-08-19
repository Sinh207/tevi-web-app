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
export function ChannelCover({ src }: { src: string | null }) {
    return (
        <div className="relative aspect-[402/140] w-full overflow-hidden bg-(--background-segment)">
            {src && (
                <Image
                    src={src}
                    alt=""
                    fill
                    priority
                    // The column is capped at 612, so above that width the browser must not keep
                    // asking for viewport-sized art.
                    sizes="(max-width: 612px) 100vw, 612px"
                    className="object-cover"
                />
            )}
        </div>
    )
}
