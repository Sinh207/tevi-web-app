import {
    buildChannelDescription,
    buildChannelTitle,
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
import { getChannelForRequest } from '@features/channel/server'
import { getServerT } from '@shared/i18n/server'
import { getServerQueryClient } from '@shared/lib/api/server-query-client'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * `/@{slug}` — a creator's space.
 *
 * A **sub-page**: you tap into it, so it lives in `(main)` and not `(tabs)`, and brings its own bar
 * rather than inheriting the global mobile top bar.
 *
 * ## The `@` is what makes a root-level dynamic segment safe
 *
 * The channel namespace is `/@*`, disjoint from every static route the app has or will have — a
 * creator whose slug is `settings` lives at `/@settings` and can never shadow `/settings`. That is
 * why there is no reserved-slug list here. The `@` cannot be a folder name (`app/(main)/@handle/`
 * is a parallel-route *slot* and never becomes a URL segment), so it rides inside `[slug]` and
 * `parseChannelSlug` strips it.
 *
 * ## Reading `searchParams` costs the full-route cache, and there is no way around it
 *
 * The canonical-case redirect has to preserve the query string — `proxy.ts` rewrites
 * `/@ada/direct-donation` into `/@ada?action=direct_donation`, so dropping it would swallow the
 * intent the visitor arrived with — and `permanentRedirect()` does not carry it. So the page reads
 * `searchParams`, which is a Dynamic API, which opts the route out of full-route caching.
 *
 * There is no alternative: the canonical spelling is the creator's own (legacy redirects
 * `/@noraazima` **to** `/@Noraazima`), so `proxy.ts` cannot normalise case as a string transform —
 * it would need a lookup. What is lost on caching is small: `revalidate: 60` lives in the **Data
 * Cache**, which still applies under dynamic rendering, so the upstream is still hit once a minute
 * per region. Only the pre-rendered HTML goes.
 *
 * ## ⚠ Known limitation: `notFound()` here answers **200**, not 404
 *
 * Measured, not assumed — `curl -o /dev/null -w '%{http_code}' /ada` returns `200` with the
 * not-found body. The cause is the paragraph above: a **dynamically rendered** route cannot set the
 * status from inside the render, and reading `searchParams` is what makes this one dynamic. An
 * otherwise identical route that does *not* read them returns a real 404, which is how this was
 * pinned down.
 *
 * `proxy.ts` already knows this and says so where it hard-404s `/dev/*`: *"The pages call
 * `notFound()` themselves, but that leaves the response at 200 on a dynamic route, so stop the
 * request here to get a real 404."* An earlier version of this comment claimed the opposite; it was
 * wrong.
 *
 * The consequence is a **soft 404**: a crawler gets 200 plus "this space does not exist". The
 * `noindex` on this branch keeps it out of the index, which is the important half, but Google still
 * reports soft-404s and they are worth removing. Neither available fix is free, so this is a decision
 * rather than an oversight:
 *
 * - **Reject in `proxy.ts`** — works for a slug with no `@` (a pure path check, no I/O), but needs a
 *   list of the app's static routes there, which is the drift-prone reserved list the `@` namespace
 *   was chosen to avoid.
 * - **Stop reading `searchParams`** — makes the route static and the 404 real, at the cost of the
 *   canonical redirect dropping `?action=…` when the *case* is also wrong.
 *
 * Neither is obviously right, and the `@`-carrying case (`/@deleted-slug`, the one with inbound
 * links) is only fixable by the second. Left as a follow-up with the trade written down.
 */
type PageProps = {
    params: Promise<{ slug: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** `?` + the query, or `''`. Rebuilt because `permanentRedirect()` drops it. */
function toSearchString(params: Record<string, string | string[] | undefined>): string {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) for (const v of value) search.append(key, v)
        else if (value !== undefined) search.append(key, value)
    }
    return search.toString()
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug: raw } = await params
    const slug = parseChannelSlug(raw)
    // Not a channel URL at all. The body calls `notFound()`; metadata just must not describe it.
    if (!slug) return { robots: { index: false, follow: false } }

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
    const path = toChannelPath(channel.slug)

    /**
     * NSFW gets the generic title, not the creator's name.
     *
     * `noindex` alone would not be enough: metadata is also what a link preview in a chat app
     * renders, and leaking "«name» (@slug)" into a preview defeats the point of the gate.
     */
    if (channel.is_nsfw) {
        return {
            title: t('channel_meta_fallback_title'),
            alternates: { canonical: path },
            robots: { index: false, follow: false },
        }
    }

    const title = buildChannelTitle(channel)
    const description = buildChannelDescription(channel)
    const image = channel.images.thumb ?? undefined
    const indexable = isIndexableChannel(channel)

    return {
        title,
        description,
        alternates: { canonical: path },
        robots: { index: indexable, follow: true },
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

export default async function ChannelPage({ params, searchParams }: PageProps) {
    const { slug: raw } = await params
    const slug = parseChannelSlug(raw)
    // No fetch at all for a URL that cannot be a channel — `[slug]` matches every unclaimed
    // single-segment path, so this is what keeps bot scans from costing upstream requests.
    if (!slug) notFound()

    // Shares one upstream request with `generateMetadata` — `getChannelForRequest` is `cache()`d.
    const result = await getChannelForRequest(slug)

    /**
     * **Only a definitive 404 becomes `notFound()`.** `restricted` and `unavailable` fall through
     * and render the shell, letting the client fill it in; their metadata is already `noindex`.
     * Turning an outage into a 404 would tell every crawler that live profiles were deleted.
     */
    if (result.status === 'gone') notFound()

    const channel = result.channel

    // `searchParams` is awaited **only when a redirect is actually happening** — which is almost
    // never, since almost every visitor arrives at the canonical spelling. It does not un-dynamic the
    // route (declaring the prop is enough for that), but there is no reason to await a promise whose
    // value is thrown away on the common path.
    if (channel && channel.slug !== slug) {
        const search = toSearchString(await searchParams)
        const destination = canonicalChannelRedirect(slug, channel.slug, search)
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
