import { MySpaceRedirect } from '@features/channel'
import type { Metadata } from 'next'

/**
 * `/my-space` — where the tab bar's and the rail's profile entries point.
 *
 * A **static** route, so it wins over `[slug]` at the same level and needs no `@`. All it does is
 * resolve which channel is yours and send you there; the interesting cases (no channel yet, signed
 * out) are the reason it is a page rather than a redirect in `proxy.ts`, which could not know either.
 *
 * `noindex`: it is a per-user redirect, so there is nothing here for a crawler to index and its
 * content differs for every visitor. Also listed in `robots.ts`'s `disallow`, and deliberately absent
 * from `sitemap.ts`.
 */
export const metadata: Metadata = {
    robots: { index: false, follow: false },
}

export default function MySpacePage() {
    return (
        <main className="flex flex-1 flex-col">
            <MySpaceRedirect />
        </main>
    )
}
