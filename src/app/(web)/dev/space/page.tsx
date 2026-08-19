import { ChannelSkeleton } from '@features/channel'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
    title: 'Space skeleton',
    robots: { index: false, follow: false },
}

/**
 * Dev-only harness for the channel page's loading state: `pnpm dev`, then `/dev/space`. 404s in
 * production (and `proxy.ts` blocks `/dev/*` outright, so the status is a real 404 rather than a
 * 200 with a 404 body).
 *
 * ## Why this exists rather than "just look at the page"
 *
 * The skeleton is the one screen you cannot reach on purpose. It is what `loading.tsx` streams while
 * the server fetch is in flight, so on a normal visit it is replaced before it paints — and its whole
 * job is to be the same shape as what replaces it. That makes "does it match?" a question nobody can
 * answer by browsing, which is exactly how a skeleton drifts from the layout it stands in for.
 *
 * Open this beside `/@<slug>` at the same viewport and compare where things land. The numbers that
 * matter are the offsets of the avatar, the action row and the tab strip: those are what jump if the
 * two disagree.
 *
 * It renders the real `ChannelSkeleton` — the same export `loading.tsx` and `/my-space` use — rather
 * than a copy. A harness that previews its own duplicate of the thing would drift from it too.
 */
export default function SpaceSkeletonPage() {
    if (process.env.NODE_ENV === 'production') notFound()

    return (
        <main className="flex flex-1 flex-col">
            <ChannelSkeleton />
        </main>
    )
}
