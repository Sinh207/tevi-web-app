/**
 * Art the campaign cards fall back on when the campaign itself ships none.
 *
 * ## Why `growYourFans` is a committed WebP and not `${STATIC_DOMAIN}/…/logo-gyf.svg`
 *
 * Legacy's `IMAGES_STATIC.campaign.gyf` is a 42×48 `<svg>` whose entire body is one `<pattern>`
 * filled with a base64 PNG — Figma's shape for an *image* layer exported as SVG. The PNG inside is
 * **1800×2400**, drawn in ProgramCard's 64px tile:
 *
 * | | on the wire | pixels | shown at |
 * |---|---|---|---|
 * | CDN `logo-gyf.svg` | **2.27 MB** gzipped | 1800×2400 embedded PNG | 56×64 |
 * | this file | 4.7 KB | 112×128 | 56×64 |
 *
 * `next/image` cannot help: it passes a remote SVG **through** unchanged — `dangerouslyAllowSVG` in
 * `next.config.ts` is permission to serve, not processing — so all 2.27 MB reach the browser to draw
 * a thumbnail, on a rail that renders beside every page. Nothing is redrawn or substituted: it is
 * Brand's own pixels at 2× the box, produced by `pnpm art:cdn grow-your-fans` and committed. Format,
 * not hosting, is what decides — see [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 *
 * `luckyWheel` is committed for the plainer reason that **no static art is fetched from the CDN any
 * more** (`docs/STATIC_ASSETS.md`): a screen that renders should not depend on a third host being up,
 * and 32 KB of PNG at 188×146 re-encodes to 4.9 KB at the 140 the card can actually use. It is square
 * because the browser already squashed the source, and the re-encode reproduces that rather than
 * quietly changing the picture.
 *
 * `NEXT_PUBLIC_STATIC_DOMAIN` no longer appears here at all, which removes the hazard the old comment
 * described: the variable is optional, and an `<Image>` whose `src` interpolates an `undefined`
 * throws at render rather than degrading to a card without art.
 */

export const CAMPAIGN_ART = {
    luckyWheel: { src: '/illustrations/campaign/lucky-wheel.webp', width: 70, height: 70 },
    growYourFans: '/illustrations/campaign/grow-your-fans.webp',
    /** The affiliate campaign usually supplies its own `logo`; this is the stand-in. */
    affiliateFallback: '/campaign/affiliate-logo.png',
} as const
