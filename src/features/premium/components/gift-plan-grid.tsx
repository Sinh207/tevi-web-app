'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Skeleton } from '@shared/ui/skeleton'
import type { PremiumPackage } from '../api/types'
import { useGiftPackages } from '../hooks/use-gift-packages'
import { PREMIUM_INSET, PREMIUM_SURFACE_RADIUS } from '../lib/container'
import { GIFT_PLAN_ORDER } from '../lib/gift-plans'
import { GiftFeaturedPlanCard, GiftPlanCard } from './gift-plan-card'

/**
 * The grid the cards and their placeholders share, so the two cannot lay out differently.
 *
 * `md:items-center`, which is legacy's `alignItems='flex-end'` corrected to the arrangement the
 * subscription grid already uses: the two flanking cards hug their content and sit centred against
 * the taller crowned one, so the recommendation protrudes above *and* below them. Stretching all
 * three to one height — the grid's default — makes the side cards taller than they need to be and
 * spreads their price and button apart to fill the room.
 */
const GRID = 'grid grid-cols-1 gap-2 md:grid-cols-3 md:items-center'

/**
 * The three gift packages, inside the hero's band.
 *
 * ## Four states, and only one of them is an error
 *
 * - **loading** — three card-shaped placeholders built from the cards' own box, so nothing below
 *   jumps when the prices land (`docs/DEFINITION_OF_DONE.md` §1);
 * - **empty** — the request succeeded and there is nothing to sell (a catalogue between edits, or
 *   every row failed the parser's "can this be bought" bar). One sentence, no retry: retrying a
 *   successful request is a control that cannot help;
 * - **error** — a sentence *and* a retry, because that one can;
 * - **priced** — the cards.
 *
 * Legacy renders `null` for the last three: a spinner while loading, and every other outcome leaves
 * the section silently absent behind a toast that has already faded — so somebody who arrives on a
 * bad minute sees a recipient, a gold ring, and no way to send them anything.
 */
export function GiftPlanGrid({
    onSend,
    disabled,
}: {
    onSend: (pkg: PremiumPackage) => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const { plans, isLoading, isError, isEmpty, refetch } = useGiftPackages()

    if (isLoading) return <GiftPlanGridSkeleton />

    if (isError || isEmpty) {
        return (
            /*
             * One id for both outcomes, and the **retry button** is what tells them apart — state
             * never goes in an id (`docs/TEST_IDS.md`), and `…-error` would be findable only while it
             * held that state. "empty" is the part vocabulary's word for "the collection has nothing
             * to show", which is true of both.
             */
            <div
                data-testid="premium-gift-plans-empty"
                className={cn(PREMIUM_INSET, 'flex flex-col items-center gap-3 py-3')}
            >
                {/* On the hero's violet, so the ink is a fixed white rather than a token that flips
                    — the same reason the hero's own copy is. */}
                <p className="type-dense-default max-w-[400px] text-center text-white/80">
                    {t('giftpremium_unavailable')}
                </p>
                {isError && (
                    <Button
                        data-testid="premium-gift-plans-retry"
                        variant="secondary"
                        size="medium"
                        onClick={refetch}
                    >
                        {t('common_retry')}
                    </Button>
                )}
            </div>
        )
    }

    return (
        <div data-testid="premium-gift-plans" className={cn(PREMIUM_INSET, GRID)}>
            {GIFT_PLAN_ORDER.map(plan => {
                const pkg = plans[plan]
                /*
                 * A duration the catalogue did not offer renders nothing at all, rather than a
                 * disabled card: an empty slot is a fact about the offer, and a card that cannot be
                 * pressed is a control that teaches nothing. The grid closes up around it.
                 */
                if (!pkg) return null
                const Card = plan === 'year' ? GiftFeaturedPlanCard : GiftPlanCard
                return <Card key={plan} plan={plan} pkg={pkg} onSend={onSend} disabled={disabled} />
            })}
        </div>
    )
}

/**
 * Three placeholders built from **the cards' own box** — measured against it, not guessed.
 *
 * A skeleton that is shorter than what replaces it is a layout shift with extra steps, and this one
 * was: measured on the running screen it came out **546 against 561** stacked and **194 against 228**
 * in a row, so the About panel under the band jumped 34px the moment the prices landed. Three
 * numbers were wrong, and each is now the real one:
 *
 * | | was | is | why |
 * |---|---|---|---|
 * | crown strip | 26 | **35** | `type-subheading-strong`'s 27px line inside `p-1`, not a bare 26px band |
 * | button, from `md` | 54 | **58** | the label is two lines there — `md:flex-col` on the real one |
 * | the gold frame | absent | **`p-0.5` + `rounded-[18px]`** | the featured card's 2px ring is 4px of height the placeholder did not have |
 *
 * Everything else is reproduced by **construction** rather than by number — the same padding, the
 * same gaps, the same `min-h`, the same radius constant — so a card that grows takes its placeholder
 * with it. `PremiumPlansSkeleton` makes the same argument for `/premium`'s grid.
 */
export function GiftPlanGridSkeleton() {
    return (
        <div
            data-testid="premium-gift-plans-skeleton"
            aria-busy
            className={cn(PREMIUM_INSET, GRID)}
        >
            {GIFT_PLAN_ORDER.map((plan, index) => {
                const featured = plan === 'year'
                const delay = index * 160
                const body = (
                    <div
                        className={cn(
                            'flex flex-1 flex-col justify-between gap-3 p-3',
                            PREMIUM_SURFACE_RADIUS,
                            featured ? 'bg-(--primary-500)/60' : 'bg-(--background-surface)',
                        )}
                    >
                        {/* The plan name, at the 27px `type-subheading-strong` occupies. */}
                        <span className="flex h-[27px] items-center">
                            <Skeleton w={100} delay={delay} />
                        </span>
                        {/* The total and the rate under it — the card's two figures. */}
                        <span className="flex flex-col">
                            <span className="flex h-[36px] items-center">
                                <Skeleton w={110} h={20} delay={delay + 40} />
                            </span>
                            <span className="flex h-[18px] items-center">
                                <Skeleton w={72} delay={delay + 80} />
                            </span>
                        </span>
                        {/*
                         * ⚠ The button's height is on a **wrapper**, not on the bar.
                         *
                         * `Skeleton` always writes `height` into its inline `style` (defaulting to
                         * 12px), so a `md:h-*` class on it can never win — the placeholder stayed
                         * 38px at every width while the real button is **58** from `md`, where its
                         * label is two lines. Measured: the grid came out 208 against the cards' 228
                         * and the About panel below jumped 20px when the prices landed. The bar
                         * fills a box the classes own instead.
                         */}
                        {/* One line below `md`, two from it — as the real button is. */}
                        <span className="flex h-[38px] md:h-[58px]">
                            <Skeleton h="100%" delay={delay + 120} className="rounded-lg" />
                        </span>
                    </div>
                )

                if (!featured) {
                    return (
                        <div
                            key={plan}
                            className={cn('flex flex-col md:mt-4', PREMIUM_SURFACE_RADIUS)}
                        >
                            {body}
                        </div>
                    )
                }

                return (
                    /*
                     * The gold frame's geometry, unpainted: `p-0.5` is the 2px ring and
                     * `rounded-[18px]` is the inner 16 plus it — the arithmetic `GiftFeaturedPlanCard`
                     * spells out. Four pixels of height that the placeholder used to be missing.
                     */
                    <div
                        key={plan}
                        className="flex flex-col rounded-[18px] bg-(--primary-500)/40 p-0.5"
                    >
                        {/* The crown strip: `type-subheading-strong`'s 27px line inside `p-1`. */}
                        <span className="flex h-[35px] items-center justify-center">
                            <Skeleton w={80} delay={delay} />
                        </span>
                        {body}
                    </div>
                )
            })}
        </div>
    )
}
