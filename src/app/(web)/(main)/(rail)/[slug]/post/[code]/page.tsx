import { parseChannelSlug } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import {
    buildPostDescription,
    buildPostTitle,
    isCanonicalPath,
    mayRenderForCrawler,
    postCanonicalPath,
} from '@features/post'
import { getPostForRequest } from '@features/post/server'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { PostDetailScreen } from './post-detail-screen'

/**
 * `/@{slug}/post/{code}` — one post and its replies.
 *
 * ## `noindex, follow`, and the page is server-rendered anyway
 *
 * Legacy sets that directive on every exit path of this route, with the reason in the file:
 * **spaces are the only pages Tevi wants ranking**, and `follow` still lets a crawler walk the
 * links back to the space that owns the post. So the SSR here is not for the index. It is for the
 * person opening a shared link — the post is in the first paint instead of behind a hydration —
 * and for Facebook, Telegram and Slack, whose scrapers read the initial HTML and run no
 * JavaScript. `lib/post-seo.ts` carries the rest.
 *
 * ## A post has two addresses, so this route redirects to one of them
 *
 * The endpoint accepts the raw id *and* the short `code`, and inbound links vary in slug casing.
 * `permanentRedirect` sends everyone to the canonical form rather than relying on `rel=canonical`
 * alone — legacy does the same with a 301 from `getServerSideProps`.
 *
 * ⚠ **It is not a 308 here, and cannot be.** Measured on this route:
 *
 * ```
 * GET /@kkkkkkooo/post/01a079ee-…      200, body carries
 *                                      <meta http-equiv="refresh" content="0;url=/@…/post/dxp…">
 * ```
 *
 * Same cause as the soft 404 below: the document streams, so by the time this runs the status line
 * is already sent and Next falls back to a client-side redirect. Browsers follow it, so the reader
 * lands on the canonical URL either way; what is lost is the signal to crawlers and proxies — and
 * this page is `noindex`, so that costs close to nothing. `rel=canonical` is emitted regardless and
 * is the durable half.
 *
 * Do not "fix" this by hand-rolling a response: the redirect is correct, its transport is decided
 * one level up, and the two ways out are the ones `[slug]/page.tsx` lists.
 *
 * ## `notFound()` here is a **soft** 404, and that is not this route's doing
 *
 * `app/layout.tsx` awaits `cookies()` and `headers()` to resolve the locale, so every document in
 * this app is dynamically rendered and a `notFound()` raised during the render can no longer set
 * the status. `[slug]/page.tsx` measures it on four routes and lists the two ways out, neither
 * free. Nothing here can opt out of its own root layout.
 */
type PageProps = { params: Promise<{ slug: string; code: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug, code } = await params
    const t = await getServerT()

    /*
     * Generic and noindexed for every outcome that is not a clean, showable post — the rule
     * `channel-page.tsx` states. The important half is `unavailable`: an outage must not produce a
     * page that *asserts* a post's words, and `noindex` keeps a transient 5xx from reading as a
     * deletion.
     */
    const fallback: Metadata = {
        // `absolute` for the same reason the real title below is — the template would make this
        // read `Tevi · Tevi`.
        title: { absolute: t('post_meta_fallback_title') },
        robots: { index: false, follow: false },
    }

    if (!parseChannelSlug(slug)) return fallback

    /*
     * Every non-`ok` outcome gets the same generic, noindexed metadata — including `gone`.
     *
     * `channel-page.tsx` omits `robots` on its own `gone` branch, and that is right *there* because
     * its body calls `notFound()` and Next emits its own `noindex` on that render; a second tag
     * beside it would be two where one is expected. This page does **not** call `notFound()` — the
     * body renders a "no longer available" notice instead, which is better copy than the generic
     * not-found screen and is also what a reader whose session can see a post an anonymous render
     * could not still needs. No `notFound()`, no tag from Next, so this branch must carry its own.
     */
    const result = await getPostForRequest(code)
    if (result.status !== 'ok') return fallback

    const { post } = result

    /*
     * NSFW and deleted posts get the generic title rather than their own.
     *
     * `noindex` alone would not cover it: metadata is what a chat app renders as a link preview,
     * with no consent gate in front of it and no way for us to put one there. Withholding the
     * words is the only control this surface has.
     */
    if (!mayRenderForCrawler(post)) return fallback

    const canonical = postCanonicalPath(post, code)

    const title = buildPostTitle(post)

    return {
        /*
         * `absolute`, because the title already ends in the brand.
         *
         * The root layout's template is `'%s · Tevi'`, and legacy's post title format — pinned by a
         * test, because changing it churns the preview of every link already shared — ends in
         * `'| Tevi'`. Left to the template the tab would read `… | Tevi · Tevi`.
         *
         * ⚠ `/@{slug}` has the same defect today (`… - Tevi · Tevi`, measured). Not fixed here: that
         * page **is** indexed, so its title is a live SEO surface and changing it is a decision of a
         * different weight than a preview nobody ranks.
         */
        title: { absolute: title },
        description: buildPostDescription(post),
        ...(canonical ? { alternates: { canonical } } : {}),
        // `follow`, so a shared post keeps passing signal to the space that owns it.
        robots: { index: false, follow: true },
        openGraph: {
            type: 'article',
            title,
            description: buildPostDescription(post),
            ...(canonical ? { url: canonical } : {}),
            /*
             * A gated post offers **only** its cover image — the teaser the backend shows a
             * non-buyer. Its real media is not in this payload at all (the backend withholds it
             * rather than trusting a client to hide it), so there is nothing here to leak; the
             * ordering below just makes sure a free post's own image wins when it has one.
             */
            ...ogImage(post.cover_image?.uri ?? post.images?.[0]?.uri ?? null),
        },
    }
}

function ogImage(uri: string | null) {
    return uri ? { images: [{ url: uri }] } : {}
}

export default async function PostDetailPage({ params }: PageProps) {
    const { slug, code } = await params
    const t = await getServerT()

    const parsed = parseChannelSlug(slug)
    const result = await getPostForRequest(code)

    /*
     * Redirected before anything renders, and only when the post is really there. A redirect built
     * from a body we could not fetch would send a reader somewhere on the strength of a guess.
     */
    if (parsed && result.status === 'ok') {
        const canonical = postCanonicalPath(result.post, code)
        if (canonical && !isCanonicalPath(`/${slug}/post/${code}`, canonical)) {
            permanentRedirect(canonical)
        }
    }

    /*
     * `gone` is not passed down as a server body: the view asks again as the reader, and a post an
     * anonymous render could not see is one a signed-in reader may well be able to. Only a clean
     * `ok` seeds the first paint — `usePostDetail` explains why even that is `placeholderData`.
     */
    const serverPost =
        result.status === 'ok' && mayRenderForCrawler(result.post) ? result.post : null

    return (
        <main className="mx-auto flex w-full max-w-[612px] flex-1 flex-col">
            <PageBackBar title={t('post_detail_title')} />
            {/* A client boundary, and only because a hook has to be read. See the file. */}
            <PostDetailScreen identifier={code} serverPost={serverPost} />
        </main>
    )
}
