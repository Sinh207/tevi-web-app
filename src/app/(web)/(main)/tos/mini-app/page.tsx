import { LEGAL_CONTAINER, LegalPageView, TERMS_MINI_APP } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { siteOpenGraph } from '@shared/config/seo'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/tos/mini-app` — the terms of service for the Tevi Mini App Feature.
 *
 * The user↔Tevi half of the mini app agreement, where `/privacy/mini-app` is the
 * user↔developer half. Its own document rather than a clause of `/terms`, exactly as both
 * legacy sites served it: its subject is that Tevi neither operates the apps nor processes
 * their payments, and a reader inside a third party's screen is sent here to read that.
 *
 * **`/tos`, not `/terms`.** Both legacy sites put this document under `/tos/miniapp` and
 * shipped app builds hold that path, so the namespace is kept and only the slug is
 * hyphenated. `/terms` stays the site's own terms of use, which this one links back to —
 * the back bar and the breadcrumb both point there, since it is the useful parent page.
 *
 * Built like its siblings — see `(main)/terms/page.tsx` for why the sticky bar is arranged
 * the way it is. No "last updated" line: the document states no effective date on any site
 * that serves it (see `content/terms-mini-app.ts`).
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('terms_miniapp_title'),
        description: t('terms_miniapp_meta_description'),
        alternates: { canonical: '/tos/mini-app' },
        robots: { index: true, follow: true },
        openGraph: siteOpenGraph({
            url: '/tos/mini-app',
            title: t('terms_miniapp_title'),
            description: t('terms_miniapp_meta_description'),
        }),
    }
}

export default async function TermsMiniAppPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-8 md:pb-16">
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('terms_miniapp_short_title')}
                    home="/terms"
                    titleClassName="md:hidden"
                    className={LEGAL_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_terms_of_use'), href: '/terms' },
                                { label: t('terms_miniapp_short_title') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height: the sticky chip row and the rail both offset from it. */}
            <LegalPageView
                document={TERMS_MINI_APP}
                titleKey="terms_miniapp_title"
                heading="from-md"
                stickyOffset={60}
            />
        </main>
    )
}
