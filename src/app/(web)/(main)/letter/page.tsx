import { getOpenLetter, LETTER_CONTAINER, OpenLetterView } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { siteOpenGraph } from '@shared/config/seo'
import { getServerLocale, getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/letter` — the open letter to the Tevi community.
 *
 * A signed message from the team rather than a policy, and it sits with the policies for
 * one reason: it is a dated public statement people are pointed at from outside, so it
 * needs the same things they do — a stable URL, a server-rendered body, a real `<title>`
 * and a webview twin. It is the legacy URL: `/letter` is what the announcement, the app
 * and anyone who linked it already hold.
 *
 * Three differences from a policy page, all of them because a letter is not a document to
 * be cited:
 *
 * - **The copy is picked, not translated.** `getOpenLetter` returns the English, Vietnamese
 *   or Indonesian letter for the request's locale and English for the other six — see
 *   `content/open-letter.ts`. `getServerLocale` is what makes that possible in
 *   `generateMetadata` too, so the `<title>` is in the same language as the body.
 * - **No contents rail and no anchors** (`OpenLetterView`, not `LegalPageView`): nobody
 *   cites paragraph 4 of a letter, and a table of contents over eleven paragraphs is noise.
 * - **The bar carries the short title** ("Open letter"), while the masthead carries the
 *   letter's own name — the same split the Premium documents use, for the same reason: the
 *   compact bar reserves ~160px for the back button.
 *
 * The legacy page was `ssr: false` behind a dynamic import, so a crawler and a link
 * preview both got an empty document for a letter whose whole purpose is to be read by
 * people who were sent it. This one renders on the server.
 */
export async function generateMetadata(): Promise<Metadata> {
    const letter = getOpenLetter(await getServerLocale())
    return {
        title: letter.title,
        description: letter.metaDescription,
        alternates: { canonical: '/letter' },
        robots: { index: true, follow: true },
        openGraph: siteOpenGraph({
            type: 'article',
            url: '/letter',
            title: letter.title,
            description: letter.metaDescription,
            // A letter is dated, and `article` is the one OG type that carries it.
            publishedTime: letter.publishedAt,
        }),
    }
}

export default async function LetterPage() {
    const [t, locale] = await Promise.all([getServerT(), getServerLocale()])
    const letter = getOpenLetter(locale)

    return (
        <main className="flex flex-1 flex-col pb-8 md:pb-16">
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={letter.barTitle}
                    titleClassName="md:hidden"
                    className={LETTER_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: letter.barTitle },
                            ]}
                        />
                    }
                />
            </div>
            <OpenLetterView letter={letter} heading="from-md" />
        </main>
    )
}
