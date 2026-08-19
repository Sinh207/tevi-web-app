import { LegalPageView, SAFETY_POLICY } from '@features/legal'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/safety` — the same policy for the mobile app's in-app webview.
 *
 * No shell, no navigation, no back bar (the native app supplies its own header), which is
 * why this route sits outside the `(main)` group. Language and theme arrive on the URL and
 * are applied by `proxy.ts` + the root layout — see `shared/config/webview.ts`.
 *
 * `noindex` + a canonical pointing at `/safety`: the copy is identical, and only the
 * public route should be in the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('menu_safety'),
        description: t('safety_meta_description'),
        alternates: { canonical: '/safety' },
        robots: { index: false, follow: false },
    }
}

export default function AppSafetyPage() {
    return (
        // See `/app/privacy` for the reasoning: `flex-1` rather than a viewport height,
        // the document keeps its own `h1` because nothing in the document names the screen,
        // and the copy runs full-bleed on `--background-surface` so it reads as native.
        <main className="flex flex-1 flex-col bg-(--background-surface) pt-4">
            <LegalPageView
                document={SAFETY_POLICY}
                titleKey="menu_safety"
                lastUpdatedKey="safety_last_updated"
            />
        </main>
    )
}
