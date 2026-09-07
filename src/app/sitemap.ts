import { PREMIUM_PATH } from '@features/premium/routes'
import { BASE_URL as BASE } from '@shared/config/env'
import type { MetadataRoute } from 'next'

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
        /*
         * `/premium` — the one **account-adjacent** page in the app that is `index, follow`, because
         * it is marketing: it explains a product and prices it, and legacy lists it here at exactly
         * this weight (`sitemap-static.xml.js`: priority 0.9, monthly). Its prices come from the
         * backoffice rather than a deploy, hence `monthly` rather than `yearly`.
         *
         * `/gift-premium` is legacy's other 0.9 entry and stays **deliberately absent** — the reason
         * has changed now that the screen exists. It is `noindex, nofollow` (legacy sets that too,
         * in its own `getStaticProps`, while *also* listing it here — the two contradict each
         * other), because it is an account action whose entire content is a picker over other
         * people's spaces. Listing a `noindex` page is asking a crawler to fetch something we have
         * asked it not to keep.
         */
        { url: `${BASE}${PREMIUM_PATH}`, changeFrequency: 'monthly', priority: 0.9 },
        // The `/app/*` twins serve the same documents to the app's webview and are
        // noindex.
        { url: `${BASE}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/privacy/tevi-premium`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/privacy/mini-app`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/terms`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/terms/tevi-premium`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/tos/mini-app`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/safety`, changeFrequency: 'yearly', priority: 0.3 },
        { url: `${BASE}/community-guidelines`, changeFrequency: 'yearly', priority: 0.3 },
        // The open letter: a dated public statement, linked from outside and shared, so it
        // is indexed like the policies. It does not change once published.
        { url: `${BASE}/letter`, changeFrequency: 'yearly', priority: 0.3 },
        // The press kit: creators arrive here looking for the logo, so it earns more than
        // the policies do, and the artwork changes on its own schedule.
        { url: `${BASE}/brand-assets`, changeFrequency: 'monthly', priority: 0.5 },
        { url: `${BASE}/moderation`, changeFrequency: 'yearly', priority: 0.3 },
    ]
}
