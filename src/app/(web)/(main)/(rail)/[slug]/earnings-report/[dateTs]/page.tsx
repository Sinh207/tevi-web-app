import { parseChannelSlug } from '@features/channel'
import { parseEarningsDateParam } from '@features/earnings'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EarningsReportScreen, earningsMetadata } from '../screen'

/**
 * `/@{slug}/earnings-report/{dateTs}` — the same report, with one day already open.
 *
 * Legacy's URL and legacy's unit: **`dateTs` is in seconds**, while the row's own `date` is in
 * milliseconds. That mismatch is legacy's contract, not a slip in the port — the mobile apps
 * build these links — and `parseEarningsDateParam` / `matchesEarningsDateParam` are the only two
 * places the two units are allowed to meet.
 *
 * ## A bad segment renders the report rather than 404ing
 *
 * `parseEarningsDateParam` answers `null` for anything that is not a positive integer, and `null`
 * simply means "no row pre-expanded" — which is the parent route. That is deliberate: the segment
 * is a *hint about scroll position*, not a resource. A stale link from a push notification sent
 * six months ago, or a day the account has since stopped having, should land the creator on their
 * report, not on a not-found page. The slug, which **is** a resource, still 404s.
 *
 * The canonical carries the segment, so each day's URL claims itself rather than the parent —
 * `noindex` makes that mostly theoretical, and it costs one argument.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string; dateTs: string }>
}): Promise<Metadata> {
    const { slug, dateTs } = await params
    const parsed = parseChannelSlug(slug)
    if (!parsed) return { robots: { index: false, follow: false } }
    const seconds = parseEarningsDateParam(dateTs)
    // Only a segment we could parse goes into the canonical — echoing an unparsed one back would
    // publish whatever the path happened to contain as this page's own address.
    return earningsMetadata(parsed, seconds === null ? undefined : String(seconds))
}

export default async function EarningsReportDayPage({
    params,
}: {
    params: Promise<{ slug: string; dateTs: string }>
}) {
    const { slug, dateTs } = await params
    const parsed = parseChannelSlug(slug)
    if (!parsed) notFound()

    return (
        <EarningsReportScreen slug={parsed} initialDateSeconds={parseEarningsDateParam(dateTs)} />
    )
}
