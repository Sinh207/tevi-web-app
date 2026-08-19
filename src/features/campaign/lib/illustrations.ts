import { env } from '@shared/config/env'

/**
 * Art the campaign cards fall back on when the campaign itself ships none, served from the CDN path
 * legacy uses (`IMAGES_STATIC.campaign.{luckyWheel,gyf,affiliate}`).
 *
 * The fallback host is legacy's production CDN — `NEXT_PUBLIC_STATIC_DOMAIN` is optional, and an
 * `<Image>` whose `src` interpolates an `undefined` throws at render rather than degrading to a
 * card without art. That reasoning is spelled out in `identification/lib/illustrations.ts`; this is
 * the same guard, and it is written once here instead of at each card.
 *
 * `affiliate` is the exception: it is bundled in `public/`, because legacy keeps it there too and a
 * fallback that depends on the network is not much of a fallback.
 */
const STATIC_DOMAIN = env.NEXT_PUBLIC_STATIC_DOMAIN ?? 'https://static.cdn.flowstreamx.com'

const base = `${STATIC_DOMAIN}/web/web-app/campaign`

export const CAMPAIGN_ART = {
    luckyWheel: { src: `${base}/lucky-wheel/img-lucky-wheel-banner.png`, size: 70 },
    growYourFans: `${base}/growth-your-fanbae/logo-gyf.svg`,
    /** Bundled, not CDN — the affiliate campaign usually supplies its own `logo`. */
    affiliateFallback: '/campaign/affiliate-logo.png',
} as const
