'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Skeleton } from '@shared/ui/skeleton'
import { usePremiumPlans } from '../hooks/use-premium-plans'
import type { SubscribePremiumFlow } from '../hooks/use-subscribe-premium'
import { PREMIUM_INSET, PREMIUM_SURFACE_RADIUS } from '../lib/container'
import { PLAN_ORDER } from '../lib/plans'
import { PremiumAnnualCard, PremiumPlanCard } from './premium-plan-card'

/**
 * The grid the cards and their placeholders share, so the two cannot lay out differently.
 *
 * `md:items-center`, which is legacy's `alignItems='center'` and **not** a stretch: the two flanking
 * cards hug their own content and sit centred against the taller annual one, so the recommendation
 * protrudes above *and* below them. Stretching all three to one height — the grid's default, and
 * what this had first — makes the side cards 55px taller than they need to be and spreads their
 * price and button apart to fill the room, which is the difference the comparison screenshots showed.
 */
const GRID = 'grid grid-cols-1 gap-2 md:grid-cols-3 md:items-center'

/**
 * The three prices, and the confirmation in front of the charge.
 *
 * Rendered inside the hero's band, because that is where legacy puts them and it is what makes the
 * violet mean something: the cards are the offer, and the page turns to its ordinary ground below
 * them.
 *
 * ## Four states, and only one of them is an error
 *
 * - **loading** — three card-shaped placeholders built from the cards' own box, so the panels below
 *   do not jump when the prices land (`docs/DEFINITION_OF_DONE.md` §1);
 * - **empty** — the request succeeded and there is nothing to sell (a catalogue between edits, or
 *   every row failed the parser's "can this be bought" bar). One sentence, no retry button: retrying
 *   a successful request is a control that cannot help;
 * - **error** — a sentence *and* a retry, because that one can;
 * - **priced** — the cards.
 *
 * Legacy renders `null` for the last three: `isLoadingPackages` shows skeletons, and every other
 * outcome leaves the section silently absent behind a toast that has already faded. Somebody who
 * arrives on a bad minute sees a page about Premium with no way to buy it and nothing saying why.
 *
 * ## Nothing is rendered here for a member
 *
 * `PremiumView` decides that — a plan grid in front of somebody who already subscribed is an
 * invitation to be charged twice, and legacy hides it for the same reason (`{!isMyPremium && …}`).
 */
export function PremiumPlans({
    /**
     * The screen's one subscribe flow, created in `PremiumView` and shared with the benefit dialog's
     * footer button — see `PremiumSubscribeConfirm` for why it is not created here.
     */
    flow,
}: {
    flow: SubscribePremiumFlow
}) {
    const { t } = useTranslation()
    const { plans, savings, isLoading, isError, isEmpty, refetch } = usePremiumPlans()

    if (isLoading) return <PremiumPlansSkeleton />

    if (isError || isEmpty) {
        return (
            /*
             * One id for both outcomes, and the **retry button** is what tells them apart — state
             * never goes in an id (`docs/TEST_IDS.md`), and `premium-plans-error` would be findable
             * only while it held that state. `empty` is the part vocabulary's own word for "the
             * collection has nothing to show", which is true of both.
             */
            <div
                data-testid="premium-plans-empty"
                className={cn(PREMIUM_INSET, 'flex flex-col items-center gap-3 py-3')}
            >
                {/*
                 * On the hero's violet, so the ink is a fixed white rather than a token that flips
                 * — the same reason the hero's own copy is.
                 */}
                <p className="type-dense-default max-w-[400px] text-center text-white/80">
                    {t('premium_unavailable')}
                </p>
                {isError && (
                    <Button
                        data-testid="premium-plans-retry"
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
        <>
            {/*
             * `md:grid-cols-3` with the annual card in the middle, stacked below `md` in the same
             * order — see `PLAN_ORDER` for why that order is the recommendation's.
             *
             * `items-stretch` (the grid default) is load-bearing: the annual card is taller by its
             * crown strip and its discount line, and without equal heights the two flanking cards
             * would float against the top of their tracks with their buttons out of line.
             */}
            <div data-testid="premium-plans" className={cn(PREMIUM_INSET, GRID)}>
                {PLAN_ORDER.map(plan => {
                    const pkg = plans[plan]
                    /*
                     * A cadence the catalogue did not offer renders nothing at all, rather than a
                     * disabled card: an empty slot is a fact about the offer, and a card that cannot
                     * be pressed is a control that teaches nothing (`BalanceActionRows` argues the
                     * same). The grid closes up around it.
                     */
                    if (!pkg) return null
                    if (plan === 'annual') {
                        return (
                            <PremiumAnnualCard
                                key={plan}
                                pkg={pkg}
                                monthlyPkg={plans.monthly}
                                savings={savings}
                                onSubscribe={flow.request}
                                disabled={flow.isBusy}
                            />
                        )
                    }
                    return (
                        <PremiumPlanCard
                            key={plan}
                            plan={plan}
                            pkg={pkg}
                            onSubscribe={flow.request}
                            disabled={flow.isBusy}
                        />
                    )
                })}
            </div>
        </>
    )
}

/**
 * Three placeholders built from **the cards' own box**, not from three guessed heights.
 *
 * The first version declared `h={120}` and `h={168}`; the real cards measure 222 and 238 at 612, and
 * more than that on a phone where the label wraps. A skeleton that is half the height of what
 * replaces it is a layout shift with extra steps — `Skeleton`'s own doc makes the same point about
 * a 12px bar in a 12px row. Reproducing the box (the padding, the gaps, the crown strip, the
 * button's height) means it cannot drift: a card that grows takes its placeholder with it.
 */
export function PremiumPlansSkeleton() {
    return (
        <div data-testid="premium-plans-skeleton" aria-busy className={cn(PREMIUM_INSET, GRID)}>
            {PLAN_ORDER.map((plan, index) => {
                const annual = plan === 'annual'
                const delay = index * 160
                return (
                    <div
                        key={plan}
                        className={cn(
                            'flex flex-col rounded-xl',
                            annual ? 'bg-(--primary-500)/40' : 'bg-(--background-surface) md:mt-4',
                        )}
                    >
                        {/* The crown strip's 26px, so the annual card's extra height is real. */}
                        {annual && (
                            <span className="flex h-[26px] items-center justify-center">
                                <Skeleton w={80} delay={delay} />
                            </span>
                        )}
                        <div
                            className={cn(
                                'flex flex-1 flex-col justify-between gap-3 p-3',
                                PREMIUM_SURFACE_RADIUS,
                                annual && 'bg-(--primary-500)/60',
                            )}
                        >
                            <span className="flex flex-col gap-1">
                                <Skeleton w={70} delay={delay} />
                                <span className="flex h-[27px] items-center">
                                    <Skeleton w={100} delay={delay + 40} />
                                </span>
                            </span>
                            {/* The price row, at the 36px `type-title-t1-bold` occupies. */}
                            <span className="flex h-[36px] items-center">
                                <Skeleton w={110} h={20} delay={delay + 80} />
                            </span>
                            {/*
                             * ⚠ The height is on a **wrapper**, not on the bar. `Skeleton` always
                             * writes `height` into its inline `style` (defaulting to 12px), so the
                             * `md:h-*` this used to carry could never win — the placeholder stayed
                             * 38px at every width while the real button is two lines and 58 from
                             * `md`. Found by measuring `/gift-premium`'s identical grid, which had
                             * the same defect copied from here.
                             */}
                            <span className="flex h-[38px] md:h-[58px]">
                                <Skeleton h="100%" delay={delay + 120} className="rounded-lg" />
                            </span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
