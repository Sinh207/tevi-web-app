import { COMMUNITY_GUIDELINES, LegalPageView } from '@features/legal'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/community-guidelines` — the same guidelines for the mobile app's in-app webview.
 *
 * The app reaches this one more often than any other document: it is what "Community
 * Guidelines" links to from a report confirmation, a suspension notice, and the post
 * composer. No shell, no navigation, no back bar (the native app supplies its own header),
 * which is why the route sits outside the `(main)` group. Language and theme arrive on the
 * URL and are applied by `proxy.ts` + the root layout — see `shared/config/webview.ts`.
 *
 * `noindex` + a canonical pointing at `/community-guidelines`: the copy is identical, and
 * only the public route should be in the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('menu_community_guidelines'),
        description: t('guidelines_meta_description'),
        alternates: { canonical: '/community-guidelines' },
        robots: { index: false, follow: false },
    }
}

export default function AppCommunityGuidelinesPage() {
    return (
        // See `/app/privacy` for the reasoning: `flex-1` rather than a viewport height,
        // the document keeps its own `h1` because nothing in the document names the screen,
        // and the copy runs full-bleed on `--background-surface` so it reads as native.
        <main className="flex flex-1 flex-col bg-(--background-surface) pt-4">
            <LegalPageView
                document={COMMUNITY_GUIDELINES}
                titleKey="menu_community_guidelines"
                lastUpdatedKey="guidelines_last_updated"
            />
        </main>
    )
}
