import { env } from '@shared/config/env'

/**
 * The URL of a **branded** QR image for `text` — `${W_API}/qr/v1/?text=…`.
 *
 * ## Why the server draws these and the client does not
 *
 * The endpoint does not return a plain QR. It returns Tevi's: round finder eyes, dot modules, and
 * the logo knocked into the middle in brand purple. A client library (`qrcode.react`, which this
 * repo carried for exactly one screen) draws a correct but anonymous black square — the codes end up
 * on posters and stream overlays, and two different-looking QRs for one product is the kind of drift
 * nobody notices until they are side by side.
 *
 * So this is the single definition of that endpoint, rather than the string being interpolated at
 * each call site. Both dialogs that show a code read it.
 *
 * `encodeURIComponent`, which legacy omits — it interpolates the target raw, so the first share URL
 * carrying a query string silently truncates at the `&`. Verified that the encoded and raw forms
 * produce byte-identical PNGs for a target without one, so this is a fix with no cost.
 */
export function qrImageUrl(text: string): string {
    return `${env.NEXT_PUBLIC_W_API_DOMAIN}/qr/v1/?text=${encodeURIComponent(text)}`
}
