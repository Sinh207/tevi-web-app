import { COMMUNITY_GUIDELINES, LEGAL_CONTAINER, LegalPageView } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/community-guidelines` — the public, indexable community guidelines. Built exactly like
 * `/privacy`, `/terms` and `/safety`: see `(main)/privacy/page.tsx` for why the sticky bar
 * is arranged like this.
 *
 * This is the document the rest of the product points at — report flows, the post
 * composer's confirmation, suspension notices — so the URL is the legacy one and the page
 * is fully server rendered. Legacy's was `ssr: false` behind a dynamic import, which left
 * crawlers with an empty document and its table of contents unbuilt until hydration.
 * `/app/community-guidelines` serves the same body to the mobile app's webview and points
 * its canonical here.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('menu_community_guidelines'),
        description: t('guidelines_meta_description'),
        alternates: { canonical: '/community-guidelines' },
        robots: { index: true, follow: true },
        openGraph: {
            type: 'website',
            url: '/community-guidelines',
            title: t('menu_community_guidelines'),
            description: t('guidelines_meta_description'),
        },
    }
}

export default async function CommunityGuidelinesPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-16">
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('menu_community_guidelines')}
                    titleClassName="md:hidden"
                    className={LEGAL_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_community_guidelines') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height: the sticky chip row and the rail both offset from it. */}
            <LegalPageView
                document={COMMUNITY_GUIDELINES}
                titleKey="menu_community_guidelines"
                lastUpdatedKey="guidelines_last_updated"
                heading="from-md"
                stickyOffset={60}
            />
        </main>
    )
}
