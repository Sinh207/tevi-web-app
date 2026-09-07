/**
 * `/redeem-gift-code`'s three illustrations — **Brand's art, re-encoded**.
 *
 * ## What changed and what did not
 *
 * These are the same three files legacy renders (`IMAGES_STATIC.redeemGiftCode` →
 * `${STATIC_DOMAIN}/web/web-app/redeem-gift-code/…`), pixel composition untouched: nothing redrawn,
 * nothing substituted, no glyph standing in for a shape. What changed is the container. Brand exports
 * them as **SVG wrappers around embedded PNGs**, and the weight is all raster:
 *
 * | file | Brand's SVG | here | drawn at |
 * |---|---|---|---|
 * | `banner` | 1.8 MB — two 564² PNGs in a 451×256 box | **47 KB** WebP | ≤ 451 CSS px |
 * | `result-star` | 1.6 MB — one **948²** PNG in a 190×127 box | **12 KB** WebP | 190 CSS px |
 * | `result-premium` | 600 KB — same shape | **12 KB** WebP | 190 CSS px |
 *
 * 3.9 MB → 71 KB, on a screen whose entire function is a text field. The two result illustrations
 * were shipping a 948×948 image to fill a 190×127 box — five times the resolution they can ever be
 * seen at, which is where most of that came from.
 *
 * `next/image` could not have fixed it: the optimizer refuses a remote SVG unless
 * `dangerouslyAllowSVG` is set, and an SVG is a document that can carry script — the same reasoning
 * `features/earnings/lib/illustrations.ts` gives for keeping its 9 KB of *genuine* vector local
 * instead. Format, not hosting, is what decides. These are raster now, so they are optimised,
 * resized per device and served as AVIF/WebP from our own origin with our own cache headers.
 *
 * ## Generated but committed — `pnpm art:gift-code`
 *
 * `scripts/build-gift-code-art.mjs` re-downloads and re-encodes them (Chromium, through the
 * Playwright the repo already has). Run it when Brand replaces any of the three; the outputs are
 * committed for the reason the icon sprite and the brand icons are — a build must not depend on a CDN
 * being reachable. `illustrations.test.ts` fails if a file this module names is missing or is not a
 * WebP, which is the failure that would otherwise be invisible until the page is opened.
 *
 * ## Two limitations worth knowing before reusing these
 *
 * 1. **The banner has English baked into it** — "Redeem gift code / For all your purchase" is
 *    rendered *in the art*, so a Vietnamese reader sees an English picture above a Vietnamese
 *    heading. Legacy has exactly the same problem, and it cannot be fixed on this side: it needs a
 *    localised export, or art without the words. That is also why the heading below it is real text
 *    and the image is `aria-hidden` — the words a screen reader gets are the translated ones.
 * 2. **The banner is drawn for a light background.** Its composition is white cards, and Brand ships
 *    no dark variant. It sits on `--background-subtle` in both themes; in dark mode the cards stay
 *    white, which is the art's own design rather than a token this file could switch.
 *
 * `width`/`height` are each file's **intrinsic** box, not its encoded pixel size (the WebPs are 2×
 * of it, for retina — and no wider, because every call site caps the art at its intrinsic width).
 * Declaring them is what reserves the space, so nothing below the art reflows when it decodes.
 */

export const GIFT_CODE_ART = {
    /** The page's masthead — a phone showing the code entry, between two app tiles. */
    banner: { src: '/illustrations/gift-code/banner.webp', width: 451, height: 256 },
    /** Theo with a Star. Shown when the code turned out to be a Star gift. */
    resultStar: { src: '/illustrations/gift-code/result-star.webp', width: 190, height: 127 },
    /** Theo with a crown. Shown when the code activated Premium. */
    resultPremium: { src: '/illustrations/gift-code/result-premium.webp', width: 190, height: 127 },
} as const
