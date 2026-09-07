import { getOpenLetter, OpenLetterView } from '@features/legal'
import { getServerLocale } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/app/letter` — the open letter for the mobile app's in-app webview.
 *
 * The webview twin of `/letter`: no shell, no navigation, no back bar (the native app
 * supplies its own header), and no session — the letter reads no account. Language and
 * theme arrive on the URL and are applied by `proxy.ts` + the root layout, which is also
 * what picks the letter's own language here: `getServerLocale` reads the same
 * `?lang=` the app sent. See `shared/config/webview.ts`.
 *
 * `noindex` + a canonical pointing at `/letter`: the copy is identical, and only the
 * public route should be in the index.
 */
export async function generateMetadata(): Promise<Metadata> {
    const letter = getOpenLetter(await getServerLocale())
    return {
        title: letter.title,
        description: letter.metaDescription,
        alternates: { canonical: '/letter' },
        robots: { index: false, follow: false },
    }
}

export default async function AppLetterPage() {
    const letter = getOpenLetter(await getServerLocale())

    // Same arrangement as the other `/app/*` documents: `flex-1` rather than a viewport
    // min-height (the shell already reserves the safe-area insets), and the letter keeps
    // its own `h1` because the native header is outside the document.
    return (
        <main className="flex flex-1 flex-col bg-(--background-surface) pt-4">
            <OpenLetterView letter={letter} />
        </main>
    )
}
