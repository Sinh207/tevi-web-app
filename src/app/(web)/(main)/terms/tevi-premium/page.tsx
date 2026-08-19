import { LEGAL_CONTAINER, LegalPageView, TERMS_PREMIUM } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/terms/tevi-premium` — the subscription terms for Tevi Premium.
 *
 * Its own document rather than a clause of `/terms`, exactly as legacy served it, and on
 * the legacy URL: app stores and the in-app purchase flow link straight here, so the path
 * is part of the contract. Built like its two siblings — see `(main)/privacy/page.tsx` for
 * why the sticky bar is arranged the way it is.
 *
 * The breadcrumb has one more step than theirs (Home › Terms of Use › Tevi Premium), and
 * "back" falls through to `/terms` rather than `/` when this URL was opened cold: an app
 * store review lands here directly, and the parent terms are the useful next page.
 *
 * The bar and the breadcrumb say "Tevi Premium" where the masthead says the document's
 * full name — the compact bar reserves ~160px for the back button, so the full title would
 * arrive already truncated, and inside `/terms` the short form is unambiguous anyway.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('terms_premium_title'),
        description: t('terms_premium_meta_description'),
        alternates: { canonical: '/terms/tevi-premium' },
        robots: { index: true, follow: true },
        openGraph: {
            type: 'website',
            url: '/terms/tevi-premium',
            title: t('terms_premium_title'),
            description: t('terms_premium_meta_description'),
        },
    }
}

export default async function TermsPremiumPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-16">
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('terms_premium_short_title')}
                    home="/terms"
                    titleClassName="md:hidden"
                    className={LEGAL_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_terms_of_use'), href: '/terms' },
                                { label: t('terms_premium_short_title') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height: the sticky chip row and the rail both offset from it. */}
            <LegalPageView
                document={TERMS_PREMIUM}
                titleKey="terms_premium_title"
                lastUpdatedKey="terms_premium_last_updated"
                heading="from-md"
                stickyOffset={60}
            />
        </main>
    )
}
