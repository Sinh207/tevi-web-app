import { BASE_URL as BASE } from '@shared/config/env'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            /*
             * **Only what has no page at all.** `disallow` stops a crawler *fetching* a URL, not
             * indexing it — a disallowed URL that is linked from elsewhere is indexed bare, with no
             * title, and the `noindex` that would have kept it out is never read.
             *
             * So the routes that must stay out of the index — `/app/*` (the webview twins),
             * `/my-space` (a different channel per visitor), `/add-home-screen` and legacy's
             * `?startapp&addToHomeScreen` spelling of it (shared, so linked), `/login`, `/signup` —
             * are deliberately **not** here. They are crawlable, and say `noindex` twice: in their
             * metadata and as an `X-Robots-Tag` from `proxy.ts`, which also reaches the responses
             * that have no `<head>` to put a tag in.
             */
            disallow: ['/api/'],
        },
        sitemap: `${BASE}/sitemap.xml`,
    }
}
