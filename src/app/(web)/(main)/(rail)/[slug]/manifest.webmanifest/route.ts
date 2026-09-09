import {
    buildChannelManifest,
    CHANNEL_ICON_SIZES,
    type ChannelManifestIcon,
    getChannelForRequest,
    parseChannelSlug,
    shouldServeChannelManifest,
} from '@features/channel/server'
import { thumborSquareUrl } from '@shared/lib/thumbor'
import { NextResponse } from 'next/server'

/**
 * `/@ada/manifest.webmanifest` — the space's own web app manifest.
 *
 * The page next door declares it (`generateMetadata` → `manifest`), which is what makes a phone
 * offer to install *this space* rather than the site. What it contains and why is
 * `features/channel/lib/channel-manifest.ts`; what lives here is the fetch, the icons and the
 * three cases where a space must not describe itself.
 *
 * A route handler and not a `manifest.ts` file convention: that convention takes no route params
 * in a dynamic segment, and the payload depends on the slug.
 *
 * **No canonical-case redirect**, unlike the page. A mis-cased slug resolves to the same channel
 * upstream, and every URL inside the payload is built from `channel.slug` — the canonical
 * spelling — so `/@ADA/manifest.webmanifest` already describes `/@ada` and installs it under that
 * address. A redirect would only add a round trip to a request no human sees.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
    /**
     * Anything we cannot describe falls back to the **site** manifest rather than 404ing, which is
     * legacy's behaviour (`res.redirect('/manifest.json')`) and the right one: a `<link
     * rel="manifest">` that 404s leaves the page with no manifest at all, so a reader who taps
     * "Add to Home Screen" during an outage gets an unnamed icon. The generic Tevi one is still a
     * true statement about where the icon leads.
     */
    const siteManifest = () => NextResponse.redirect(new URL('/manifest.webmanifest', request.url))

    const slug = parseChannelSlug((await params).slug)
    // Not a channel URL at all — no fetch. `[slug]` matches every unclaimed single-segment path,
    // so this is what keeps a bot scan for `/.env/manifest.webmanifest` off the channel service.
    if (!slug) return siteManifest()

    // The same call the page makes, so a visit that renders the page and then fetches this pays
    // for one upstream request between them (React `cache()` per render, the fetch Data Cache
    // across renders at `revalidate: 60`).
    const result = await getChannelForRequest(slug)
    if (result.status !== 'ok') return siteManifest()

    /**
     * **A space that may not name itself describes Tevi instead** — an NSFW one, today. The rule
     * and the reasons live with the manifest (`shouldServeChannelManifest`) rather than here,
     * because they are about what a home-screen icon publishes and not about this route.
     */
    const { channel } = result
    if (!shouldServeChannelManifest(channel)) return siteManifest()

    const icons = CHANNEL_ICON_SIZES.reduce<ChannelManifestIcon[]>((list, size) => {
        const src = thumborSquareUrl(channel.images.thumb, size)
        // A rejected source (absent, relative, an unexpected scheme) drops that size rather than
        // emitting an entry that points nowhere; no sizes at all falls back to the brand icons.
        if (src) list.push({ size, src })
        return list
    }, [])

    return NextResponse.json(buildChannelManifest(channel, icons), {
        headers: {
            /**
             * The media type the spec defines. Browsers accept `application/json` too, but the
             * manifest is fetched with `Accept: application/manifest+json` and answering in kind
             * is what keeps a strict proxy from rewriting it.
             */
            'content-type': 'application/manifest+json; charset=utf-8',
            /**
             * Revalidate every time — legacy's `no-cache`, spelled as the pair that every
             * intermediary honours. A creator who changes their name or picture should not have a
             * stale label on somebody's home screen for a day, and the revalidation is cheap: the
             * upstream read behind it is coalesced by the 60s fetch cache, so what a repeat
             * request costs is a render, not a channel-service call.
             */
            'cache-control': 'public, max-age=0, must-revalidate',
        },
    })
}
