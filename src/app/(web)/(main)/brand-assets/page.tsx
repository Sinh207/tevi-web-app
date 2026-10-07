import { BRAND_CONTAINER, BrandAssetsView } from '@features/brand-assets'
import { PageBackBar, PageBreadcrumb } from '@features/navigation'
import { localizedPath, siteAlternates, siteOpenGraph } from '@shared/config/seo'
import { getServerT, getUrlLocale } from '@shared/i18n/server'
import type { Metadata } from 'next'

/**
 * `/brand-assets` — the public, indexable press kit.
 *
 * A sub-page, so it lives in `(main)` and not in `(tabs)`: no global mobile top bar above
 * it, its own back bar instead, exactly like `/privacy` and `/safety` (see
 * `(main)/privacy/page.tsx` for why the sticky bar is arranged the way it is).
 *
 * The legacy page was `ssr: false` behind a dynamic import — so crawlers got an empty
 * document for a page whose whole job is being found by creators looking for the logo —
 * and it hid all three tabs behind a Swiper carousel. This one is server rendered; only
 * the tab switch and the copy-hex buttons are client code.
 *
 * Reachable from the menu drawer's "Other settings" ("Brand assets").
 */
export async function generateMetadata(): Promise<Metadata> {
    const t = await getServerT()
    // The language the URL names decides the canonical, `og:url` and `hreflang` — see `siteAlternates`.
    const urlLocale = await getUrlLocale()
    const alternates = siteAlternates('/brand-assets', urlLocale)
    return {
        title: t('brand_assets_meta_title'),
        description: t('brand_assets_meta_description'),
        alternates,
        robots: { index: true, follow: true },
        openGraph: siteOpenGraph({
            url: localizedPath('/brand-assets', urlLocale),
            title: t('brand_assets_meta_title'),
            description: t('brand_assets_meta_description'),
        }),
    }
}

export default async function BrandAssetsPage() {
    const t = await getServerT()

    return (
        <main className="flex flex-1 flex-col pb-8 md:pb-16">
            {/* The bar is chrome, so it drops out on paper — and because an A4 sheet is
                ~794px, i.e. below md, the masthead has to take the title back there:
                `BrandAssetsView` restores its `h1` in print for exactly this reason. */}
            <div className="sticky top-0 z-20 bg-(--background) md:border-b md:border-(--separator-default) print:hidden">
                <PageBackBar
                    title={t('menu_brand_assets')}
                    titleClassName="md:hidden"
                    className={BRAND_CONTAINER}
                    trailing={
                        <PageBreadcrumb
                            label={t('nav_breadcrumb')}
                            items={[
                                { label: t('nav_home'), href: '/' },
                                { label: t('menu_brand_assets') },
                            ]}
                        />
                    }
                />
            </div>
            {/* 60 is the bar's height — the sticky tab row offsets from it. */}
            <BrandAssetsView heading="from-md" stickyOffset={60} />
        </main>
    )
}
