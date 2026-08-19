import { LegalPageView, PRIVACY_POLICY_PREMIUM } from '@features/legal'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/privacy/tevi-premium` — the Premium privacy policy for the mobile app's webview.
 *
 * The webview twin of `/privacy/tevi-premium`, and the one the subscription flow opens
 * alongside the Premium terms: no shell, no navigation, no back bar (the native app
 * supplies its own header). Language and theme arrive on the URL and are applied by
 * `proxy.ts` + the root layout — see `shared/config/webview.ts`.
 *
 * `noindex` + a canonical pointing at `/privacy/tevi-premium`: the copy is identical, and
 * only the public route should be in the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('privacy_premium_title'),
        description: t('privacy_premium_meta_description'),
        alternates: { canonical: '/privacy/tevi-premium' },
        robots: { index: false, follow: false },
    }
}

export default function AppPrivacyPremiumPage() {
    // Same arrangement as `/app/privacy`: `flex-1` rather than a viewport min-height (the
    // shell already reserves the safe-area insets), the document keeps its own `h1` because
    // the native header is outside the document, and the copy runs full-bleed on
    // `--background-surface` so it reads as a native screen.
    return (
        <main className="flex flex-1 flex-col bg-(--background-surface) pt-4">
            <LegalPageView
                document={PRIVACY_POLICY_PREMIUM}
                titleKey="privacy_premium_title"
                lastUpdatedKey="privacy_premium_last_updated"
            />
        </main>
    )
}
