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
            disallow: ['/login', '/api/', '/app/', '/my-space'],
        },
        sitemap: `${BASE}/sitemap.xml`,
    }
}
