import { getServerT } from '@shared/i18n/server'
import type { TFunction } from 'i18next'
import { BRAND_COLORS, BRAND_PAIRINGS, type BrandColor } from '../content/brand-assets'
import { BrandPanel, BrandSection, BrandSectionText, BrandSectionTitle } from './brand-panel'
import { CopyHexButton } from './copy-hex-button'

/**
 * The Color tab: the core palette, then the marketing pairings.
 *
 * **Rows, not a table.** Legacy drew a 3-column grid with a `Name · HEX · Mood` header, at
 * a page width of 600px — so on a phone the mood column was two words wide and the header
 * was most of the row. A row that carries the swatch, the name, the mood underneath it and
 * the hex on the end needs no header to be read, works at every width without a breakpoint,
 * and is a list, which is what a palette is. Nothing is lost: all three values are on screen.
 *
 * The swatch takes its colour from a literal hex — the one place in the app where that is
 * correct, and the reason is in `content/brand-assets.ts`.
 */
export async function ColorSection() {
    const t = await getServerT()

    return (
        <BrandPanel>
            <BrandSection>
                <BrandSectionTitle>{t('brand_assets_color_heading')}</BrandSectionTitle>
                <BrandSectionText>{t('brand_assets_color_desc')}</BrandSectionText>
                <ColorList colors={BRAND_COLORS} t={t} />
            </BrandSection>

            <BrandSection>
                <BrandSectionTitle as="h3">{t('brand_assets_pairings_heading')}</BrandSectionTitle>
                <BrandSectionText>{t('brand_assets_pairings_desc')}</BrandSectionText>
                <ColorList colors={BRAND_PAIRINGS} t={t} />
            </BrandSection>
        </BrandPanel>
    )
}

function ColorList({ colors, t }: { colors: BrandColor[]; t: TFunction }) {
    return (
        <ul className="m-0 flex list-none flex-col gap-0 p-0">
            {colors.map((color, index) => (
                <li
                    key={color.id}
                    className={index > 0 ? 'border-t border-(--separator-default) pt-3' : undefined}
                >
                    <div className="flex items-center gap-3 pb-3">
                        {/*
                         * `aria-hidden`: the swatch is the hex made visible, and the hex is
                         * announced by the button beside it. Its own hairline is what keeps
                         * Lavender Mist (#FAF8FF) from disappearing into a white card.
                         */}
                        <span
                            aria-hidden
                            style={{ backgroundColor: color.hex }}
                            className="size-10 flex-none rounded-(--radius-md) shadow-[inset_0_0_0_1px_var(--separator-strong)]"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                            <span className="type-dense-strong truncate text-(--text-title)">
                                {t(color.nameKey)}
                            </span>
                            <span className="type-caption-meta text-(--text-subtitle)">
                                {t(color.moodKey)}
                            </span>
                        </div>
                        <CopyHexButton hex={color.hex} />
                    </div>
                </li>
            ))}
        </ul>
    )
}
