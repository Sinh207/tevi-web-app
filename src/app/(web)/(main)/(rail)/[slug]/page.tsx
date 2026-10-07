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
 * ## A missing channel answers **200**, and what actually causes it
 *
 * Measured:
 *
 * ```
 * /a/b/c                          404   ← no route matches; Next sets the status before any render
 * /@nonexistent-xyz-123           200   ← notFound() in this route
 * /add-home-screen/not-a-channel  200   ← notFound() on a pure path check: no fetch, no query
 * /@tevi/event/nonexistent-code   200
 * ```
 *
 * **The cause is streaming, and specifically `loading.tsx`.** Next commits the status line when the
 * first byte of the body goes out, and the body starts the moment a Suspense fallback renders. Every
 * page here sits under one: `app/loading.tsx` wraps the whole app, and this route has its own. By
 * the time `notFound()` (or `permanentRedirect()`) runs, `200` is already on the wire — Next's own
 * docs, `loading.js` § Status Codes.
 *
 * This note used to blame the root layout's `cookies()` / `headers()`. That was wrong: dynamic
 * rendering does not stream by itself, so resolving the locale differently would change nothing.
 * The earlier version before it blamed `searchParams`, also wrong. Neither was ever the lever.
 *
 * **It is left as is, on purpose**, because for a search engine it costs nothing:
 *
 * - A `notFound()` that streams gets `<meta name="robots" content="noindex">` from Next, so the URL
 *   is never indexed. A crawler may *label* it a soft 404; it does not keep it.
 * - A `permanentRedirect()` that streams becomes `<meta http-equiv="refresh" content="0;url=…">`,
 *   which Google treats as a permanent redirect. `rel=canonical` says the same thing again.
 *
 * The real 404 / 308 would cost the instant skeleton on every client-side navigation into a space —
 * the two ways to get it are removing the `loading.tsx` above the `notFound()`, or a channel lookup
 * in `proxy.ts` on every `/@…` request (Next's other suggestion, "keep proxy checks fast"). Revisit
 * if a real status is ever needed for something other than a crawler — analytics, compliance.
 *
 * (`searchParams` is still not read here, for its own reason: the canonical-case redirect carries a
 * `suffix` rather than `?action=`, so the prop has no reader.)
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
