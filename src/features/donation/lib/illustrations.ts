import type { DonationIcon } from '../api/types'

/**
 * The donation artwork — the four unit icons and the thank-you picture.
 *
 * ## Why these are CDN art and not sprite glyphs
 *
 * The unit's art is **backend-chosen** — the creator picks "a coffee" or "a pizza" in the app and the
 * offer comes back naming one of four. That makes it content, not iconography: the DS sprite has
 * `mug-saucer`, `pizza-slice` and `flower`, but it has **no `book`**, and substituting a shape for the
 * fourth is exactly what `CLAUDE.md` forbids. Brand's four already exist and already match what the
 * mobile app draws.
 *
 * ## Why they are committed files rather than `${STATIC_DOMAIN}/home/*.svg`
 *
 * Not one of legacy's four is a vector. Each is a 16×17 (or 24×24) `<svg>` holding a single base64
 * **96×97 PNG** behind a `<pattern>` — Figma's shape for an image layer exported as SVG — and
 * `next/image` passes a remote SVG **through** unchanged, so the whole file lands in the browser:
 *
 * | | on the wire | drawn at |
 * |---|---|---|
 * | CDN `{coffee,pizza,book,rose}.svg` | 20–22 KB **each**, 87 KB for the set | 16–32 px |
 * | these files | 3.4–3.8 KB each, 14 KB for the set | 16–32 px |
 *
 * A channel page can show all four at once, so that is 87 KB of decoration to draw four thumbnails.
 * `donation-loudspeaker.png` is here for the other reason: it is a raster, so `next/image` *does*
 * process it and the browser was never getting 186 KB — but the optimiser had to fetch and decode
 * 848×584 on the first cold render of a dialog that opens right after somebody paid.
 *
 * Nothing is redrawn or recoloured. Each is Brand's own pixels at the resolution the app draws them
 * (3× for the 32px slots, which is exactly the embedded PNG's own 96px — nothing upscales), produced
 * by `pnpm art:cdn` and committed. See [`docs/STATIC_ASSETS.md`](../../../../docs/STATIC_ASSETS.md).
 *
 * They stay square because `DonationArt` passes `width={size} height={size}`: three of the four
 * source viewBoxes are 16×17 and the browser already squashed them. The re-encode reproduces what
 * ships rather than quietly changing the picture.
 */
export const DONATION_ART: Record<DonationIcon, string> = {
    coffee: '/illustrations/donation/coffee.webp',
    pizza: '/illustrations/donation/pizza.webp',
    book: '/illustrations/donation/book.webp',
    rose: '/illustrations/donation/rose.webp',
}

/**
 * The thank-you screen's art. Legacy's intrinsic size (212×146), declared so the dialog's height is
 * reserved and the text below it does not jump when the picture decodes.
 */
export const DONATION_SUCCESS_ART = {
    src: '/illustrations/donation/success.webp',
    width: 212,
    height: 146,
} as const
