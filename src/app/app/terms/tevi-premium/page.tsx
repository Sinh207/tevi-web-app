import { LegalPageView, TERMS_PREMIUM } from '@features/legal'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/terms/tevi-premium` — the Premium terms for the mobile app's in-app webview.
 *
 * The webview twin of `/terms/tevi-premium`, and the one the subscription flow opens: the
 * paywall links to it before the purchase, so it has to render with no shell and no
 * navigation (the native app supplies its own header). Language and theme arrive on the
 * URL and are applied by `proxy.ts` + the root layout — see `shared/config/webview.ts`.
 *
 * `noindex` + a canonical pointing at `/terms/tevi-premium`: the copy is identical, and
 * only the public route should be in the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('terms_premium_title'),
        description: t('terms_premium_meta_description'),
        alternates: { canonical: '/terms/tevi-premium' },
        robots: { index: false, follow: false },
    }
}

export default function AppTermsPremiumPage() {
    // Same arrangement as `/app/terms`: `flex-1` rather than a viewport min-height (the
    // shell already reserves the safe-area insets), the document keeps its own `h1`
    // because the native header is outside the document, and the copy runs full-bleed on
    // `--background-surface` so it reads as a native screen.
    return (
        <main className="flex flex-1 flex-col bg-(--background-surface) pt-4">
            <LegalPageView
                document={TERMS_PREMIUM}
                titleKey="terms_premium_title"
                lastUpdatedKey="terms_premium_last_updated"
            />
        </main>
    )
}
