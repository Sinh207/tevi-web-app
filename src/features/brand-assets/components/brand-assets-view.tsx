import { StickyTabs } from '@shared/components/sticky-tabs'
import { getServerT } from '@shared/i18n/server'
import { cn } from '@shared/lib/utils'
import { BRAND_CONTAINER } from './brand-panel'
import { ButtonSection } from './button-section'
import { ColorSection } from './color-section'
import { LogoSection } from './logo-section'

/**
 * The brand kit as a page — the masthead plus the three tabs, and everything both the
 * public route and any future `/app/*` webview twin would share.
 *
 * A server component: the three sections are rendered here and passed *into* the client
 * tab shell as props, so the only JavaScript this page ships is the tab switch and the
 * copy-hex buttons.
 *
 * `heading` says who owns the `h1`, the same contract the legal pages use: on `/brand-assets`
 * the back bar carries the title on a phone and the masthead takes it from md, so it is
 * `from-md` there. A host with no bar of its own passes `always`.
 *
 * The lead paragraph (`brand_assets_intro`) is **new copy** — legacy opened straight into the
 * tabs. It only describes what is on the page; deliberately no usage rules ("don't stretch
 * the mark", "keep clear space"), because those are Brand's to write, not a port's to infer.
 * If they hand us any, they belong here.
 */
export async function BrandAssetsView({
    className,
    heading = 'always',
    /** Height of the host's sticky bar; the tab row parks under it. */
    stickyOffset = 0,
}: {
    className?: string
    heading?: 'always' | 'from-md'
    stickyOffset?: number
}) {
    const t = await getServerT()

    return (
        <div className={cn(BRAND_CONTAINER, 'flex min-w-0 flex-col', className)}>
            <header className="flex flex-col gap-1 px-4 pb-4 md:gap-3 md:px-0 md:pt-10 md:pb-6">
                <h1
                    className={cn(
                        'type-subheading-strong text-center text-(--text-title) md:type-heading-h1-bold md:text-start',
                        // `print:block` is not redundant with `md:block`: an A4 sheet is
                        // ~794px, i.e. below md, and the bar that carries the title there is
                        // itself `print:hidden` — without this a printed copy has no title.
                        heading === 'from-md' && 'hidden md:block print:block',
                    )}
                >
                    {t('menu_brand_assets')}
                </h1>
                <p className="type-caption-meta text-center text-(--text-subtitle) md:type-body-default md:text-start md:text-(--text-body)">
                    {t('brand_assets_intro')}
                </p>
            </header>

            {/* `px-4 md:px-0` was baked into the old bespoke component; it is the page's own
                gutter, so it is passed in now rather than living in the shared one. */}
            <StickyTabs
                label={t('brand_assets_tabs_label')}
                stickyOffset={stickyOffset}
                barClassName="px-4 md:px-0"
                tabs={[
                    {
                        id: 'logo',
                        label: t('brand_assets_tab_logo'),
                        panel: <LogoSection />,
                    },
                    {
                        id: 'button',
                        label: t('brand_assets_tab_button'),
                        panel: <ButtonSection />,
                    },
                    {
                        id: 'color',
                        label: t('brand_assets_tab_color'),
                        panel: <ColorSection />,
                    },
                ]}
            />
        </div>
    )
}
