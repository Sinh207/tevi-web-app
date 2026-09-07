import { cn } from '@shared/lib/utils'
import Image from 'next/image'

/**
 * The Tevi Star mark — **the** one, and the reason this file exists rather than a glyph.
 *
 * ## It is a raster, and it has to be
 *
 * Gold with a gradient and a specular highlight, committed at `public/tevi-star.png`. The sprite's
 * `star` glyph is a **different mark**: a flat single-colour outline. Substituting it is not a
 * simplification, it is drawing the wrong thing — and it is easy to do by accident, because
 * `<Icon name="star" weight="filled" />` type-checks, renders something star-shaped, and looks
 * plausible in a screenshot until it is next to a real one. Two live cards shipped exactly that.
 * `shared/lib/money.ts` records the same rule from the other end, and is why `formatStarAmount`
 * deliberately leaves the symbol out of the string.
 *
 * ## Why it is in `shared/`
 *
 * Because it had stopped being one mark. Before this file there were **three** identical local
 * `StarMark` components — `features/star-transfer`, `features/donation`, `features/membership` —
 * plus eleven hand-written `<Image src="/tevi-star.png">` call sites across payment, my-star,
 * my-wallet and membership, plus the two that drew the wrong glyph entirely. The star-transfer copy
 * carried a note saying it would move "until a fourth needs it"; by then there were nine.
 *
 * It meets the bar `shared/components` states: props only, no domain, no hooks. Everything that
 * *does* have domain stays where it was — `StarAmount` in `features/star-transfer` still owns the
 * figure, its `tabular-nums` and its locale formatting, and simply draws this.
 *
 * ⚠ `shared/ui/app-bar.tsx`'s `AppBarStarIcon` is **not** routed through here, and that is
 * deliberate: it is a 1:1 DS port of `App Bar/Star Icon` (2022:5662), and a `shared/ui` primitive
 * reaching into `shared/components` is the wrong direction. It points at `TEVI_STAR_SRC`'s value by
 * literal; the asset is the same file, so there is nothing to drift.
 *
 * `alt=""` + `aria-hidden`: every figure this sits beside is already labelled, so announcing the
 * mark would read "Star" twice.
 */

/** The committed asset. Exported for the ledger rows, which pass a `{ src, size }` descriptor. */
export const TEVI_STAR_SRC = '/tevi-star.png'

export function StarMark({ size = 16, className }: { size?: number; className?: string }) {
    return (
        <Image
            src={TEVI_STAR_SRC}
            alt=""
            aria-hidden
            width={size}
            height={size}
            className={cn('flex-none', className)}
        />
    )
}
