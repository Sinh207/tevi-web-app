import { MySpaceRedirect } from '@features/channel'
import { AppTopBar } from '@features/navigation'
import type { Metadata } from 'next'

/**
 * `/my-space` — where the tab bar's and the rail's profile entries point.
 *
 * A **static** route, so it wins over `[slug]` at the same level and needs no `@`. All it does is
 * resolve which channel is yours and send you there; the interesting cases (no channel yet, signed
 * out) are the reason it is a page rather than a redirect in `proxy.ts`, which could not know either.
 *
 * `noindex`: it is a per-user redirect, so there is nothing here for a crawler to index and its
 * content differs for every visitor. Said again as an `X-Robots-Tag` by `proxy.ts`, and deliberately
 * absent from `sitemap.ts` — but **not** disallowed in `robots.ts`, where its `noindex` would go
 * unread.
 *
 * ## The bar is passed in, and only the empty states use it
 *
 * This route is a tab destination that lives outside `(tabs)`, because it resolves into `/@{slug}`
 * and that page draws its own bar. So the group cannot supply the global mobile top bar and the two
 * states that never reach the destination — signed out, and the no-channel fallback — were the one
 * screen in the app rendering under no bar at all.
 *
 * `AppTopBar` is handed to the client component rather than rendered beside it: which bar belongs
 * here is the page's decision, *when* there is a bar at all depends on a state only the client
 * knows. Passing the element keeps both where they belong — and keeps this file a server component,
 * since an element crossing the boundary is just flight data.
 */
export const metadata: Metadata = {
    robots: { index: false, follow: false },
}

export default function MySpacePage() {
    return (
        <main className="flex flex-1 flex-col">
            <MySpaceRedirect chrome={<AppTopBar />} />
        </main>
    )
}
