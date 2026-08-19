import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LiveStates } from './live-states'

export const metadata: Metadata = {
    title: 'Live tab states',
    robots: { index: false, follow: false },
}

/**
 * Dev-only harness for the Live tab: `pnpm dev`, then `/dev/live`. 404s in production.
 *
 * ## Why it exists
 *
 * Every state on this tab is behind an owner session — `v4/events/` answers for the bearer and takes
 * no slug, so there is no URL that shows a stranger what a creator's event list looks like. That made
 * the whole tab unverifiable by browsing, and it is exactly how the first version of it shipped as a
 * *vertical card with a full-bleed banner* when legacy draws a **horizontal row**: it was written
 * from grepped fragments instead of from looking at anything.
 *
 * Six statuses is also more than a real account is ever in at once. Here they are on one page, so the
 * badge mapping and the row rhythm can be checked against each other.
 */
export default function LiveStatesPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return <LiveStates />
}
