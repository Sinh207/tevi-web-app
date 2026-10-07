import { LEGAL_CONTAINER, LegalPageView, PRIVACY_POLICY } from '@features/legal'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { getServerT } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/privacy` — the public, indexable privacy policy.
 *
 * A sub-page, so it lives in `(main)` and not in `(tabs)`: the global mobile top bar is
 * not rendered above it, and it wears its own back bar instead — which is what the legacy
 * page did too (sticky bar, `IconBtnBack`, centred title). The rail and the tab bar are
 * still there, so the rest of the app stays one tap away.
 *
 * The legacy page was `ssr: false` behind a dynamic import, so crawlers got an empty
 * document; this one is fully server rendered. `/app/privacy` serves the same body to the
 * mobile app's webview and points its canonical here.
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    return {
        title: t('menu_privacy_policy'),
        description: t('privacy_meta_description'),
        alternates: { canonical: '/privacy' },
        robots: { index: true, follow: true },
        openGraph: {
            type: 'website',
            url: '/privacy',
            title: t('menu_privacy_policy'),
            description: t('privacy_meta_description'),
        },
    }
}

export default async function PrivacyPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-8 md:pb-16">
            {/*
             * The DS bar carries no background of its own, so a sticky host supplies one —
             * the same arrangement `(tabs)/layout.tsx` uses for the global bar. The
             * background is full-bleed and the hairline underneath it runs the full width
             * with it (from md, where the bar is page furniture rather than native chrome),
             * while the bar's *contents* take `LEGAL_CONTAINER` so the back button sits on
             * the same line as the contents rail below it.
             *
             * `titleClassName` drops the bar's own title from md up, where the document's
             * masthead carries it at full size: on a phone the compact bar title *is* the
             * heading, on a desktop it would be the same words twice, 40px apart — and the
             * breadcrumb takes over the job of filling the bar.
             */}
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('menu_privacy_policy')}
                    titleClassName="md:hidden"
                    className={LEGAL_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_privacy_policy') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height: the sticky chip row and the rail both offset from it. */}
            <LegalPageView
                document={PRIVACY_POLICY}
                titleKey="menu_privacy_policy"
                lastUpdatedKey="privacy_last_updated"
                heading="from-md"
                stickyOffset={60}
            />
        </main>
    )
}
