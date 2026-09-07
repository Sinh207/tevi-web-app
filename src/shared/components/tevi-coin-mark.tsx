import { cn } from '@shared/lib/utils'
import Image from 'next/image'

/**
 * The Tevi Coin mark — the purple disc beside a bonus figure.
 *
 * Sibling of `star-mark.tsx` and built to the same bar: props only, no domain, no hooks. It lives in
 * `shared/components` because two surfaces draw it (a ledger row and the transaction-detail sheet) and
 * `LedgerRow` is itself shared, so the asset cannot live in `features/my-wallet` without the shared
 * component reaching into a feature for it.
 *
 * ## Committed, not fetched — and **SVG rather than WebP**
 *
 * Legacy points at `${STATIC_DOMAIN}/web/web-app/my-wallet/tevi-coin.svg`, which the no-CDN rule
 * (`docs/STATIC_ASSETS.md`) forbids. It is committed at `public/tevi-coin.svg`, 1294 bytes.
 *
 * It is deliberately **not** put through `scripts/build-cdn-art.mjs`. That script exists for Figma
 * *image* layers exported as SVG — a base64 PNG in an SVG wrapper, where rasterising to WebP is what
 * saves the megabytes. This file is genuine vector: one `<circle fill="#501BC0">` and a glyph path. At
 * 1.3 KB it is already smaller than any raster of it would be, and it is drawn at 14–16px where a
 * rasterised disc goes soft. So it joins `tevi-star.png` as an asset committed straight to `public/`
 * rather than a row in `SOURCES`.
 *
 * `alt=""` + `aria-hidden`, for `StarMark`'s reason: the figure beside it is already labelled, and
 * announcing the mark would say the unit twice.
 */

/** The committed asset. Exported for the ledger rows, which pass a `{ src, size }` descriptor. */
export const TEVI_COIN_SRC = '/tevi-coin.svg'

export function TeviCoinMark({ size = 14, className }: { size?: number; className?: string }) {
    return (
        <Image
            src={TEVI_COIN_SRC}
            alt=""
            aria-hidden
            width={size}
            height={size}
            className={cn('flex-none', className)}
        />
    )
}
