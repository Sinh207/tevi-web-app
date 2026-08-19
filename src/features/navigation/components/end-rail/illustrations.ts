import { env } from '@shared/config/env'

/**
 * The two pieces of corner art the rail's own banners carry, served from the CDN path legacy uses
 * (`constants/images.js` → `IMAGES_STATIC.campaign.{login,premium}`).
 *
 * The fallback host is legacy's production CDN, for the reason `identification/lib/illustrations.ts`
 * and `brand-assets.ts` both give: **`NEXT_PUBLIC_STATIC_DOMAIN` is optional**, and an `<Image>`
 * whose `src` interpolates an `undefined` throws at render — so a missing deploy variable would not
 * degrade to a card without art, it would take the whole page to its error boundary. Both hosts are
 * in `next.config.ts`'s `remotePatterns`.
 *
 * They live here rather than inline in the two components for the same reason every other feature
 * keeps an `illustrations.ts`: the guard has to be written once, not once per call site.
 *
 * Sizes are legacy's, so `next/image` reserves the right box and nothing jumps when the art lands.
 */
const STATIC_DOMAIN = env.NEXT_PUBLIC_STATIC_DOMAIN ?? 'https://static.cdn.flowstreamx.com'

const base = `${STATIC_DOMAIN}/web/web-app/campaign`

export const RAIL_ART = {
    login: { src: `${base}/login/img-login-banner.svg`, size: 70 },
    premium: { src: `${base}/premium/img-premium-banner.png`, size: 90 },
} as const
