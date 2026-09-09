import { BASE_URL as BASE } from '@shared/config/env'
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            // `/app/*` is the mobile app's webview namespace — the same documents as the
            // public routes, so keep it out of the index and out of duplicate-content range.
            // `/my-space` resolves to whichever channel belongs to the visitor, so its content
            // differs per request and there is nothing stable to index.
            disallow: [
                '/login',
                '/api/',
                '/app/',
                '/my-space',
                /**
                 * The "add this space to your home screen" instructions — legacy disallows the
                 * same thing (`/*?*startapp`, `/*?*addToHomeScreen`) and for the same reason: the
                 * screen is thin by design, its content belongs to `/@{slug}`, and an indexed copy
                 * would compete with the space itself. Three patterns because there are three ways
                 * to reach it: the two markers legacy's manifest used, and this app's own rewrite
                 * target, which answers directly too.
                 *
                 * The wildcards are the query-string form Google and Bing both document; the pages
                 * also carry `noindex`, which is the half that works for a crawler that arrived
                 * from a link instead of the sitemap.
                 */
                '/add-home-screen',
                '/*?*startapp',
                '/*?*addToHomeScreen',
            ],
        },
        sitemap: `${BASE}/sitemap.xml`,
    }
}
