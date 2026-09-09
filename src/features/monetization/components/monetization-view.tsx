'use client'

import { useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import type { ActionRow } from '@shared/components/action-rows'
import { ActionRows, ActionRowsSkeleton } from '@shared/components/action-rows'
import { useTranslation } from '@shared/i18n/use-translation'
import { convertFromUsd, formatFiatAmount } from '@shared/lib/money'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { FieldLabel } from '@shared/ui/field-label'
import { useId, useState } from 'react'
import { useMonetizationHub } from '../hooks/use-monetization-hub'
import { MONETIZATION_METHODS, REVENUE_WINDOW_DAYS } from '../lib/methods'
import { RevenueCard } from './revenue-card'
import { RevenueInfoDialog } from './revenue-info-dialog'
import { StartEarningBanner } from './start-earning-banner'

/**
 * `/monetization` — the creator's hub: what they have earned, what they can withdraw, and the four
 * ways to earn more.
 *
 * ## The shape is legacy's, and so is the one conditional on it
 *
 * `Content/index.js` is a `Stack` of three things — an optional banner, the revenue card, and a
 * headed list of methods — and the only state on the screen is `hasData`, which hides the banner once
 * a first payment has landed. Everything else is unconditional. This view is that, with two states
 * legacy does not have:
 *
 * - **Signed out** replaces the screen. Every figure here is bearer-derived and the four methods are
 *   things *you* switch on, so a guest would get a card of dashes over a list of their own
 *   non-existent settings. `/my-wallet` makes the same call. It is a *wall*, not a redirect — the
 *   press is what raises the sign-in dialog, which is this repo's rule everywhere.
 * - **Loading** keeps the layout. `loading.tsx` paints the same three blocks, and the client's own
 *   loading branch paints them again rather than collapsing to a spinner, so the skeleton and the
 *   screen are the same page at two moments instead of one replacing the other.
 *
 * ## One entry to the explainer, where legacy has two
 *
 * Legacy's `TopBar` carries a `?` disc at the trailing edge that opens the same modal the revenue
 * caption does — two triggers for one dialog, ~100px apart. Only the caption is kept, and the
 * caption is the better of the two: it is a labelled sentence rather than an unlabelled 32px glyph,
 * it sits against the figure it explains, and `PageBackBar`'s `actions` slot would need the dialog's
 * state hoisted above both the bar and the view for a duplicate affordance.
 *
 * Stated here rather than silently dropped, because `web-app` is the spec: if the bar control is
 * wanted back, `PageBackBar` has the slot and the state moves up one level.
 *
 * ## Two of the four rows have no destination yet, and say so
 *
 * `/monetization/{pay-per-post,interaction}` are not ported. `ActionRows`
 * renders a row with no `href` as visibly not ready — dimmed, a real disabled `button`, with the
 * reason as its accessible description — which is the treatment that file argues for at length
 * against the two alternatives (a link to a 404, or a row that silently does nothing). Each row gets
 * its `href` when its screen lands, and nothing else here changes.
 */
export function MonetizationView({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const requireAuth = useRequireAuth()
    const [explaining, setExplaining] = useState(false)
    const methodsHeadingId = useId()
    const {
        revenueUsd,
        isRevenueKnown,
        isRevenueLoading,
        isRevenueError,
        refreshRevenue,
        balanceUsd,
        isBalanceKnown,
        isBalanceLoading,
        currency,
        rate,
        isSignedIn,
        isSessionLoading,
    } = useMonetizationHub()

    const rows: ActionRow[] = MONETIZATION_METHODS.map(method => ({
        key: method.key,
        label: t(method.labelKey),
        icon: method.icon,
        iconWeight: 'filled' as const,
        tile: method.tile,
        // Present only for a method whose screen has landed — see `lib/methods.ts`.
        href: method.href,
    }))

    if (!isSessionLoading && !isSignedIn) {
        return (
            <div className={cn('flex flex-1 flex-col', className)}>
                <ChannelEmptyState
                    className={cn('flex-1', RISE)}
                    testId="monetization-signed-out"
                    icon="dollar-circle"
                    title={t('monetization_signed_out_title')}
                    body={t('monetization_signed_out_body')}
                    action={
                        <Button
                            data-testid="monetization-sign-in"
                            variant="primary"
                            size="large"
                            onClick={requireAuth(() => undefined)}
                        >
                            {t('auth_sign_in')}
                        </Button>
                    }
                />
            </div>
        )
    }

    /*
     * `hasData` is legacy's `!isLoading && incomeUsd > 0`, with **one deliberate divergence**: the
     * banner needs the figure to be *known*, not merely not-loading.
     *
     * Legacy's `getChannelStats` swallows a failure in a `catch` and leaves `incomeUsd` at its
     * initial `0`, so a 502 on that endpoint is indistinguishable from "you have earned nothing" —
     * and an earning creator is shown a card telling them to *start* earning, under a figure that
     * reads `$0`. Requiring `isRevenueKnown` makes a failure show the retry strip below instead,
     * which is the news that is actually true.
     *
     * The `!isRevenueLoading` half is legacy's and stays: it keeps the banner from appearing for the
     * length of one request and then being taken away — see `StartEarningBanner`.
     */
    const showBanner = isRevenueKnown && !isRevenueLoading && revenueUsd <= 0

    return (
        <div className={cn('flex flex-1 flex-col gap-3', className)}>
            {showBanner && <StartEarningBanner />}

            <RevenueCard
                revenue={
                    isRevenueKnown
                        ? formatFiatAmount(
                              convertFromUsd(revenueUsd, rate),
                              currency,
                              currentLanguage,
                          )
                        : null
                }
                balance={
                    isBalanceKnown
                        ? formatFiatAmount(
                              convertFromUsd(balanceUsd, rate),
                              currency,
                              currentLanguage,
                          )
                        : null
                }
                isRevenueLoading={isRevenueLoading}
                isBalanceLoading={isBalanceLoading}
                onExplain={() => setExplaining(true)}
                windowDays={REVENUE_WINDOW_DAYS}
            />

            {/*
             * A failed *revenue* read leaves the rest of the screen usable — the balance, Withdraw
             * and the method list are all still true — so it gets a strip rather than replacing the
             * page. Same treatment, same shape and the same `common_retry` as `/my-wallet`'s balance
             * failure, which is the house pattern for a partial read that fails.
             */}
            {isRevenueError && (
                <div
                    role="alert"
                    className="flex flex-none items-center justify-between gap-3 rounded-xl bg-(--background-surface) p-4"
                >
                    <span className="type-dense-default text-(--text-body)">
                        {t('monetization_revenue_error')}
                    </span>
                    <Button
                        data-testid="monetization-revenue-retry"
                        variant="secondary"
                        size="small"
                        onClick={() => void refreshRevenue()}
                    >
                        {t('common_retry')}
                    </Button>
                </div>
            )}

            {/*
             * `aria-labelledby` rather than a heading element: `FieldLabel` is the DS's own section
             * label and renders a `div`, so without this the region has no accessible name and a
             * screen reader announces four rows with nothing saying what they are.
             */}
            <section aria-labelledby={methodsHeadingId} className="flex flex-col gap-1">
                {/* `px-0` so the heading lines up with the card edges below it: `FieldLabel` carries
                    the Left Bar's own 16px gutter, which the drawer needs and a page column does not. */}
                <FieldLabel id={methodsHeadingId} className="h-8 px-0">
                    {t('monetization_methods_heading')}
                </FieldLabel>
                {isSessionLoading ? (
                    <ActionRowsSkeleton data-testid="monetization-methods-loading" count={4} />
                ) : (
                    <ActionRows
                        testId="monetization-methods"
                        rows={rows}
                        unavailableLabel={t('monetization_method_unavailable')}
                    />
                )}
            </section>

            <RevenueInfoDialog open={explaining} onOpenChange={setExplaining} />
        </div>
    )
}
