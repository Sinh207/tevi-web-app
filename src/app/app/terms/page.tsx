import { LegalPageView, TERMS_OF_USE } from '@features/legal'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/terms` — the same terms for the mobile app's in-app webview.
 *
 * `/app/*` is the legacy webview namespace: no shell, no navigation, no back bar (the
 * native app supplies its own header), which is why this route sits outside the `(main)`
 * group rather than inside it. The app's language and theme arrive on the URL and are
 * applied by `proxy.ts` + the root layout, so this page needs no parameters of its own —
 * see `shared/config/webview.ts` for the contract.
 *
 * `noindex` + a canonical pointing at `/terms`: the copy is identical, and only the
 * public route should be in the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('menu_terms_of_use'),
        description: t('terms_meta_description'),
        alternates: { canonical: '/terms' },
        robots: { index: false, follow: false },
    }
}

export default function AppTermsPage() {
    // Same arrangement as `/app/privacy`: `flex-1` rather than a viewport min-height (the
    // shell already reserves the safe-area insets), the document keeps its own `h1`
    // because the native header is outside the document, and the copy runs full-bleed on
    // `--background-surface` so it reads as a native screen.
    return (
        <main className="flex flex-1 flex-col bg-(--background-surface) pt-4">
            <LegalPageView
                document={TERMS_OF_USE}
                titleKey="menu_terms_of_use"
                lastUpdatedKey="terms_last_updated"
            />
        </main>
    )
}
