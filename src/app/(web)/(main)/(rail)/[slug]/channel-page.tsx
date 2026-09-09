import {
    buildChannelDescription,
    buildChannelTitle,
    ChannelManifestLink,
    ChannelSkeleton,
    ChannelView,
    canonicalChannelRedirect,
    channelKeys,
    channelProfileJsonLd,
    isIndexableChannel,
    parseChannelSlug,
    serializeJsonLd,
    toChannelPath,
} from '@features/channel'
import { channelManifestPath, getChannelForRequest } from '@features/channel/server'
import { getServerT } from '@shared/i18n/server'
import { getServerQueryClient } from '@shared/lib/api/server-query-client'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * A creator's space, rendered by **three** routes.
 *
 * `/@{slug}` is the space itself. `/@{slug}/direct-donation` and `/@{slug}/membership[/{id}]` are the
 * same page reached with something to open — the deep links legacy served by bouncing to
 * `/@{slug}?action=…`, now addresses of their own. They render identically: the intent is read off
 * the URL by the control that owns the dialog (`@features/channel/routes`), so nothing is threaded
 * through the tree and this file does not know what a donation is.
 *
 * Everything except the metadata is therefore shared, and it is shared **here** rather than in the
 * feature because it is composition — a fetch, a canonical redirect, a cache seed and a hydration
 * boundary. Copying it per route would mean three copies of the SEO rules, and they would drift.
 *
 * ## Why a deep-link route rather than a query parameter
 *
 * Two things a `?action=` redirect could not do:
 *
 * - **A share card of its own.** A scraper follows the redirect and describes wherever it lands, so
 *   every donation link produced the space's generic card. These routes carry the offer's title.
 * - **A space page that reads no `searchParams`.** Preserving `?action=` across the canonical-case
 *   redirect was the only reason it read them; the redirect carries a `suffix` now instead. Less
 *   code, and one Dynamic API fewer — but read `page.tsx`'s note before believing it bought a real
 *   404, because it did not.
 *
 * The query spelling still works — those URLs are in bookmarks and legacy's own drawer emits one —
 * it is just no longer what the app produces or what this file has to accommodate.
 */

/** The two deep-link titles. A union, so a mistyped key is a type error rather than a blank card. */
type DeepLinkTitleKey = 'donation_support_title' | 'membership_join_title'

export type ChannelRouteMeta = {
    /**
     * The sub-path under the space, with its leading slash, or `''` for the space itself. Carried
     * through the canonical-case redirect so `/@ADA/membership` lands on `/@Ada/membership` and not
     * on the space.
     */
    suffix?: string
    /**
     * Present ⇒ this is a deep-link route. Two things follow from it: the card describes what the
     * link opens rather than the space, and the route is **`noindex, follow`**.
     *
     * `noindex` because the body is the space page's, so an indexed copy is duplicate content
     * against `/@{slug}` — and a `canonical` pointing there would be the wrong tool, since the two
     * URLs do genuinely differ in what they do. It costs nothing that matters: `noindex` is a
     * search-engine instruction and does not stop a social scraper, which is the reader of these
     * cards.
     */
    titleKey?: DeepLinkTitleKey
}

/** What the creator is called. Their own name, falling back to the slug — `channel-seo.ts`'s rule. */
const displayName = (channel: { name?: string | null; slug: string }) =>
    channel.name ?? channel.slug

/**
 * The metadata for any of the three routes.
 *
 * Shares one upstream request with the body: `getChannelForRequest` is `cache()`d per request.
 */
export async function channelPageMetadata(
    raw: string,
    { suffix = '', titleKey }: ChannelRouteMeta = {},
): Promise<Metadata> {
    const slug = parseChannelSlug(raw)
    /*
     * Not a channel URL at all — the body calls `notFound()`, so this returns **nothing**.
     *
     * It used to return `robots: { index: false, follow: false }`, which put **two** robots tags in
     * the document: Next emits its own `noindex` on a not-found render. Measured on
     * `/not-a-channel-xyz` — `noindex, nofollow` followed by `noindex`. They agree today, which is
     * why nobody noticed; two tags where one is expected is what starts disagreeing after somebody
     * edits one. The `gone` branch below already documents this and already returns nothing; this
     * branch was the copy that missed it.
     */
    if (!slug) return {}

    const t = await getServerT()
    const result = await getChannelForRequest(slug)

    /**
     * Everything that is not a clean `ok` gets generic, noindexed metadata.
     *
     * The important half is `unavailable`: an outage must not produce a page that *claims* to be a
     * missing profile. `noindex` keeps a transient 5xx from being read as a deletion, and a generic
     * title keeps us from asserting a name we could not fetch.
     */
    if (result.status !== 'ok') {
        /**
         * No `robots` for `gone`, on purpose.
         *
         * That status is the one the body turns into `notFound()`, and Next puts its own
         * `<meta name="robots" content="noindex">` on a not-found render. Emitting a second one here
         * produced two robots tags in the same document — measured on `/@nonexistent`. They agreed,
         * so nothing was mis-indexed, but two tags where one is expected is the kind of thing that
         * silently starts disagreeing after someone edits one of them.
         *
         * `restricted` and `unavailable` still render the page, so those do need it.
         */
        return {
            title: t('channel_meta_fallback_title'),
            ...(result.status === 'gone' ? {} : { robots: { index: false, follow: false } }),
        }
    }

    const { channel } = result
    const path = `${toChannelPath(channel.slug)}${suffix}`

    /**
     * NSFW gets the generic title, not the creator's name.
     *
     * `noindex` alone would not be enough: metadata is also what a link preview in a chat app
     * renders, and leaking "«name» (@slug)" into a preview defeats the point of the gate. It applies
     * to the deep-link routes for the same reason and more sharply — a donation link is *shared*,
     * which is exactly the surface this protects.
     */
    if (channel.is_nsfw) {
        return {
            title: t('channel_meta_fallback_title'),
            alternates: { canonical: path },
            robots: { index: false, follow: false },
        }
    }

    const title = titleKey
        ? t(titleKey, { name: displayName(channel) })
        : buildChannelTitle(channel)
    const description = buildChannelDescription(channel)
    const image = channel.images.thumb ?? undefined
    const indexable = !titleKey && isIndexableChannel(channel)

    return {
        title,
        description,
        alternates: { canonical: path },
        robots: { index: indexable, follow: true },
        /**
         * **Declared as well, and it is the copy nobody reads.** Next streams this route's
         * metadata into the body, and Chromium only reads a manifest link that is a child of
         * `<head>` — which is why `ChannelManifestLink` below puts one there. This field is here so
         * that the ignored body copy names the *space's* manifest rather than contradicting it with
         * the site's (the root layout's file convention emits one either way), and so a bot served
         * blocking metadata gets the right link in the head for free.
         */
        manifest: channelManifestPath(channel.slug),
        openGraph: {
            type: 'website',
            url: path,
            title,
            description,
            ...(image ? { images: [{ url: image }] } : {}),
        },
        twitter: {
            card: image ? 'summary_large_image' : 'summary',
            title,
            description,
            ...(image ? { images: [image] } : {}),
        },
    }
}

/**
 * The space itself. Identical on all three routes — see the header for why the intent is not a prop.
 */
export async function ChannelPageBody({ raw, suffix = '' }: { raw: string; suffix?: string }) {
    const slug = parseChannelSlug(raw)
    // No fetch at all for a URL that cannot be a channel — `[slug]` matches every unclaimed
    // single-segment path, so this is what keeps bot scans from costing upstream requests.
    if (!slug) notFound()

    // Shares one upstream request with the metadata — `getChannelForRequest` is `cache()`d.
    const result = await getChannelForRequest(slug)

    /**
     * **Only a definitive 404 becomes `notFound()`.** `restricted` and `unavailable` fall through
     * and render the shell, letting the client fill it in; their metadata is already `noindex`.
     * Turning an outage into a 404 would tell every crawler that live profiles were deleted.
     */
    if (result.status === 'gone') notFound()

    const channel = result.channel

    if (channel && channel.slug !== slug) {
        // No query to carry: none of the three routes reads `searchParams`, which is what keeps them
        // statically rendered. `suffix` is what a deep link needs to survive the correction.
        const destination = canonicalChannelRedirect(slug, channel.slug, null, suffix)
        // 308 rather than 301: the App Router's only 301 paths are static `redirects()` (which
        // cannot know a channel's canonical spelling) and `proxy.ts` (which would need a fetch per
        // request). 308 is semantically identical for GET and understood everywhere.
        if (destination) permanentRedirect(destination)
    }

    /**
     * Seed the **cache**, not a prop.
     *
     * The server has no bearer, so this is the anonymous view and it is keyed `…'anon'`. Every client
     * reads an **account-scoped** key instead — including a visitor who has never signed in, because
     * bootstrap always mints an anonymous session and therefore always has an `activeId`. So the two
     * keys do not meet on their own: `useChannel` bridges them with `initialData`, which paints the
     * server's body immediately and then corrects the viewer-relative fields.
     *
     * What that buys, precisely: a **crawler** renders complete HTML and runs nothing. A person gets
     * a first paint with real content instead of a skeleton, and one background request. Not zero
     * requests — an earlier version of this comment claimed that, and the always-on anonymous session
     * is why it was wrong.
     */
    const queryClient = getServerQueryClient()
    if (channel) {
        queryClient.setQueryData(channelKeys.detail(channel.slug, null), channel)
    }

    return (
        <main className="flex flex-1 flex-col">
            {/*
             * **The space's own manifest, so a phone offers to install *this* space** — the
             * creator's name and avatar on the home screen instead of Tevi's.
             *
             * A component and not `generateMetadata`'s `manifest` field, which looks like the
             * obvious home for it and does not work: Next streams this route's metadata into the
             * **body** (its resolution awaits the channel fetch), and Chromium only reads a
             * manifest link that is a child of `<head>`. `ChannelManifestLink` carries the CDP
             * measurement that pins that down.
             *
             * Rendered for every space page rather than only on the "add to home screen" screen,
             * because both platforms read the manifest of the page you are **standing on**:
             * Chrome's install prompt appears here, and iOS 16.4+ takes the icon's label and
             * picture from here when somebody uses Share → *Add to Home Screen* directly.
             *
             * `channel` is absent only while a wall is being rendered instead of the space, and an
             * NSFW space is refused by the route the link points at — see
             * `shouldServeChannelManifest`.
             */}
            {channel && !channel.is_nsfw && (
                <ChannelManifestLink href={channelManifestPath(channel.slug)} />
            )}
            {channel && (
                <script
                    type="application/ld+json"
                    /*
                     * Structured data has to be a script body — there is no other way to emit
                     * JSON-LD — and `serializeJsonLd` is the escaping that makes it safe. Bare
                     * `JSON.stringify` escapes quotes but **not** angle brackets, so a creator's bio
                     * containing a closing script tag would end this element early and run whatever
                     * followed it. A test pins that behaviour; do not simplify it back.
                     */
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped by serializeJsonLd
                    dangerouslySetInnerHTML={{
                        __html: serializeJsonLd(channelProfileJsonLd(channel)),
                    }}
                />
            )}
            <HydrationBoundary state={dehydrate(queryClient)}>
                {/*
                 * The skeleton is the fallback rather than a spinner: it is the same component
                 * `loading.tsx` renders, so a streaming gap and a client navigation look identical.
                 */}
                <Suspense fallback={<ChannelSkeleton />}>
                    <ChannelView slug={channel?.slug ?? slug} fetchStatus={result.status} />
                </Suspense>
            </HydrationBoundary>
        </main>
    )
}
