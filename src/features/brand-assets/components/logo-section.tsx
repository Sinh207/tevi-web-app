import { getServerT } from '@shared/i18n/server'
import Image from 'next/image'
import { LOGO_PACK, LOGO_PACK_CONTENTS, LOGO_PREVIEWS } from '../content/brand-assets'
import {
    BrandDownloadLink,
    BrandPanel,
    BrandSection,
    BrandSectionText,
    BrandSectionTitle,
} from './brand-panel'

/**
 * The Logo tab: what is in the pack, the pack, and the three lockups it draws.
 *
 * A server component — the copy, the previews and the download are all static, so none of
 * this reaches the client bundle.
 *
 * The previews sit on a **pinned white tile** in both themes. That is not a dark-mode
 * oversight: the artwork is authored 634×440 with a white artboard baked in, so in dark
 * mode it is a white rectangle on a dark card no matter what the frame does. Pinning the
 * tile makes the frame agree with the artwork instead of drawing a dark border around a
 * white sheet, and matches the button images, which are drawn for light backgrounds too.
 */
export async function LogoSection() {
    const t = await getServerT()

    return (
        <BrandPanel>
            <BrandSection>
                <BrandSectionTitle>{t('brand_assets_logo_pack_includes')}</BrandSectionTitle>
                <ul className="type-dense-default m-0 flex list-disc flex-col gap-2 ps-6 text-(--text-body) md:type-body-default">
                    {LOGO_PACK_CONTENTS.map(({ leadKey, textKey }) => (
                        <li key={leadKey}>
                            <strong className="font-semibold text-(--text-title)">
                                {t(leadKey)}
                            </strong>{' '}
                            {t(textKey)}
                        </li>
                    ))}
                </ul>
                <BrandDownloadLink
                    download={LOGO_PACK}
                    label={t('brand_assets_download_logo_pack')}
                    meta={t('brand_assets_download_size', { size: LOGO_PACK.sizeKb })}
                    className="mt-1"
                />
            </BrandSection>

            <BrandSection>
                <BrandSectionTitle as="h3">{t('brand_assets_preview')}</BrandSectionTitle>
                <BrandSectionText>{t('brand_assets_logo_preview_note')}</BrandSectionText>
                <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
                    {LOGO_PREVIEWS.map(preview => (
                        <li key={preview.id}>
                            <figure className="m-0 flex flex-col gap-2">
                                <div className="overflow-hidden rounded-(--radius-xl) bg-(--white) shadow-[inset_0_0_0_1px_var(--separator-default)]">
                                    <Image
                                        src={preview.src}
                                        alt={t('brand_assets_logo_alt', {
                                            variant: t(preview.labelKey),
                                        })}
                                        width={preview.width}
                                        height={preview.height}
                                        sizes="(min-width: 900px) 280px, (min-width: 612px) 33vw, 100vw"
                                        className="h-auto w-full"
                                    />
                                </div>
                                <figcaption className="type-caption-label text-center text-(--text-subtitle)">
                                    {t(preview.labelKey)}
                                </figcaption>
                            </figure>
                        </li>
                    ))}
                </ul>
            </BrandSection>
        </BrandPanel>
    )
}
