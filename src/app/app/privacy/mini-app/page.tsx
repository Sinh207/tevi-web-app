import { LegalPageView, PRIVACY_POLICY_MINI_APP } from '@features/legal'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/privacy/mini-app` — the mini app privacy policy for the mobile app's webview.
 *
 * The webview twin of `/privacy/mini-app`, and the one the in-app mini app player opens
 * from its tab menu: no shell, no navigation, no back bar (the native app supplies its own
 * header). Language and theme arrive on the URL and are applied by `proxy.ts` + the root
 * layout — see `shared/config/webview.ts`. Like every legal screen in this namespace it
 * mounts no session: it reads no account.
 *
 * `noindex` + a canonical pointing at `/privacy/mini-app`: the copy is identical, and only
 * the public route should be in the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('privacy_miniapp_title'),
        description: t('privacy_miniapp_meta_description'),
        alternates: { canonical: '/privacy/mini-app' },
        robots: { index: false, follow: false },
    }
}

export default function AppPrivacyMiniAppPage() {
    // Same arrangement as `/app/privacy`: `flex-1` rather than a viewport min-height (the
    // shell already reserves the safe-area insets), the document keeps its own `h1` because
    // the native header is outside the document, and the copy runs full-bleed on
    // `--background-surface` so it reads as a native screen.
    return (
        <main className="flex flex-1 flex-col bg-(--background-surface) pt-4">
            <LegalPageView document={PRIVACY_POLICY_MINI_APP} titleKey="privacy_miniapp_title" />
        </main>
    )
}
