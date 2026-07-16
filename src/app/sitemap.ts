import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://tevi.com'

/** Static entries for Phase 1. Dynamic (channel/post) entries come with those features. */
export default function sitemap(): MetadataRoute.Sitemap {
    return [{ url: `${BASE}/`, changeFrequency: 'daily', priority: 1 }]
}
