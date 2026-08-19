import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://tevi.com'

/**
 * Static entries only.
 *
 * Channel pages (`/@{slug}`) are **not** here yet, and it is a missing endpoint rather than an
 * oversight: emitting them needs a list of public channels, which no API surface provides — and
 * `isIndexableChannel` would still have to filter that list (NSFW, suspended, non-public privacy, a
 * numeric slug and thin profiles are all excluded). Until then channels are discovered by link,
 * exactly as in legacy, whose sitemap also omitted them.
 */
export default function sitemap(): MetadataRoute.Sitemap {
    return [
        { url: `${BASE}/`, changeFrequency: 'daily', priority: 1 },
        // The `/app/*` twins serve the same documents to the app's webview and are
        // noindex.
        { url: `${BASE}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/privacy/tevi-premium`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/terms`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/terms/tevi-premium`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/safety`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/community-guidelines`, changeFrequency: 'yearly', priority: 0.3 },
        // The press kit: creators arrive here looking for the logo, so it earns more than
        // the policies do, and the artwork changes on its own schedule.
        { url: `${BASE}/brand-assets`, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${BASE}/moderation`, changeFrequency: 'yearly', priority: 0.3 },
    ]
}
