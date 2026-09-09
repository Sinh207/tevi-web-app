import type { Metadata } from 'next'
import { ChannelPageBody, channelPageMetadata } from './channel-page'

/**
 * `/@{slug}` — a creator's space.
 *
 * A **sub-page**: you tap into it, so it lives in `(main)` and not `(tabs)`, and brings its own bar
 * rather than inheriting the global mobile top bar.
 *
 * The body and the metadata are `channel-page.tsx`'s, shared with the two deep-link routes beside
 * this one (`direct-donation/`, `membership/`) which render the same space with something open. Read
 * that file's header for why they are routes rather than a query parameter.
 *
 * ## The `@` is what makes a root-level dynamic segment safe
 *
 * The channel namespace is `/@*`, disjoint from every static route the app has or will have — a
 * creator whose slug is `settings` lives at `/@settings` and can never shadow `/settings`. That is
 * why there is no reserved-slug list here. The `@` cannot be a folder name (`app/(main)/@handle/`
 * is a parallel-route *slot* and never becomes a URL segment), so it rides inside `[slug]` and
 * `parseChannelSlug` strips it.
 *
 * ## This route reads no `searchParams` — and ⚠ that is **not** what fixes the soft 404
 *
 * It used to read them, for one reason: the canonical-case redirect had to carry `?action=` —
 * legacy's spelling of the donation and membership deep links — because `permanentRedirect()` drops
 * the query. Those links are paths now, so the redirect carries a `suffix` instead and the prop is
 * gone. Worth doing on its own: less code, and one Dynamic API fewer.
 *
 * **The note that used to stand here claimed that reading `searchParams` was what made
 * `notFound()` answer 200 rather than a real 404, and offered removing it as one of two fixes. That
 * attribution is wrong.** Removing it changes nothing, measured:
 *
 * ```
 * /a/b/c                          404   ← no route matches; Next sets the status before any render
 * /@nonexistent-xyz-123           200   ← this route, with no searchParams read
 * /add-home-screen/not-a-channel  200   ← notFound() on a pure path check: no fetch, no query
 * /@tevi/event/nonexistent-code   200
 * ```
 *
 * The cause is one level up and applies to **every route in the app**: `app/layout.tsx` awaits
 * `cookies()` and `headers()` to resolve the request locale, so every document is dynamically
 * rendered and streams — and a `notFound()` raised during a streamed render can no longer set the
 * status. Nothing a page does can opt out of its own root layout.
 *
 * So the soft 404 stands, and the two fixes the old note listed reduce to one that is real (reject
 * in `proxy.ts`, which needs the reserved-route list the `@` namespace exists to avoid) plus one
 * that would work and costs more than it sounds: give up a localized `<title>` on every page, or
 * resolve the locale somewhere that is not a Dynamic API.
 *
 * What dropping the prop does cost is small and worth naming: a URL that is **both** misspelled and
 * carrying `?action=` now lands on the right space without opening anything, because the correction
 * no longer carries a query. A legacy URL with a legacy typo. The query spelling itself still works
 * everywhere else — `parseChannelIntent` accepts both.
 */
type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params
    return channelPageMetadata(slug)
}

export default async function ChannelPage({ params }: PageProps) {
    const { slug } = await params
    return <ChannelPageBody raw={slug} />
}
