import 'server-only'
import { thumborBlurUrl } from '@shared/lib/thumbor'
import type { EventDetail } from '../api/types'

/**
 * The radius legacy asks the image proxy for — `filters::blur(40)` in `viewer/index.js`. The CSS
 * `blur(20px)` the studio applies on top is `EVENT_STUDIO_BACKDROP`'s, and is not this number.
 */
export const STUDIO_BACKDROP_BLUR = 40

/**
 * **The Live studio's ground, pre-blurred by the proxy** — or `null` when there is no art.
 *
 * Legacy's own fallback chain, `event.images.banner || event.channel.images.thumb`, and legacy's
 * own server pass: it builds this URL in the *viewer* container, above the choice between studio
 * and details, and draws it under a 60% scrim with `blur(20px) scale(1.1)` on top.
 *
 * Server-side because the proxy's base is a server setting (`THUMBOR_IMAGE_BASE`, see
 * `shared/lib/thumbor.ts`), so the route computes it with the event and hands it down. A studio
 * reached by a client-side navigation has no server render and gets `null` — it then blurs the
 * original in CSS alone, which is softer-edged but the same picture.
 */
export function studioBackdropUrl(event: EventDetail | null): string | null {
    const art = event?.images.banner ?? event?.channel?.images.thumb ?? null
    return thumborBlurUrl(art, STUDIO_BACKDROP_BLUR)
}
