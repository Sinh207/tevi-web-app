import { LEGAL_CONTAINER, LegalPageView, MODERATION_POLICY } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { siteOpenGraph } from '@shared/config/seo'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/moderation` — the public moderation policy: the tools a creator has (chat filters,
 * blocks, chat bans) and what happens to a report once it is filed. Built exactly like
 * `/safety` and `/community-guidelines`: see `(main)/privacy/page.tsx` for why the sticky
 * bar is arranged like this.
 *
 * Legacy contradicted itself on indexing — the page sent `noindex, nofollow` while
 * `sitemap-static.xml` listed it at the same priority as `/safety`, so it advertised a URL
 * crawlers were then told to drop. It is indexed here, with the other four public policy
 * documents: it is the page report flows and suspension notices explain themselves with,
 * and people look for it by name.
 *
 * The legacy page was `ssr: false` behind a dynamic import, so crawlers got an empty
 * document and its table of contents did not exist until hydration. `/app/moderation`
 * serves the same body to the mobile app's webview and points its canonical here.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('menu_moderation'),
        description: t('moderation_meta_description'),
        alternates: { canonical: '/moderation' },
        robots: { index: true, follow: true },
        openGraph: siteOpenGraph({
            url: '/moderation',
            title: t('menu_moderation'),
            description: t('moderation_meta_description'),
        }),
    }
}

export default async function ModerationPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-8 md:pb-16">
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('menu_moderation')}
                    titleClassName="md:hidden"
                    className={LEGAL_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_moderation') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height: the sticky chip row and the rail both offset from it. */}
            <LegalPageView
                document={MODERATION_POLICY}
                titleKey="menu_moderation"
                lastUpdatedKey="moderation_last_updated"
                heading="from-md"
                stickyOffset={60}
            />
        </main>
    )
}
