import { LEGAL_CONTAINER, LegalPageView, SAFETY_POLICY } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { siteOpenGraph } from '@shared/config/seo'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/safety` — the public, indexable safety policy. Built exactly like `/privacy` and
 * `/terms`: see `(main)/privacy/page.tsx` for why the sticky bar is arranged like this.
 *
 * The legacy page was `ssr: false` behind a dynamic import, so crawlers got an empty
 * document; this one is fully server rendered. `/app/safety` serves the same body to the
 * mobile app's webview and points its canonical here.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('menu_safety'),
        description: t('safety_meta_description'),
        alternates: { canonical: '/safety' },
        robots: { index: true, follow: true },
        openGraph: siteOpenGraph({
            url: '/safety',
            title: t('menu_safety'),
            description: t('safety_meta_description'),
        }),
    }
}

export default async function SafetyPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-8 md:pb-16">
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('menu_safety')}
                    titleClassName="md:hidden"
                    className={LEGAL_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_safety') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height: the sticky chip row and the rail both offset from it. */}
            <LegalPageView
                document={SAFETY_POLICY}
                titleKey="menu_safety"
                lastUpdatedKey="safety_last_updated"
                heading="from-md"
                stickyOffset={60}
            />
        </main>
    )
}
