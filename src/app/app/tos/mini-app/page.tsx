import { LegalPageView, TERMS_MINI_APP } from '@features/legal'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/tos/mini-app` — the mini app terms of service for the mobile app's webview.
 *
 * The webview twin of `/tos/mini-app`, and the pair to `/app/privacy/mini-app`: the
 * native app hosts mini apps itself through the same bridge this client implements, and
 * these two are what its tab menu opens. No shell, no navigation, no back bar; language
 * and theme arrive on the URL (see `shared/config/webview.ts`); no session is mounted.
 *
 * `noindex` + a canonical pointing at `/tos/mini-app`: the copy is identical, and only
 * the public route should be in the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('terms_miniapp_title'),
        description: t('terms_miniapp_meta_description'),
        alternates: { canonical: '/tos/mini-app' },
        robots: { index: false, follow: false },
    }
}

export default function AppTermsMiniAppPage() {
    // Same arrangement as `/app/terms`: `flex-1` rather than a viewport min-height (the
    // shell already reserves the safe-area insets), the document keeps its own `h1` because
    // the native header is outside the document, and the copy runs full-bleed on
    // `--background-surface` so it reads as a native screen.
    return (
        <main className="flex flex-1 flex-col bg-(--background-surface) pt-4">
            <LegalPageView document={TERMS_MINI_APP} titleKey="terms_miniapp_title" />
        </main>
    )
}
