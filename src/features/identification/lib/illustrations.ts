import { env } from '@shared/config/env'

/**
 * The screen's three illustrations, served from the same CDN path legacy used
 * (`constants/images.js` → `${STATIC_DOMAIN}/web/web-app/identification/…`).
 *
 * The fallback host is legacy's production CDN, for the reason `brand-assets.ts` gives:
 * `NEXT_PUBLIC_STATIC_DOMAIN` is optional, and an `<Image>` with `undefined` in `src`
 * throws at render. Both hosts are in `next.config.ts`'s `remotePatterns`.
 *
 * They are raster art rather than sprite glyphs, so they are not themeable — the same PNG
 * shows in both modes, as it does in the mobile app and in legacy. Sizes are legacy's
 * intrinsic ones (`width`/`height` on its `ImageWithFallback`), kept so `next/image`
 * reserves the right box and nothing jumps when the art lands.
 */
const STATIC_DOMAIN = env.NEXT_PUBLIC_STATIC_DOMAIN ?? 'https://static.cdn.flowstreamx.com'

const base = `${STATIC_DOMAIN}/web/web-app/identification`

export const IDENTITY_ART = {
    intro: { src: `${base}/identification-center.png`, width: 300, height: 190 },
    pending: { src: `${base}/identity-processed.png`, width: 300, height: 300 },
    verified: { src: `${base}/identity-verified.png`, width: 300, height: 300 },
} as const
