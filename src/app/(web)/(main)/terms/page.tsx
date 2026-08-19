import { LEGAL_CONTAINER, LegalPageView, TERMS_OF_USE } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/terms` — the public, indexable terms of use. The privacy policy's twin, and built
 * the same way: see `(main)/privacy/page.tsx` for why the bar is arranged like this.
 *
 * The legacy page was `ssr: false` behind a dynamic import, so crawlers got an empty
 * document; this one is fully server rendered. `/app/terms` serves the same body to the
 * mobile app's webview and points its canonical here.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('menu_terms_of_use'),
        description: t('terms_meta_description'),
        alternates: { canonical: '/terms' },
        robots: { index: true, follow: true },
        openGraph: {
            type: 'website',
            url: '/terms',
            title: t('menu_terms_of_use'),
            description: t('terms_meta_description'),
        },
    }
}

export default async function TermsPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-16">
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('menu_terms_of_use')}
                    titleClassName="md:hidden"
                    className={LEGAL_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_terms_of_use') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height: the sticky chip row and the rail both offset from it. */}
            <LegalPageView
                document={TERMS_OF_USE}
                titleKey="menu_terms_of_use"
                lastUpdatedKey="terms_last_updated"
                heading="from-md"
                stickyOffset={60}
            />
        </main>
    )
}
