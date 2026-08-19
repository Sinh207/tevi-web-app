import { env } from '@shared/config/env'

/**
 * `/my-star`'s empty-state artwork, from the same CDN path legacy used
 * (`constants/images.js` → `${STATIC_DOMAIN}/web/web-app/my-wallet/…`).
 *
 * The fallback host is legacy's production CDN, for the reason `identification/lib/illustrations.ts` and
 * `brand-assets.ts` both give: `NEXT_PUBLIC_STATIC_DOMAIN` is optional, and an `<Image>` with
 * `undefined` in `src` throws at render. Both hosts are in `next.config.ts`'s `remotePatterns`.
 *
 * ## Remote rather than committed, because it is a `.png`
 *
 * `next/image` refuses to optimise a *remote SVG* unless `dangerouslyAllowSVG` is set — which is why
 * `EARNINGS_ART` keeps a local copy of `theo-search.svg`. This one is raster, so Next fetches it once
 * server-side and serves WebP, exactly as the identification screens' art does. Format, not hosting, is
 * what decides.
 *
 * Size is legacy's intrinsic one (225×256 on its `<ImageWithFallback>`), declared so the box is reserved
 * and nothing reflows when the art decodes.
 *
 * The **filtered**-empty state reuses the same art: the design's behaviour note says that state differs
 * from the empty one by *copy only*, and a second asset to say the same thing in a different picture is
 * not a difference worth a request.
 */
const STATIC_DOMAIN = env.NEXT_PUBLIC_STATIC_DOMAIN ?? 'https://static.cdn.flowstreamx.com'

export const MY_STAR_ART = {
    empty: {
        src: `${STATIC_DOMAIN}/web/web-app/my-wallet/no-tvs-transactions.png`,
        width: 225,
        height: 256,
    },
} as const
