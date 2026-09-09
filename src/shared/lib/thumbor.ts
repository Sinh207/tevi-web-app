import { serverEnv } from '@shared/config/server-env'

/**
 * Square crops of a remote image, through the platform's own image proxy.
 *
 * ## Why this exists at all, when `next/image` is right there
 *
 * The optimiser cannot serve these. Three reasons, each measured rather than assumed:
 *
 * - **A PWA manifest icon and an `apple-touch-icon` are fetched by the *platform*, not by our
 *   markup.** `/_next/image` answers every request with
 *   `Content-Disposition: attachment; filename="…"` (`next.config.ts` sets
 *   `contentDispositionType: 'attachment'` on purpose — it is one of the three guards under
 *   `dangerouslyAllowSVG`). A browser ignores that header for an `<img>`; whether Android's
 *   install flow and iOS's "Add to Home Screen" do is not something this repo can guarantee, and
 *   the failure mode is an app installed with a blank icon and nothing logged anywhere.
 * - **The exact sizes are not available.** `images.imageSizes` stops at 384 and `deviceSizes`
 *   starts at 640, so `/_next/image?w=192` answers **400** and `w=512` does too. A PWA wants
 *   192 and 512.
 * - **An avatar is not square.** A real one measures 1015×338 (`static.tevicdn.com/Channel/
 *   Images/tevi/blank.png`), and the optimiser resizes by width only — it cannot crop. An icon
 *   declared `192x192` that is actually 3:1 is a devtools warning at best and a rejected icon at
 *   worst. This proxy crops to fill, which is what makes the declared size true.
 *
 * So this is legacy's own path — `../tevi-web-app/src/pages/api/manifest.js` builds exactly this
 * URL shape — and the host is Tevi's, not a third party's.
 *
 * **Server-only**, transitively: it reads `serverEnv()`. That is not a limitation to design
 * around — every caller (a manifest route, a `generateMetadata`) already runs on the server, and
 * the URL it returns is plain public text once built.
 */

/**
 * Where the proxy lives when nothing says otherwise.
 *
 * Not a guess: legacy ships `THUMBOR_URL_SERVER=https://imge.cdn.flowstreamx.com/unsafe` in
 * **all three** of its env files (`.env.development`, `.env.production`, `.env.local`) — the same
 * host in every environment, which is why hard-coding it here is a record of the observed value
 * rather than a default someone invented. `THUMBOR_IMAGE_BASE` overrides it.
 *
 * A default and not a required variable on purpose: the alternative is a deploy that forgets the
 * variable and silently installs every creator's app under the Tevi logo, which is precisely the
 * kind of failure `app/manifest.test.ts` was written after.
 */
const FALLBACK_BASE = 'https://imge.cdn.flowstreamx.com/unsafe'

/**
 * `https://…/unsafe/192x192/<source>`, or `null` when there is nothing to point at.
 *
 * `null` rather than a broken string for every rejected input, so a caller writes
 * `icon && { src: icon }` and an absent avatar simply produces no icon entry — never an entry
 * pointing at `undefined`.
 *
 * **Absolute `http(s)` sources only.** The API hands us fully-qualified URLs (legacy's
 * `resolveImageUrl` only ever prefixed the relative paths an older DB held, and this app's
 * `channel.images.thumb` is absolute), so anything else is a payload we do not understand — and
 * a scheme we did not check would be interpolated into a `<link href>` and a manifest `src`.
 * Neither of those sinks *executes* a `javascript:` URL, but neither should be handed one.
 *
 * The source URL is appended **as-is**, path and query included, which is what the proxy expects
 * (verified against the live host: `…/unsafe/192x192/https://static.tevicdn.com/…/blank.png`
 * answers `200` with `image/webp`, 340 bytes). A source carrying its own `?query` therefore ends
 * up in *our* query string; the proxy still resolves it, and stripping it would break any CDN
 * that signs its URLs that way.
 *
 * **The proxy upscales, which is what makes the declared size true.** That is the assumption a
 * manifest rests on and it is not obvious — a 1015×338 avatar cannot *fill* 512×512 by cropping
 * alone. Measured on both sizes of that exact avatar: the responses decode to 192×192 and
 * 512×512. So a small avatar still satisfies the ≥192 an install prompt looks for, and
 * `sizes: "512x512"` is a fact rather than a claim. Nothing in this repo can assert it — it is the
 * proxy's behaviour — so it is written down instead.
 */
export function thumborSquareUrl(source: string | null | undefined, size: number): string | null {
    if (!source) return null
    if (!Number.isInteger(size) || size <= 0) return null

    let parsed: URL
    try {
        parsed = new URL(source)
    } catch {
        return null
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

    // A configured base with a trailing slash would otherwise produce `//192x192/`, which the
    // proxy reads as an empty size segment.
    const base = (serverEnv().THUMBOR_IMAGE_BASE ?? FALLBACK_BASE).replace(/\/+$/, '')
    return `${base}/${size}x${size}/${parsed.href}`
}
