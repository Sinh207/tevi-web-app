'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import type { StarPackage } from '../api/types'
import { packageStars, recommendedIndex } from '../lib/star-packages'

/**
 * The packages, two to a row — legacy's `getStar` grid.
 *
 * ```
 *  ┌ ★ 100 ─────────┐ ┌ ★ 500 ─────────┐
 *  │  $0.99         │ │  $4.99         │
 *  └────────────────┘ └────────────────┘
 * ```
 *
 * ## The bonus is part of the offer, so it is part of the tile
 *
 * A package with `bonus_amount` shows `★ 900 +100`, and the **selected** tile's summary line spells out
 * what arrives (`packageStars`). Legacy prints the bonus in blue beside the amount and nowhere else,
 * which leaves the reader to add it up on the confirm screen; the sheet does the arithmetic.
 *
 * ## A radio group, not a row of buttons
 *
 * Pressing a tile changes a **selection**, and that is what the accessibility tree has to say — a grid
 * of buttons announces eight independent actions and gives no way to hear which one is current. The
 * inputs are visually hidden rather than absent, so the whole group is one arrow-key traversal.
 *
 * `--focus-ring` is on the label, since the input it belongs to is the hidden one.
 */
export function StarPackageGrid({
    packages,
    selected,
    onSelect,
    disabled,
    visibleLegend = false,
    priceLabel,
}: {
    packages: StarPackage[]
    selected: StarPackage | null
    onSelect: (pkg: StarPackage) => void
    disabled?: boolean
    /**
     * Print the legend instead of hiding it.
     *
     * The sheet does not: its own title band already says *Get Star* eight pixels above, and the grid
     * is the only thing on that step. `/get-star` does: there the grid is one of two choices on a
     * scrolling page, so the heading is what separates *how much* from *how*. It stays the same
     * `<legend>` either way rather than becoming a sibling `<h2>` — a heading beside a fieldset is not
     * that fieldset's name, and the group would go back to being announced as unlabelled.
     */
    visibleLegend?: boolean
    /**
     * The figure under each tile. Defaults to the package's USD list price, which is what the sheet
     * shows — it picks the amount *before* the method. `/get-star` draws the grid **inside** a
     * gateway's panel, so there the tile carries what that gateway charges for it, fee included —
     * legacy's `renderTotalCostDisplay(price, gateway)`.
     */
    priceLabel?: (pkg: StarPackage) => string
}) {
    const { t, currentLanguage } = useTranslation()
    const recommended = recommendedIndex(packages)

    return (
        /*
         * The grid is an inner `div`, not the fieldset itself. A `<legend>` is rendered outside its
         * fieldset's content box, so `display: grid` on the fieldset leaves the legend out of the
         * grid — which is invisible while it is `sr-only` and misplaces it the moment it is not.
         */
        <fieldset className="m-0 flex flex-col border-0 p-0">
            <legend
                className={
                    visibleLegend ? 'type-dense-strong mb-2 text-(--text-subtitle)' : 'sr-only'
                }
            >
                {t('payment_packages_legend')}
            </legend>
            <div className="grid grid-cols-2 gap-2">
                {packages.map((pkg, index) => {
                    const isSelected = selected?.id === pkg.id
                    const bonus = Math.max(0, pkg.bonus_amount)
                    return (
                        <label
                            key={pkg.id}
                            className={cn(
                                'relative flex cursor-pointer flex-col items-center justify-center gap-1',
                                'rounded-(--radius-lg) p-4 transition-colors',
                                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--focus-ring)',
                                /*
                                 * The chosen tile wears the brand sweep as a 2px ring
                                 * (`gradient-ring` in `globals.css`, which explains why it is two
                                 * backgrounds and not `border-image`). Both states carry a 2px
                                 * edge — the unselected one just paints it flat — so choosing a
                                 * tile never changes its size and the grid does not twitch.
                                 */
                                isSelected
                                    ? 'gradient-ring'
                                    : 'border-2 border-(--separator-default) bg-(--background-surface) hover:bg-(--background-segment)',
                                disabled && 'cursor-not-allowed opacity-60',
                            )}
                        >
                            <input
                                data-testid="payment-star-package"
                                data-package-id={pkg.id}
                                type="radio"
                                name="star-package"
                                className="sr-only"
                                checked={isSelected}
                                disabled={disabled}
                                onChange={() => onSelect(pkg)}
                            />

                            {/* One tile and no more: the row the backoffice tagged, falling back to
                                the first when it tagged none. `recommendedIndex` records the real
                                catalogue this was drawing the badge on the wrong package of. */}
                            {index === recommended && (
                                <span className="type-caption-meta absolute -top-2 start-4 rounded-(--radius-fill) bg-[image:var(--gradient-brand-sweep)] px-2 py-[2px] text-(--white)">
                                    {t('payment_most_popular')}
                                </span>
                            )}

                            <span className="flex items-center gap-1">
                                <StarMark />
                                <span className="type-body-strong text-(--text-title)">
                                    {formatStarAmount(pkg.amount, currentLanguage)}
                                </span>
                                {bonus > 0 && (
                                    <span className="type-caption-meta text-(--text-link)">
                                        +{formatStarAmount(bonus, currentLanguage)}
                                    </span>
                                )}
                            </span>

                            <span className="type-dense-default text-(--text-subtitle)">
                                {priceLabel
                                    ? priceLabel(pkg)
                                    : t('payment_price_usd', { amount: pkg.price.toFixed(2) })}
                            </span>

                            {/* Only on the selected tile: what actually arrives, bonus folded in. Every
                            tile saying it would be four sums on screen for one decision. */}
                            {isSelected && bonus > 0 && (
                                <span className="type-caption-meta text-(--text-success)">
                                    {t('payment_you_receive', {
                                        amount: formatStarAmount(
                                            packageStars(pkg),
                                            currentLanguage,
                                        ),
                                    })}
                                </span>
                            )}
                        </label>
                    )
                })}
            </div>
        </fieldset>
    )
}
