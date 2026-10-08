import { AddHomeScreenGuide, ChannelManifestLink } from '@features/channel'
import {
    channelManifestPath,
    getChannelForRequest,
    parseChannelSlug,
    toChannelPath,
} from '@features/channel/server'
import { STARTUP_IMAGES } from '@shared/config/startup-images'
import { getServerT } from '@shared/i18n/server'
import { thumborSquareUrl } from '@shared/lib/thumbor'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

/**
 * The **"add this space to your home screen"** screen.
 *
 * Reached by rewrite, not by link: `proxy.ts` sends `/@ada?startapp&addToHomeScreen` here, so the
 * address a reader sees stays the space's — legacy's URL, unchanged, because it is what legacy's
 * manifest pointed installs at and what any already-shared link carries.
 *
 * ## Why it is a route of its own, outside `(web)`
 *
 * Legacy replaces the entire page with this screen (`getLayout` returning `AddHomeScreenLayout`),
 * so it has no navigation of any kind. A page in the App Router cannot opt out of the layouts above
 * it, and rendering it inside `(main)` would put our own tab bar across the bottom of a screen whose
 * first instruction is to look at *Safari's* bottom bar — the one place the chrome is actively
 * misleading rather than merely unnecessary.
 *
 * Outside `(web)` for the reason `/app/*` is: that group exists to mount the session stack, and this
 * screen reads no account. Inheriting it would mean a device fingerprint, a `/me` and — on a cold
 * device — a Firebase anonymous sign-in plus `v1/connect/anonymous`, for a page whose entire content
 * is a picture and two sentences the server already has. The base providers in the root layout
 * (QueryClient, theme, i18n) are all it needs, and i18n is the one that matters: the guide is a
 * client component so it can put a glyph inside a translated sentence.
 *
 * `/add-home-screen/@ada` therefore answers directly as well. It is `noindex` here and as an
 * `X-Robots-Tag` from `proxy.ts`, the same treatment the query-string form gets.
 *
 * **No canonical-case redirect**, unlike the space page. `/@ADA?startapp&addToHomeScreen` renders
 * these instructions rather than bouncing first: the screen is `noindex`, so there is no ranking
 * signal to consolidate, and everything on it that matters — the manifest link, the touch icon, the
 * name in the heading — is built from `channel.slug`, the spelling the API returned.
 */
type PageProps = { params: Promise<{ slug: string }> }

/**
 * 180×180, the size iOS asks for and the size `app/apple-icon.png` is rendered at
 * (`docs/DESIGN_SYSTEM.md`). Square is not optional — an avatar is often not, which is what the
 * image proxy is for.
 */
const APPLE_TOUCH_ICON_SIZE = 180

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    /** Nothing about a space we will not render should be asserted in its metadata. */
    const anonymous: Metadata = { robots: { index: false, follow: false } }

    const slug = parseChannelSlug((await params).slug)
    if (!slug) return anonymous

    const result = await getChannelForRequest(slug)
    /**
     * NSFW is withheld here exactly as it is on the space page and in the manifest route: metadata
     * is what a link preview renders, so leaking the name would defeat the gate before anyone has
     * agreed to anything. The body redirects those readers to the space, where the gate lives.
     */
    if (result.status !== 'ok' || result.channel.is_nsfw) return anonymous

    const { channel } = result
    const name = channel.name ?? channel.slug
    const t = await getServerT()
    const appleIcon = thumborSquareUrl(channel.images.thumb, APPLE_TOUCH_ICON_SIZE)

    return {
        /**
         * The screen's own heading, which is also a reasonable document title — and on iOS before
         * 16.4 the `<title>` is the *third* fallback for what the new icon gets called, after the
         * manifest and `apple-mobile-web-app-title`.
         */
        title: t('channel_add_home_screen_title', { name }),
        /**
         * **`noindex`, and the one branch of this feature that legacy also marks.** Its
         * `robots.txt` disallows `/*?*startapp` and `/*?*addToHomeScreen`; ours deliberately does
         * not — a disallowed URL is never fetched, so this directive would never be read, and this
         * URL is shared, so it *is* reached from links. The page is thin by design and its content
         * belongs to `/@ada`, so an indexed copy would compete with the space itself.
         */
        robots: { index: false, follow: false },
        /**
         * Declared as well as rendered into the head by `ChannelManifestLink` below — see the same
         * note on the space page. Next streams this route's metadata into the body, where a
         * manifest link is ignored; this keeps that ignored copy pointing at the space rather than
         * at the site.
         */
        manifest: channelManifestPath(channel.slug),
        /**
         * The creator's avatar as the touch icon — legacy sets exactly this, and only on this
         * screen (`metaHomeScreen.touchIcon`, guarded by both markers). Squared through the image
         * proxy rather than passed through raw: legacy hands iOS whatever shape the avatar happens
         * to be, and a 1015×338 touch icon is letterboxed on the home screen.
         *
         * Omitted rather than nulled when there is no avatar, so the site's `apple-icon.png` stays.
         *
         * This one **does** reach the head, unlike the manifest link beside it: measured, React
         * hoists the icon links out of Next's streamed metadata block and leaves `rel="manifest"`
         * where it stands. Should that ever change, iOS 16.4+ still takes the icon from the
         * manifest — which `ChannelManifestLink` guarantees is in the head — so the fallback is the
         * same picture.
         */
        ...(appleIcon ? { icons: { apple: appleIcon } } : {}),
        /**
         * Re-declared rather than inherited. Metadata fields resolve from the closest segment that
         * declares one, so setting `appleWebApp` here **replaces** the root layout's — which is why
         * `startupImage` is repeated: dropping it would give an installed space a white launch
         * screen on iOS (`shared/config/startup-images.ts`). What changes is `title`, the icon's
         * label on iOS before it started reading manifests.
         */
        appleWebApp: { title: name, statusBarStyle: 'default', startupImage: STARTUP_IMAGES },
    }
}

export default async function AddHomeScreenPage({ params }: PageProps) {
    const slug = parseChannelSlug((await params).slug)
    // Not a channel URL at all, so there is nothing to fetch — the same guard the space page makes,
    // for the same reason: this segment matches whatever a bot appends to the path.
    if (!slug) notFound()

    // Shares one upstream request with `generateMetadata` — `getChannelForRequest` is `cache()`d.
    const result = await getChannelForRequest(slug)
    if (result.status === 'gone') notFound()

    /**
     * **Anything else hands the reader to the space itself**, which is the screen that owns those
     * states: `restricted` and `unavailable` have their own walls there, and an NSFW space has its
     * gate. This screen has no way to say "temporarily unavailable" — it is an instruction, and
     * instructions for installing a space nobody can currently open are worse than the space's own
     * explanation. Legacy toasts and then pushes to `/`, losing the space entirely.
     *
     * No loop: the destination carries no markers, so `proxy.ts` does not rewrite it back here.
     */
    if (result.status !== 'ok') redirect(toChannelPath(slug))

    const { channel } = result
    // The **canonical** spelling once it is known, so a mis-cased arrival does not then bounce a
    // second time off the space page's own case redirect.
    if (channel.is_nsfw) redirect(toChannelPath(channel.slug))

    return (
        <main>
            {/*
             * The space's manifest, in the head where a browser can see it — this screen is where
             * a reader is about to use Share → *Add to Home Screen*, so it is the manifest that
             * names the icon they are about to create. Not `generateMetadata`'s `manifest` field:
             * this route's metadata streams into the body and Chromium ignores a manifest link
             * that is not a child of `<head>` (`ChannelManifestLink` has the measurement).
             *
             * An NSFW space never reaches this line — it was redirected to its own gate above.
             */}
            <ChannelManifestLink href={channelManifestPath(channel.slug)} />
            <AddHomeScreenGuide
                name={channel.name ?? channel.slug}
                avatarUrl={channel.images.thumb}
            />
        </main>
    )
}
