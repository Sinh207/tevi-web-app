import { getServerT } from '@shared/i18n/server'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import type { TFunction } from 'i18next'
import Image from 'next/image'
import {
    type BrandButtonAsset,
    BUTTON_ASSETS,
    BUTTON_PACK,
    buttonAssetUrl,
} from '../content/brand-assets'
import {
    BrandDownloadLink,
    BrandPanel,
    BrandSection,
    BrandSectionText,
    BrandSectionTitle,
} from './brand-panel'

/**
 * The Button tab: the "Support me on Tevi" images a creator puts on their own site.
 *
 * Two departures from legacy, both in the same direction — showing the thing you download:
 *
 * 1. **The previews are the pack's own files.** Legacy redrew nine approximations in the
 *    DOM (no app mark, plain-text wordmark, its own radius and padding), so its "Preview"
 *    showed something that did not exist in `buttons_support.zip`. These are the PNGs from
 *    inside the archive, served under the names they carry there.
 * 2. **Each preview is its own download.** A creator wants one button, not nine; the whole
 *    pack is still one press away above. Same `<a download>` mechanics as the archive — no
 *    JavaScript involved.
 *
 * Buttons and badges are two grids because they are two aspect ratios (4:1 and 3:2), and
 * one grid holding both leaves either the pills squeezed or the badges enormous.
 */
export async function ButtonSection() {
    const t = await getServerT()
    const buttons = BUTTON_ASSETS.filter(asset => asset.shape === 'button')
    const badges = BUTTON_ASSETS.filter(asset => asset.shape === 'badge')

    return (
        <BrandPanel>
            <BrandSection>
                <BrandSectionTitle>{t('brand_assets_button_pack')}</BrandSectionTitle>
                <BrandSectionText>{t('brand_assets_button_pack_desc')}</BrandSectionText>
                <BrandDownloadLink
                    download={BUTTON_PACK}
                    label={t('brand_assets_download_button_pack')}
                    meta={t('brand_assets_download_size', { size: BUTTON_PACK.sizeKb })}
                    className="mt-1"
                />
            </BrandSection>

            <BrandSection>
                <BrandSectionTitle as="h3">
                    {t('brand_assets_buttons_group_button')}
                </BrandSectionTitle>
                <BrandSectionText>{t('brand_assets_button_download_hint')}</BrandSectionText>
                <AssetGrid
                    assets={buttons}
                    t={t}
                    className="sm:grid-cols-2"
                    sizes="(min-width: 900px) 400px, (min-width: 612px) 50vw, 100vw"
                />
            </BrandSection>

            <BrandSection>
                <BrandSectionTitle as="h3">
                    {t('brand_assets_buttons_group_badge')}
                </BrandSectionTitle>
                <AssetGrid
                    assets={badges}
                    t={t}
                    className="grid-cols-2 sm:grid-cols-3"
                    sizes="(min-width: 900px) 260px, (min-width: 612px) 33vw, 50vw"
                />
            </BrandSection>
        </BrandPanel>
    )
}

/**
 * One asset per cell: the image on a pinned white tile (see `logo-section.tsx` for why
 * white), its name, and the file it saves.
 *
 * The whole cell is the link, so the target is the artwork rather than a 14px caption, and
 * the accessible name comes from the image's `alt` plus the visible caption — the file name
 * is in `title` for anyone who wants to know what lands in their downloads folder without
 * reading it twice out loud.
 *
 * Not a `<figure>`: a `figcaption` has to be a direct child of the figure, and here the
 * caption is *inside* the link, which is what makes the whole cell pressable. A list of
 * downloads is a list, so the `<li>` carries the structure and the caption is a span.
 */
function AssetGrid({
    assets,
    t,
    className,
    sizes,
}: {
    assets: BrandButtonAsset[]
    t: TFunction
    className?: string
    sizes: string
}) {
    return (
        <ul className={cn('m-0 grid list-none grid-cols-1 gap-4 p-0', className)}>
            {assets.map(asset => {
                const name = t(asset.labelKey)
                return (
                    <li key={asset.id}>
                        <a
                            data-testid="brand-assets-download-button"
                            data-row-key={asset.id}
                            href={buttonAssetUrl(asset)}
                            download={asset.file}
                            title={asset.file}
                            className="group flex flex-col gap-2 rounded-(--radius-xl) no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                        >
                            <span className="block overflow-hidden rounded-(--radius-xl) bg-(--white) p-3 shadow-[inset_0_0_0_1px_var(--separator-default)] transition-shadow group-hover:shadow-[inset_0_0_0_1px_var(--separator-strong)]">
                                <Image
                                    src={buttonAssetUrl(asset)}
                                    alt={t('brand_assets_button_alt', { name })}
                                    width={asset.width}
                                    height={asset.height}
                                    sizes={sizes}
                                    className="h-auto w-full"
                                />
                            </span>
                            <span className="type-caption-label flex items-center justify-between gap-2 text-(--text-subtitle)">
                                <span className="min-w-0 truncate">{name}</span>
                                <span className="flex flex-none items-center gap-1 text-(--text-link)">
                                    <Icon name="download-arrow-down" size={16} aria-hidden />
                                    PNG
                                </span>
                            </span>
                        </a>
                    </li>
                )
            })}
        </ul>
    )
}
