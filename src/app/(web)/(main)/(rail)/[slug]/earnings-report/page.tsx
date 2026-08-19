import { parseChannelSlug } from '@features/channel'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EarningsReportScreen, earningsMetadata } from './screen'

/**
 * `/@{slug}/earnings-report` — the creator's daily payout ledger.
 *
 * Legacy's URL, unchanged (`pages/[channelSlug]/earnings-report`), because links to it exist
 * outside this repo — the mobile apps open it in a webview — and the cutover is same-origin.
 *
 * ## Everything below the bar is client code, and it has to be
 *
 * The report is `report/v1/channel/revenue/daily/` **as this bearer**, and there is no SSR bearer
 * in this app by construction (`shared/lib/api/token.ts`). So the server renders the shell, the
 * bar and the title, and the figures resolve after hydration. This is not a case that could be
 * improved with `createServerApiModel`: that client is for public content, and a payout report is
 * the opposite of public.
 *
 * ## The slug is validated here and used for exactly two things
 *
 * `parseChannelSlug` rejects anything that is not a `@`-prefixed channel URL, which is free and
 * keeps every bot probing `/wp-admin/earnings-report` from reaching a React tree. What survives is
 * used for the back link and for the ownership comparison in the view — **not** for the request,
 * which carries no channel at all. See `features/earnings/api/earnings-api.ts`.
 *
 * ⚠ Like `/@{slug}` itself, a `notFound()` on this route answers **200** with the not-found body
 * rather than a real 404 — see that page's note. It matters less here: the route is `noindex`, so
 * there is no soft-404 to report, and a bot that guessed a channel URL gets nothing either way.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>
}): Promise<Metadata> {
    const { slug } = await params
    const parsed = parseChannelSlug(slug)
    // A URL that is not a channel URL has no title worth computing; the page 404s below.
    if (!parsed) return { robots: { index: false, follow: false } }
    return earningsMetadata(parsed)
}

export default async function EarningsReportPage({
    params,
}: {
    params: Promise<{ slug: string }>
}) {
    const { slug } = await params
    const parsed = parseChannelSlug(slug)
    if (!parsed) notFound()

    return <EarningsReportScreen slug={parsed} />
}
