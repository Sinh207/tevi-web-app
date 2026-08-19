import { LegalPageView, PRIVACY_POLICY } from '@features/legal'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/privacy` — the same policy for the mobile app's in-app webview.
 *
 * `/app/*` is the legacy webview namespace: no shell, no navigation, no back bar (the
 * native app supplies its own header), which is why this route sits outside the `(main)`
 * group rather than inside it. The app's language and theme arrive on the URL and are
 * applied by `proxy.ts` + the root layout, so this page needs no parameters of its own —
 * see `shared/config/webview.ts` for the contract.
 *
 * `noindex` + a canonical pointing at `/privacy`: the copy is identical, and only the
 * public route should be in the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('menu_privacy_policy'),
        description: t('privacy_meta_description'),
        alternates: { canonical: '/privacy' },
        robots: { index: false, follow: false },
    }
}

export default function AppPrivacyPage() {
    return (
        // `flex-1`, not a viewport min-height: the shell already reserves the safe-area
        // insets, and a second full-viewport box inside them overflows by exactly that much.
        //
        // Tuned for the phone, since that is the only thing that ever opens this: it keeps
        // its own `h1` (nothing above it names the screen — the native header is outside the
        // document, so dropping the heading would leave the page with none), the chip row
        // sticks to the very top because there is no web bar to sit under, and the copy runs
        // on `--background-surface` full-bleed so it reads as a native screen.
        <main className="flex flex-1 flex-col bg-(--background-surface) pt-4">
            <LegalPageView
                document={PRIVACY_POLICY}
                titleKey="menu_privacy_policy"
                lastUpdatedKey="privacy_last_updated"
            />
        </main>
    )
}
