import { brandManifestIcons, WEB_MANIFEST_SHELL } from '@shared/config/web-manifest'
import type { MetadataRoute } from 'next'
import type { Channel } from '../api/types'
import { buildChannelDescription } from './channel-seo'
import { toChannelPath } from './channel-slug'

/**
 * A creator's space as an **installable app** — the manifest a phone reads when someone adds
 * `/@ada` to their home screen.
 *
 * Legacy serves this from `/api/manifest?channelSlug=@ada`
 * (`../tevi-web-app/src/pages/api/manifest.js`) and links it from `_document.js`; this app serves
 * it from a route beside the page instead, so the URL is `/@ada/manifest.webmanifest` and the
 * page declares it through `generateMetadata`. Same payload, no query-string plumbing, and one
 * fewer place that has to know how a channel slug is spelled.
 *
 * Pure and icon-agnostic on purpose: building an icon URL means reading server configuration
 * (`shared/lib/thumbor.ts`), and a function that did both could not be tested without one. The
 * route resolves the icons and hands them in.
 */

/** The two sizes a PWA install actually looks for. Legacy's, and Chrome's documented minimum. */
export const CHANNEL_ICON_SIZES = [192, 512] as const

/** One resolved square of the creator's avatar. */
export interface ChannelManifestIcon {
    /** Both dimensions — these are squares, which is the whole reason for the image proxy. */
    size: number
    src: string
}

/** `/@ada/manifest.webmanifest` — the only place this path is spelled. */
export function channelManifestPath(slug: string): string {
    return `${toChannelPath(slug)}/manifest.webmanifest`
}

/**
 * Where an installed space opens.
 *
 * ## ⚠ This is the one deliberate divergence from legacy in this file
 *
 * Legacy's `start_url` is `/{slug}?startapp&addToHomeScreen` — the *instruction screen*, the page
 * that tells you how to add the space to your home screen. So in legacy, tapping the icon you just
 * installed opens "here is how to install this". Its own code says that was not the intent: the
 * screen immediately tries to navigate away (`redirectToApp()` in
 * `../tevi-web-app/src/components/layouts/addHomeScreen/index.js`), to
 * `${process.env.ADD_TO_HOME_SCREEN}/{slug}?startapp&addToHomeScreen`. That variable is declared
 * in legacy's `next.config.mjs` `env` block and **set in none of its three env files**, so on
 * every environment in the repository the destination reads `undefined/@ada?…` and the launch
 * lands nowhere. Whatever host it was meant to be is deployment configuration nobody here can
 * name, which is why this app does not reproduce the redirect (see `AddHomeScreenGuide`).
 *
 * Reproducing the `start_url` too would therefore ship a knowingly broken install: the icon on
 * the reader's home screen would open a page whose only content is instructions for creating that
 * icon. So an installed space opens **the space**, and `?startapp` — legacy's own spelling for
 * "launched from the installed app" (`isStartApp`) — is kept as the marker. Nothing in this app
 * reads it; it is there so an analytics query can tell an installed launch from a link, and so
 * the URL contract legacy established does not change spelling.
 *
 * The instruction screen keeps its address: `/@ada?startapp&addToHomeScreen` still renders it
 * (`proxy.ts` rewrites that pair), so every link legacy ever produced still works.
 */
function channelStartUrl(slug: string): string {
    return `${toChannelPath(slug)}?startapp`
}

/**
 * **Whether a space may describe itself as an installable app at all.**
 *
 * A predicate rather than an `if` in the route, because the answer is a *product* rule with a
 * consequence that outlives the session: a manifest becomes a **label and a picture on the
 * reader's home screen**, visible to whoever else picks up the phone, and no gate inside the app
 * can take it back. So it is stated once, next to the manifest it governs, and tested.
 *
 * NSFW is the whole rule today, and it is the same withholding `generateMetadata` does for the
 * page title and the link preview (`channel-seo.ts`) — the gate that hides the content would be
 * pointless if installing the space published its name.
 *
 * **Two neighbours are deliberately *not* here**, so the next reader knows they were considered:
 *
 * - **Suspended.** `isIndexableChannel` excludes one from search, but its page still renders the
 *   creator's header above the wall in both apps, so the name is not being withheld from anybody —
 *   an installed icon that opens a wall is useless, not a leak, and legacy serves its manifest.
 * - **Non-public** (protected, unpublished). Same reasoning: the wall names the space, so there is
 *   nothing here that the page does not already say.
 *
 * If either ever becomes a case worth refusing, this is the one place to add it.
 */
export function shouldServeChannelManifest(channel: Channel): boolean {
    return !channel.is_nsfw
}

export function buildChannelManifest(
    channel: Channel,
    icons: ChannelManifestIcon[],
): MetadataRoute.Manifest {
    const name = channel.name ?? channel.slug

    return {
        /**
         * Legacy falls back to `'Tevi App'` / `'Tevi'` when a space has no display name; the slug
         * is used instead, because it is never empty and it is what the reader typed to get here.
         * `short_name` is not truncated — Android elides a long label under the icon itself, and
         * choosing where to cut a creator's name is not this code's call.
         */
        name,
        short_name: name,
        /**
         * The space's own description, through the same helper the page title and the OG tags use,
         * so all three say the same thing. Legacy sets `description` to the channel *name* and
         * falls back to the whole platform blurb — the fallback shows it meant the description.
         */
        description: buildChannelDescription(channel),
        start_url: channelStartUrl(channel.slug),
        /**
         * **The app's identity, pinned to the space rather than left to `start_url`.**
         *
         * Unset, a browser derives the identity from `start_url` — so the day anybody edits that
         * query string, every existing install stops matching the manifest and the site starts
         * offering what looks like a *second* app for the same space. Declaring it means
         * `start_url` is free to change (it already has once — see `channelStartUrl`) without
         * splitting anyone's home screen.
         */
        id: toChannelPath(channel.slug),
        /**
         * **Declared, and `/` on purpose.** Two reasons, and the second is the load-bearing one.
         *
         * The default scope is the manifest URL's own directory, which here would be `/@ada/` — a
         * directory that does *not* contain `start_url` (`/@ada`), so the spec would discard it
         * and fall back to the start URL's parent. That arrives at the same place, but by way of
         * an error path in a browser's manifest parser.
         *
         * And a narrow scope would put most of the app *outside* it. A space links straight to
         * `/get-star`, membership checkout, `/premium` and the legal pages, and an out-of-scope
         * navigation leaves the installed app for the browser. On iOS that is not merely a change
         * of chrome: a home-screen web app is its own browsing context, and this app keeps its
         * session in `localStorage` (`shared/lib/api/token.ts`) — which is exactly the kind of
         * per-context storage that does not travel. Being wrong about that costs a reader their
         * session in the middle of paying, so the scope covers the whole site.
         */
        scope: '/',
        ...WEB_MANIFEST_SHELL,
        /**
         * ## The avatar, declared twice — and why `maskable` gets a photo
         *
         * Android **prefers a maskable icon** when a manifest offers one. So shipping Tevi's own
         * maskable mark alongside the creator's `any` icons would mean every installed space
         * wearing the Tevi logo — the opposite of the point. The avatar therefore serves both
         * purposes, exactly as legacy does it, and Android crops the outer 20% of it. An avatar is
         * centre-weighted, so a centre crop is the safe one; padding it into a real safe zone
         * would mean compositing (a proxy filter and a background colour), which is a Brand
         * decision and not a port.
         *
         * `type` is deliberately **absent**. Legacy declares `image/png`, but the proxy answers
         * `image/webp` regardless of the source format (measured against the live host), and a
         * browser is entitled to filter an icon by its declared type before fetching it. No claim
         * beats a wrong one; the response's own `Content-Type` is what decodes it.
         *
         * A space with no avatar falls back to Tevi's icons rather than declaring none: an install
         * with no icon at all is a blank square on someone's home screen.
         */
        icons:
            icons.length > 0
                ? icons.flatMap(({ size, src }) => [
                      { src, sizes: `${size}x${size}`, purpose: 'any' as const },
                      { src, sizes: `${size}x${size}`, purpose: 'maskable' as const },
                  ])
                : brandManifestIcons(),
        /**
         * **No `screenshots`, and that is a fix rather than an omission.** Legacy declares two —
         * the avatar, run through the proxy at 1920×1080 and 1080×1920 and announced at those
         * sizes. A proxy crop of a square-ish avatar is not 16:9, and a browser that checks a
         * screenshot's real dimensions against the declared ones (Chrome does, and reports it)
         * discards the whole list. There are no product screenshots of a space committed to this
         * repo, so the honest manifest has none.
         */
    }
}
