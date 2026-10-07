import { LEGAL_CONTAINER, LegalPageView, PRIVACY_POLICY_MINI_APP } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/privacy/mini-app` — the standard privacy policy every mini app inherits.
 *
 * Its own document rather than a clause of `/privacy`, and for a stronger reason than the
 * Premium pair: this one governs the relationship between a third-party *developer* and
 * the user, and Tevi's own policy explicitly neither supersedes it nor is superseded by it.
 * Developers are pointed at this URL as the policy their app ships with until they publish
 * one of their own, so it is a page people link to on purpose.
 *
 * Built like its siblings — see `(main)/privacy/page.tsx` for why the sticky bar is
 * arranged the way it is. Two differences from `/privacy/tevi-premium`:
 *
 * - **No "last updated" line.** The document states no effective date on any site that
 *   serves it (see `content/privacy-mini-app.ts`), so no `lastUpdatedKey` is passed and
 *   `LegalPageView` drops the line rather than printing a month nobody agreed to.
 * - Legacy served this at `/privacy/miniapp` on the webview host; `proxy.ts` redirects
 *   that spelling here, so old links and app builds keep working.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('privacy_miniapp_title'),
        description: t('privacy_miniapp_meta_description'),
        alternates: { canonical: '/privacy/mini-app' },
        robots: { index: true, follow: true },
        openGraph: {
            type: 'website',
            url: '/privacy/mini-app',
            title: t('privacy_miniapp_title'),
            description: t('privacy_miniapp_meta_description'),
        },
    }
}

export default async function PrivacyMiniAppPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-8 md:pb-16">
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('privacy_miniapp_short_title')}
                    home="/privacy"
                    titleClassName="md:hidden"
                    className={LEGAL_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_privacy_policy'), href: '/privacy' },
                                { label: t('privacy_miniapp_short_title') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height: the sticky chip row and the rail both offset from it. */}
            <LegalPageView
                document={PRIVACY_POLICY_MINI_APP}
                titleKey="privacy_miniapp_title"
                heading="from-md"
                stickyOffset={60}
            />
        </main>
    )
}
