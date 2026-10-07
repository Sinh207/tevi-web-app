import { LEGAL_CONTAINER, LegalPageView, PRIVACY_POLICY_PREMIUM } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { siteOpenGraph } from '@shared/config/seo'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/privacy/tevi-premium` — the privacy policy for Tevi Premium.
 *
 * A document in its own right rather than a clause of `/privacy`, exactly as legacy served
 * it, and on the legacy URL: app stores and the subscription flow link straight here, so
 * the path is part of the contract. Built like its siblings — see `(main)/privacy/page.tsx`
 * for why the sticky bar is arranged the way it is.
 *
 * The breadcrumb has one more step than `/privacy`'s (Home › Privacy & Policy › Tevi
 * Premium), and "back" falls through to `/privacy` rather than `/` when this URL was opened
 * cold: a store listing lands here directly, and the general policy is the useful next page.
 *
 * The bar and the last crumb say "Tevi Premium" where the masthead says the document's full
 * name — the compact bar reserves ~160px for the back button, so "Privacy Policy for Tevi
 * Premium" would arrive already truncated, and under `/privacy` the short form is
 * unambiguous anyway.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('privacy_premium_title'),
        description: t('privacy_premium_meta_description'),
        alternates: { canonical: '/privacy/tevi-premium' },
        robots: { index: true, follow: true },
        openGraph: siteOpenGraph({
            url: '/privacy/tevi-premium',
            title: t('privacy_premium_title'),
            description: t('privacy_premium_meta_description'),
        }),
    }
}

export default async function PrivacyPremiumPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-8 md:pb-16">
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('privacy_premium_short_title')}
                    home="/privacy"
                    titleClassName="md:hidden"
                    className={LEGAL_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_privacy_policy'), href: '/privacy' },
                                { label: t('privacy_premium_short_title') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height: the sticky chip row and the rail both offset from it. */}
            <LegalPageView
                document={PRIVACY_POLICY_PREMIUM}
                titleKey="privacy_premium_title"
                lastUpdatedKey="privacy_premium_last_updated"
                heading="from-md"
                stickyOffset={60}
            />
        </main>
    )
}
