'use client'

import { PAYOUT_REQUEST_PATH } from '@features/payout/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { Skeleton } from '@shared/ui/skeleton'
import Link from 'next/link'

/**
 * `/monetization`'s hero — the estimated revenue, and the withdrawable balance under it.
 *
 * ## Two figures that are not the same money, which is the whole reason this card is shaped this way
 *
 * The big number is an **estimate of what was earned** in a window; the strip below it is what is
 * **actually withdrawable right now**. Legacy stacks them exactly like this, and the arrangement is
 * the explanation: a creator who saw only the estimate would read the payout screen's smaller figure
 * as an error. The `?` beside the caption is where the difference is spelled out
 * (`RevenueInfoDialog`), and the caption itself is pressable rather than only the glyph — the
 * sentence *is* the question, and a 16px target beside it is not.
 *
 * ## `—`, never `0`
 *
 * Both figures follow `/my-wallet`'s rule: a zero is a claim about somebody's money, so an unknown
 * figure prints an em dash. The two are tracked separately because they come from different requests
 * — the balance can be known while the stats call is still out.
 *
 * ## The figure is 32, where legacy draws 26
 *
 * The DS type scale goes 24 → 32 and `CLAUDE.md` forbids setting a size by hand, so 26 is not
 * expressible. 32 is the one to round to rather than 24, because it is what `/my-wallet` and
 * `/my-star` already use for the money figure on their own hero (`CardItem titleSize="32"`) — a
 * creator moving between the three screens should see one size of "this is the number".
 *
 * ## Not `Card type="balance"`
 *
 * That is the pinned-dark money card `/my-wallet` and `/my-star` wear for *the* balance. This screen's
 * hero is a second, different figure with a nested strip inside it, and legacy paints it on the same
 * white surface as the rest of the hub. Using the black card here would make the estimate look like
 * the authoritative balance, which is the one reading this card exists to prevent. The recessed strip
 * is `--background` — the page's own colour, which is exactly what legacy's `#F4F4F4` is against its
 * white card.
 */
export function RevenueCard({
    revenue,
    balance,
    isRevenueLoading,
    isBalanceLoading,
    onExplain,
    windowDays,
    className,
}: {
    /** Already formatted in the reader's currency, or `null` when unknown. */
    revenue: string | null
    balance: string | null
    isRevenueLoading: boolean
    isBalanceLoading: boolean
    onExplain: () => void
    windowDays: number
    className?: string
}) {
    const { t } = useTranslation()

    return (
        <div
            data-testid="monetization-revenue"
            /*
             * Published as `aria-busy` rather than as a testid on each shimmering bar — the rule
             * `docs/TEST_IDS.md` states for loading, and the a11y half of it is that a screen reader
             * announces the card as busy instead of reading two em dashes as the answer.
             */
            aria-busy={isRevenueLoading || isBalanceLoading || undefined}
            className={cn(
                'flex flex-none flex-col gap-3 rounded-xl bg-(--background-surface) p-4',
                className,
            )}
        >
            <div className="flex flex-col gap-1">
                <span className="type-body-strong text-(--text-body)">
                    {t('monetization_revenue_label')}
                </span>

                {isRevenueLoading ? (
                    <Skeleton w={168} h={32} />
                ) : (
                    <span
                        data-testid="monetization-revenue-value"
                        className="type-heading-h1-bold text-(--text-title)"
                    >
                        {revenue ?? '—'}
                    </span>
                )}

                {/*
                 * The caption is the control. A `button` and not a `div` with a handler: it is
                 * keyboard-reachable and announced, which the glyph-only version legacy ships is not
                 * (its `HelpOutlineRoundedIcon` sits inside a `Stack` with an `onClick`).
                 */}
                <button
                    type="button"
                    data-testid="monetization-revenue-explain"
                    onClick={onExplain}
                    /*
                     * `-m-2 p-2` grows the hit area to ~40px without moving anything: the padding
                     * makes the target, the negative margin gives the space back to the layout. The
                     * visible line stays the 12px caption legacy draws — this is the DoD's touch-target
                     * rule (§4) applied to a control that must not *look* like a button.
                     */
                    className={cn(
                        'type-caption-meta -m-2 inline-flex w-fit cursor-pointer items-center gap-1 rounded-md p-2',
                        'text-(--text-body) transition-colors hover:text-(--text-subtitle)',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                    )}
                >
                    {t('monetization_revenue_window', { days: windowDays })}
                    <Icon name="question-circle" size={16} />
                </button>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-(--background) p-3">
                <span className="type-dense-default flex min-w-0 flex-1 items-center gap-1 text-(--text-body)">
                    {t('monetization_balance_label')}
                    {isBalanceLoading ? (
                        <Skeleton w={72} h={14} />
                    ) : (
                        <span
                            data-testid="monetization-balance-value"
                            className="type-dense-strong truncate text-(--text-title)"
                        >
                            {balance ?? '—'}
                        </span>
                    )}
                </span>

                {/*
                 * A real `Link`, not a handler: `/my-wallet/payout-request` exists, and a destination
                 * should be middle-clickable and copyable. `--text-link` is the token for brand ink on
                 * a page that the DS has not overruled — legacy's own `#0061FF`.
                 */}
                <Link
                    data-testid="monetization-withdraw"
                    href={PAYOUT_REQUEST_PATH}
                    /*
                     * `-my-2.5 py-2.5` for the same reason as the caption above: the row's only real
                     * action, drawn by legacy as bare 14px text, gets a ~40px target without the
                     * strip growing around it.
                     */
                    className={cn(
                        'type-dense-strong -my-2.5 flex-none rounded-md py-2.5 text-(--text-link)',
                        'transition-colors hover:text-(--text-link-hover)',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                    )}
                >
                    {t('monetization_withdraw')}
                </Link>
            </div>
        </div>
    )
}
