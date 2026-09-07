'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { PREMIUM_SHEEN } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import type { PremiumPackage } from '../api/types'
import { usePremiumPrice } from '../hooks/use-premium-price'
import { PREMIUM_SURFACE_RADIUS } from '../lib/container'
import { monthlyEquivalent, PLAN_COPY, type PremiumPlan, yearAtMonthlyPrice } from '../lib/plans'
import { PREMIUM_GOLD } from '../lib/premium-surface'

/**
 * One plan, as a card. Two shapes: the ordinary one, and the recommended one.
 *
 * ## Why the recommended card is a branch and not a `variant` prop
 *
 * They are not the same card in two colours. The annual card carries a crown strip, a gold frame, a
 * struck-through comparison price, a *derived* headline figure (the year divided by twelve) and a
 * discount line — five elements the other two do not have, on a violet ground instead of a white
 * one. A `variant` covering that would be a component with two disjoint halves and a boolean
 * deciding which half is real, which is the shape `docs/DEFINITION_OF_DONE.md` warns about. Legacy
 * has them as three separate files; this has two, because weekly and monthly genuinely are one card.
 *
 * ## The figures, and which of them is a claim
 *
 * `price` is the payload's. The annual card's headline is `price / 12` and its strike-through is the
 * monthly plan × 12 — both computed here from two packages, which is why they live in `lib/plans.ts`
 * behind tests rather than inline. The discount line is only drawn when there **is** a discount:
 * `savings` arriving as `null` is the answer to "the annual plan is not actually cheaper", and
 * legacy prints `-0% off billed annually` in that case.
 *
 * ## `data-option-key`, never the plan in the id
 *
 * Three cards share `premium-plan` (and their buttons `premium-plan-submit`), told apart by
 * `data-option-key` and `data-package-id`. Identity goes in a companion attribute, per
 * `docs/TEST_IDS.md` — and here it also means a fourth cadence would not need a fourth id.
 */
export function PremiumPlanCard({
    plan,
    pkg,
    onSubscribe,
    disabled,
}: {
    plan: PremiumPlan
    pkg: PremiumPackage
    onSubscribe: (pkg: PremiumPackage) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const price = usePremiumPrice()
    const copy = PLAN_COPY[plan]

    return (
        <article
            data-testid="premium-plan"
            data-option-key={plan}
            data-package-id={pkg.id}
            className={cn(
                'flex flex-col justify-between gap-3 bg-(--background-surface) p-3',
                PREMIUM_SURFACE_RADIUS,
                /*
                 * `md:mt-4` on the two flanking cards, which is legacy's 16px: the annual card sits
                 * proud of them so the recommendation is visible before anything is read. Below `md`
                 * the three stack and nothing is offset.
                 */
                'md:mt-4',
            )}
        >
            <header className="flex flex-col">
                <span className="type-caption-label text-(--text-subtitle)">{t(copy.tier)}</span>
                <h3 className="type-subheading-strong text-(--text-title)">{t(copy.name)}</h3>
            </header>

            {/* `items-baseline`: the unit sits on the price's baseline, not centred against it. */}
            <p className="flex items-baseline gap-1">
                <span className="type-title-t1-bold text-(--text-title)">
                    {price(pkg.price, pkg.currency)}
                </span>
                <span className="type-dense-strong text-(--text-body)">{t(copy.unit)}</span>
            </p>

            <Button
                data-testid={subTestId('premium-plan', 'submit')}
                data-option-key={plan}
                variant="accent"
                size="medium"
                fullWidth
                disabled={disabled}
                onClick={() => onSubscribe(pkg)}
                /*
                 * `h-auto` + its own vertical padding, because the label is **two lines** from `md`
                 * and the DS `medium` is a fixed 36px built for one. Legacy does the same thing with
                 * `height: 'fit-content !important'`. The horizontal padding is dropped to `px-2`
                 * for the same reason the stack exists: a 190px card cannot spare 16 either side.
                 */
                className="h-auto px-2 py-2"
            >
                {/*
                 * **One line on a phone, two from `md`** — legacy's own responsive stack
                 * (`direction={{ xs: 'row', md: 'column' }}`), and the direction matters rather than
                 * being a preference: from `md` the three cards share a 612 column, so each button
                 * is ~190px and "Subscribe for $89.99/year" does not fit on one line. It was written
                 * the other way round first and the label overflowed its own card, which is the
                 * whole reason the wrapper is a flex box at all.
                 *
                 * The label says the price as well as the verb, so the button is a complete
                 * sentence when it is the only thing a screen reader reaches.
                 */}
                <span className="flex flex-row items-center gap-1 md:flex-col md:gap-0">
                    <span>{t('premium_subscribe_for')}</span>
                    <span>{t(copy.price, { price: price(pkg.price, pkg.currency) })}</span>
                </span>
            </Button>
        </article>
    )
}

/**
 * The recommended plan — annual, crowned, on the brand violet inside a gold frame.
 *
 * `savings` and `monthlyPkg` are both optional because both are *comparisons*: without a monthly
 * package there is no strike-through and no percentage, and the card then reads as the annual price
 * and nothing else. That is the honest degradation — the alternative is a discount claimed against a
 * price the catalogue did not offer.
 */
export function PremiumAnnualCard({
    pkg,
    monthlyPkg,
    savings,
    onSubscribe,
    disabled,
}: {
    pkg: PremiumPackage
    monthlyPkg: PremiumPackage | null
    savings: number | null
    onSubscribe: (pkg: PremiumPackage) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const price = usePremiumPrice()
    const copy = PLAN_COPY.annual

    return (
        /*
         * The gold is a **wrapper whose padding is the border**, exactly as legacy draws it — a
         * gradient cannot be a `border-color`. `p-0.5` is that border: 2px, legacy's own, where a
         * 1px frame reads as a hairline rather than as the mount the product draws.
         *
         * ⚠ **`rounded-[18px]` = the inner `--radius-xl` (16) plus the 2px ring**, and it is a
         * literal because there is no 18 on the DS scale. A ring of even width needs
         * `outer = inner + ring` or it widens at the corners — which is exactly what `rounded-2xl`
         * (24 in this theme, not the 16 it is called) did here. Same construction, and the same
         * note, as the drawer's premium profile card.
         */
        <article
            data-testid="premium-plan"
            data-option-key="annual"
            data-package-id={pkg.id}
            /*
             * `relative overflow-clip` is the sheen's, not the card's: the glare is an absolutely
             * positioned last child, so this is what it measures itself against and what stops it
             * showing outside the gold frame's rounded corners. **`overflow-clip` and not
             * `overflow-hidden`** — hidden makes the box a scroll container, which is how a rounded
             * panel elsewhere in this app silently broke a `sticky` child; clip has no such side
             * effect and this card has nothing to scroll.
             */
            className={cn(
                'relative flex flex-col overflow-clip rounded-[18px] p-0.5',
                PREMIUM_GOLD,
            )}
        >
            <p className="type-subheading-strong p-1 text-center text-(--primary-500)">
                {t('premium_best_value')}
            </p>

            <div
                className={cn(
                    'flex flex-1 flex-col justify-between gap-3 bg-(--primary-500) p-3',
                    PREMIUM_SURFACE_RADIUS,
                )}
            >
                <header className="flex flex-col">
                    {/*
                     * `text-white`, not `--text-on-primary`: the card's ground is `--primary-500`,
                     * which is `#501bc0` in **both** themes (one of the two rungs of the ramp that
                     * does not invert), while the token flips — so it would be near-black ink on
                     * violet in Dark. The trap `tinted-ground-needs-own-ink` describes.
                     */}
                    <span className="type-caption-label text-white/80">{t(copy.tier)}</span>
                    <h3 className="type-subheading-strong text-white">{t(copy.name)}</h3>
                </header>

                <div className="flex flex-col">
                    {monthlyPkg && (
                        <p className="flex flex-wrap items-baseline gap-1">
                            {/*
                             * A year at the monthly price, struck through — the comparison the
                             * discount is against. `<s>` because it is a price that no longer
                             * applies, which is what the element *means*, and it is announced as
                             * such.
                             *
                             * ⚠ **`line-through` is not decoration here, it is the content.** The
                             * reset in `globals.css` clears `text-decoration` on `<s>` (measured:
                             * `text-decoration-line: none`), so relying on the element's default —
                             * which this did — renders "$119.88 $89.99/year" as one unreadable
                             * string with no sign that the first figure is the old one. The class is
                             * what draws it; the element is what says it.
                             */}
                            <s className="type-caption-meta text-white/70 line-through">
                                {price(yearAtMonthlyPrice(monthlyPkg), monthlyPkg.currency)}
                            </s>
                            <span className="type-caption-meta text-white/70">
                                {t(copy.price, { price: price(pkg.price, pkg.currency) })}
                            </span>
                        </p>
                    )}
                    <p className="flex items-baseline gap-1">
                        <span className="type-title-t1-bold text-white">
                            {price(monthlyEquivalent(pkg), pkg.currency)}
                        </span>
                        <span className="type-dense-strong text-white">
                            {t(PLAN_COPY.monthly.unit)}
                        </span>
                    </p>
                    {savings !== null && (
                        <p className="type-caption-label text-white">
                            {t('premium_savings', { percent: `${savings}%` })}
                        </p>
                    )}
                </div>

                <Button
                    data-testid={subTestId('premium-plan', 'submit')}
                    data-option-key="annual"
                    /*
                     * `ghost`, and every colour overridden — the one button in the app that is
                     * neither a DS variant nor derivable from one, because the DS has no gold ramp.
                     * `ghost` specifically, and not the default `primary`: `PREMIUM_GOLD` is a
                     * `background-image` while a variant's fill is a `background-color`, so
                     * `twMerge` keeps **both** — and a primary variant would then animate a
                     * near-black colour behind the gradient on hover, invisible until the gradient
                     * fails to paint. Ghost's fill is transparent, so there is nothing underneath.
                     * The geometry stays the DS's `medium`.
                     */
                    variant="ghost"
                    size="medium"
                    fullWidth
                    disabled={disabled}
                    onClick={() => onSubscribe(pkg)}
                    className={cn(
                        PREMIUM_GOLD,
                        // `h-auto` for the two-line label, as on the other card.
                        'h-auto px-2 py-2',
                        'text-(--primary-500) hover:not-disabled:bg-(--button-ghost-bg) hover:not-disabled:opacity-90',
                    )}
                >
                    {/* One line on a phone, two from `md`. See the other card for why. */}
                    <span className="flex flex-row items-center gap-1 md:flex-col md:gap-0">
                        <span>{t('premium_subscribe_for')}</span>
                        <span>{t(copy.price, { price: price(pkg.price, pkg.currency) })}</span>
                    </span>
                </Button>
            </div>

            {/*
             * The glare, and it is **last in the DOM on purpose**.
             *
             * It is the only positioned child, and the two boxes it has to cross — the gold frame
             * and the violet panel — are both static, so painting order alone puts it over the whole
             * card with no `z-index` anywhere. Ordering it earlier would leave it under the panel,
             * where the sweep would only be visible on the 2px frame.
             *
             * `inset-0` is what makes it work in Arabic as well as English, and the keyframe's note
             * is where that is explained: the streak is a `via` stop inside a full-card gradient
             * rather than a short box parked at `start-0`, because `start` flips with the direction
             * while a positive `translate` does not.
             *
             * White at 40% over `--primary-500` is a highlight rather than a wash — measured against
             * the two prices it crosses, which stay legible through the pass. It is also `aria-hidden`
             * and `pointer-events-none`: it says nothing and it lies over the Subscribe button.
             *
             * `opacity-0` is the base state, so reduced motion (inside `PREMIUM_SHEEN`) leaves no
             * white band lying diagonally across the card.
             */}
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-0 opacity-0',
                    'bg-[linear-gradient(100deg,transparent_38%,rgba(255,255,255,0.4)_50%,transparent_62%)]',
                    PREMIUM_SHEEN,
                )}
            />
        </article>
    )
}
