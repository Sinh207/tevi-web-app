'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { PREMIUM_SHEEN } from '@shared/lib/motion'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import type { PremiumPackage } from '../api/types'
import { usePremiumPrice } from '../hooks/use-premium-price'
import { PREMIUM_SURFACE_RADIUS } from '../lib/container'
import { GIFT_PLAN_COPY, type GiftPlan, giftMonthlyEquivalent } from '../lib/gift-plans'
import { PREMIUM_GOLD } from '../lib/premium-surface'

/**
 * One gift package, as a card. Two shapes: the ordinary one, and the recommended one.
 *
 * The sibling of `premium-plan-card.tsx`, and the reason it is a second pair of components rather
 * than a `variant` on that one is the same reason the two `lib` modules are separate: these cards
 * say **"Send gift"**, carry no tier name, compare against a different baseline, and the recommended
 * one here is the *year* of a one-off grant rather than an annual subscription. Sharing the file
 * would mean a `kind` flag deciding which half of every element is real.
 *
 * ## The second line is a **rate**, not a percentage
 *
 * Legacy prints `-35% off billed` and `-10% off billed` here as literals. Both are gone, and the
 * reason is stronger than "not derivable": `-35%` is **`/premium`'s** number ($77.92 against 12 ×
 * $9.99), copy-pasted onto a card that costs $99.99, where the real saving against the monthly
 * subscription is 17%. It overstated the discount by about two-to-one on a screen that charges for
 * somebody else — and 17% is the saving on *all three* tiers anyway, because they are one rate, so no
 * percentage tells the cards apart.
 *
 * So each card prints the total it charges and **the per-month equivalent underneath**: the unit that
 * makes three durations comparable, derived from the figure directly above it, and the convention
 * `/premium`'s own annual card uses. `lib/gift-plans.ts` carries the full finding.
 *
 * ## `data-option-key`, never the plan in the id
 *
 * Three cards share `premium-gift-plan` (and their buttons `premium-gift-plan-submit`), told apart
 * by `data-option-key` and `data-package-id`. Identity goes in a companion attribute, per
 * `docs/TEST_IDS.md` — and it means a fourth duration would not need a fourth id.
 */
export function GiftPlanCard({
    plan,
    pkg,
    onSend,
    disabled,
}: {
    plan: GiftPlan
    pkg: PremiumPackage
    onSend: (pkg: PremiumPackage) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const price = usePremiumPrice()
    const amount = price(pkg.price, pkg.currency)
    const perMonth = price(giftMonthlyEquivalent(pkg), pkg.currency)

    return (
        <article
            data-testid="premium-gift-plan"
            data-option-key={plan}
            data-package-id={pkg.id}
            className={cn(
                'flex flex-col justify-between gap-3 bg-(--background-surface) p-3',
                PREMIUM_SURFACE_RADIUS,
                /*
                 * `md:mt-4` on the two flanking cards, which is legacy's 16px: the recommended card
                 * sits proud of them so the recommendation is visible before anything is read. Below
                 * `md` the three stack and nothing is offset.
                 */
                'md:mt-4',
            )}
        >
            {/*
             * `justify-end` in a reserved 46px box, so **the three plan names sit on one line**
             * whether or not their card carries a discount chip. Legacy pushes the un-chipped card's
             * title down with a hand-typed `marginTop: '12px'`, which is the same correction made
             * from the wrong end: it breaks the moment a chip appears on that card (the catalogue
             * decides that, not the code). 46 is the chip's line box plus the title's.
             */}
            <h3 className="type-subheading-strong text-(--text-title)">
                {t(GIFT_PLAN_COPY[plan].name)}
            </h3>

            {/*
             * The total, then the rate. Two lines rather than a chip: the total is what the card is
             * charged and the rate is what makes the three durations comparable — see the note above
             * on the percentage this replaced.
             */}
            <div className="flex flex-col">
                <p className="type-title-t1-bold text-(--text-title)">{amount}</p>
                <p className="type-caption-meta text-(--text-subtitle)">
                    {t('giftpremium_per_month', { price: perMonth })}
                </p>
            </div>

            <Button
                data-testid={subTestId('premium-gift-plan', 'submit')}
                data-option-key={plan}
                variant="accent"
                size="medium"
                fullWidth
                disabled={disabled}
                onClick={() => onSend(pkg)}
                /*
                 * `h-auto` plus its own padding, because the label is **two lines** from `md` and the
                 * DS `medium` is a fixed 36px built for one. Legacy does the same with
                 * `height: 'fit-content !important'`. The horizontal padding drops to `px-2` for the
                 * reason the stack exists at all: a ~190px card cannot spare 16 either side.
                 */
                className="h-auto px-2 py-2"
            >
                {/*
                 * One line on a phone, two from `md` — legacy's own responsive stack. The direction
                 * is not a preference: from `md` the three cards share a 612 column, so each button
                 * is about 190px and "Send gift ($119.99)" does not fit on one line.
                 *
                 * The label carries the price as well as the verb, so the button is a complete
                 * sentence when it is the only thing a screen reader reaches.
                 */}
                <span className="flex flex-row items-center gap-1 md:flex-col md:gap-0">
                    <span>{t('giftpremium_send_gift')}</span>
                    <span>{amount}</span>
                </span>
            </Button>
        </article>
    )
}

/**
 * The recommended package — a year, crowned, on the brand violet inside a gold frame.
 *
 * `savings` is optional because it is a *comparison*: without the three-month package there is
 * nothing to claim a discount against, and the card then reads as the year's price and nothing else.
 * That is the honest degradation — the alternative is a percentage claimed against a price the
 * catalogue did not offer.
 */
export function GiftFeaturedPlanCard({
    plan,
    pkg,
    onSend,
    disabled,
}: {
    plan: GiftPlan
    pkg: PremiumPackage
    onSend: (pkg: PremiumPackage) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const price = usePremiumPrice()
    const amount = price(pkg.price, pkg.currency)
    const perMonth = price(giftMonthlyEquivalent(pkg), pkg.currency)

    return (
        /*
         * The gold is a **wrapper whose padding is the border**, exactly as legacy draws it — a
         * gradient cannot be a `border-color`. `p-0.5` is that border: 2px, legacy's own, where a 1px
         * frame reads as a hairline rather than as the mount the product draws.
         *
         * ⚠ **`rounded-[18px]` = the inner `--radius-xl` (16) plus the 2px ring**, and it is a
         * literal because there is no 18 on the DS scale. A ring of even width needs
         * `outer = inner + ring` or it widens at the corners — which is exactly what `rounded-2xl`
         * (24 in this theme, not the 16 it is called) did on the subscription card.
         *
         * `overflow-clip` and not `overflow-hidden`: hidden makes the box a scroll container, which
         * is how a rounded panel elsewhere in this app silently broke a `sticky` child.
         */
        <article
            data-testid="premium-gift-plan"
            data-option-key={plan}
            data-package-id={pkg.id}
            className={cn(
                'relative flex flex-col overflow-clip rounded-[18px] p-0.5',
                PREMIUM_GOLD,
            )}
        >
            <p className="type-subheading-strong p-1 text-center text-(--primary-500)">
                {t('giftpremium_best_value')}
            </p>

            <div
                className={cn(
                    'flex flex-1 flex-col justify-between gap-3 bg-(--primary-500) p-3',
                    PREMIUM_SURFACE_RADIUS,
                )}
            >
                {/*
                 * `justify-end` in a reserved 46px box, so **the three plan names sit on one line**
                 * whether or not their card carries a discount chip. Legacy pushes the un-chipped card's
                 * title down with a hand-typed `marginTop: '12px'`, which is the same correction made
                 * from the wrong end: it breaks the moment a chip appears on that card (the catalogue
                 * decides that, not the code). 46 is the chip's line box plus the title's.
                 */}
                {/*
                 * `text-white`, not `--text-on-primary`: the ground is `--primary-500`, which is
                 * `#501bc0` in **both** themes (one of the two rungs that does not invert), while the
                 * token flips — so it would be near-black ink on violet in Dark. The trap
                 * `tinted-ground-needs-own-ink` describes.
                 */}
                <h3 className="type-subheading-strong text-white">
                    {t(GIFT_PLAN_COPY[plan].name)}
                </h3>

                <div className="flex flex-col">
                    <p className="type-title-t1-bold text-white">{amount}</p>
                    {/* `white/80` rather than `--text-subtitle`, for the reason the heading above
                        gives: this ground does not invert and that token does. */}
                    <p className="type-caption-meta text-white/80">
                        {t('giftpremium_per_month', { price: perMonth })}
                    </p>
                </div>

                <Button
                    data-testid={subTestId('premium-gift-plan', 'submit')}
                    data-option-key={plan}
                    /*
                     * `ghost`, and every colour overridden — the one button on this screen that is
                     * neither a DS variant nor derivable from one, because the DS has no gold ramp.
                     *
                     * ⚠ **`ghost` specifically, and not the default `primary`**, which is what this
                     * shipped as. `PREMIUM_GOLD` is a `background-image` while a variant's fill is a
                     * `background-color`, so `twMerge` keeps **both** — and a primary variant then
                     * animates a near-black colour *behind* the gradient on hover, invisible until
                     * the gradient fails to paint. Ghost's fill is transparent, so there is nothing
                     * underneath. `PremiumAnnualCard` documents the same trap; this card had the
                     * bug it warns about.
                     */
                    variant="ghost"
                    size="medium"
                    fullWidth
                    disabled={disabled}
                    onClick={() => onSend(pkg)}
                    className={cn(
                        PREMIUM_GOLD,
                        // `h-auto` for the two-line label, as on the other card.
                        'h-auto px-2 py-2',
                        'text-(--primary-500) hover:not-disabled:bg-(--button-ghost-bg) hover:not-disabled:opacity-90',
                    )}
                >
                    <span className="flex flex-row items-center gap-1 md:flex-col md:gap-0">
                        <span>{t('giftpremium_send_gift')}</span>
                        <span>{amount}</span>
                    </span>
                </Button>
            </div>

            {/*
             * The glare, **the same one `/premium`'s recommended card wears** — and it is last in
             * the DOM on purpose.
             *
             * ⚠ It shipped as a bare `absolute inset-0` carrying only the animation class, so it
             * animated an **invisible box**: no gradient to move and no base opacity. The card had
             * the geometry of a sheen and none of the light. The paint is what the effect *is* —
             * a narrow white `via` stop inside a full-card gradient — and `opacity-0` is its base
             * state, so reduced motion leaves no white band lying across the card.
             *
             * It is the only positioned child, and the two boxes it crosses — the gold frame and the
             * violet panel — are both static, so painting order alone puts it over the whole card
             * with no `z-index` anywhere. Ordering it earlier would leave it under the panel, where
             * the sweep would only show on the 2px frame.
             *
             * `inset-0` is also what makes it work in Arabic: the streak is a stop inside a
             * card-wide gradient rather than a short box parked at `start-0`, because `start` flips
             * with the direction while a positive `translate` does not. The keyframe's own note in
             * `globals.css` is where that is argued.
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
