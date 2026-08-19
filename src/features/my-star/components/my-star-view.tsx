'use client'

import { useRequireAuth } from '@features/auth'
import { useBalance, useBalanceDisplay } from '@features/balance'
import { ChannelEmptyState } from '@features/channel'
import type { ActionRow } from '@shared/components/action-rows'
import { ActionRows, ActionRowsSkeleton } from '@shared/components/action-rows'
import { FilterMenu } from '@shared/components/filter-menu'
import { LedgerPanel } from '@shared/components/ledger'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { useEffect } from 'react'
import { useStarLedger } from '../hooks/use-star-ledger'
import { MY_STAR_ART } from '../lib/illustrations'
import { starTransactionFilters } from '../lib/star-transaction-types'
import { StarBalanceCard } from './star-balance-card'

/**
 * `/my-star` — everything below the page's back bar.
 *
 * ## The balance comes from the provider, the ledger from this feature
 *
 * That split is the point of the restructure. `useBalance()` / `useBalanceDisplay()` reach
 * `features/balance`, which is mounted above every route and is the same figure the account drawer and
 * the top bar show — so this screen cannot disagree with the shell, and opening it costs **no extra
 * balance request**. The ledger is this feature's own: its endpoint, its eleven filters, its layout.
 *
 * ## Four states, and no ownership gate
 *
 * Loading / error / signed-out / success. There is deliberately **no** "not the owner" state, which is
 * the one difference from `EarningsReportView`: that screen has a slug in its URL that the
 * bearer-derived endpoint ignores, so it has to refuse to print one person's money under another
 * person's address. This URL names nobody — `/my-star` is always the reader's own, by construction.
 *
 * The **signed-out** state matters more than it looks: the app always keeps an anonymous Firebase
 * session, so `currentUser` being present says nothing about whether there is a real account. An
 * anonymous visitor gets a prompt, not a balance of zero — and the prompt gates the *action*
 * (`useRequireAuth` raises the login dialog) rather than redirecting, per
 * `docs/DEFINITION_OF_DONE.md` §3: the URL stays put and signing in leaves them here.
 *
 * ## The ledger renders even when the balance failed
 *
 * They are separate queries in separate features, and the error states are separate too. A creator whose
 * balance call 500s can still read their history, which is the more useful half — and the panel carries
 * its own retry. Only a *signed-out* session replaces the whole screen, because then neither half has
 * anything to show.
 */
export function MyStarView({ className }: { className?: string }) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    const { isKnown, isLoading: isBalanceLoading, isError: isBalanceError, refresh } = useBalance()
    const { star } = useBalanceDisplay()
    const {
        groups,
        filter,
        setFilter,
        isLoading,
        isError,
        isEmpty,
        isFilteredEmpty,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        refetch,
    } = useStarLedger()

    /*
     * The same pair as `ChannelThreadList` — the ref plus an effect, with `enabled` detached the moment
     * there is nothing to fetch, so no observer is left attached to a sentinel whose callback would do
     * nothing. `useInView`'s 600px default `rootMargin` is about a screen of lead time, which is why the
     * spinner is usually never seen.
     */
    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) fetchNextPage()
    }, [sentinelInView, fetchNextPage])

    /*
     * Neither destination exists yet, so both rows render visibly not-ready — `ActionRows` documents why
     * that beats a 404 and why it beats silence. Adding `/get-star` later is one `href`.
     *
     * These are **navigations**, not spends, so they are not behind `useRequireStars`. That guard is for
     * the places a price is actually paid — a gift, a paywalled post — which live in other features and
     * call it at the point of the press.
     *
     * Tile colours are the comp's: warning for Get more Star, indigo for Gift Star.
     */
    const rows: ActionRow[] = [
        {
            key: 'balance_action_get_star',
            label: t('balance_action_get_star'),
            icon: 'plus-circle',
            tile: 'var(--accents-warning-active)',
        },
        {
            key: 'balance_action_gift_star',
            label: t('balance_action_gift_star'),
            icon: 'gift-simple',
            tile: 'var(--accents-indigo-active)',
        },
    ]

    if (!isBalanceLoading && !isKnown && !isBalanceError) {
        /*
         * Not known, not loading and not an error — which for this provider means there is no real
         * account. `access`-style tri-states live in the provider's `isKnown`, so this screen reads the
         * one flag rather than re-deriving the session.
         */
        return (
            <div className={cn('flex flex-1 flex-col', className)}>
                <ChannelEmptyState
                    className={cn('flex-1', RISE)}
                    icon="star"
                    title={t('balance_star_signed_out_title')}
                    body={t('balance_star_signed_out_body')}
                    action={
                        /*
                         * The action *is* the gate: `useRequireAuth` opens the login dialog when there is
                         * no real account, and by the time its callback could run there is nothing left
                         * to do — the branch unmounts. Same shape as `EarningsReportView`'s.
                         */
                        <Button
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

    return (
        <div className={cn('flex flex-1 flex-col gap-3', className)}>
            {isBalanceLoading ? (
                <ActionRowsSkeleton count={2} />
            ) : (
                <>
                    {/* `star` is already `—` when the figure is unknown — that decision belongs to the
                        provider, not to this screen. See `useBalanceDisplay`. */}
                    <StarBalanceCard label={t('balance_star_label')} value={star} />
                    <ActionRows rows={rows} unavailableLabel={t('balance_action_unavailable')} />
                </>
            )}

            {isBalanceError && (
                /*
                 * A thin retry above the ledger rather than an empty state instead of it: the history is
                 * still readable and still the more useful half, so a failed balance must not blank the
                 * screen. `role="alert"` so it is announced when it appears.
                 */
                <div
                    role="alert"
                    className="flex items-center justify-between gap-3 rounded-xl bg-(--background-surface) p-4"
                >
                    <span className="type-dense-default text-(--text-body)">
                        {t('balance_error_body')}
                    </span>
                    <Button variant="secondary" size="small" onClick={() => void refresh()}>
                        {t('common_retry')}
                    </Button>
                </div>
            )}

            <LedgerPanel
                title={t('balance_txn_title')}
                className="flex-1"
                groups={groups}
                loading={isLoading}
                filter={
                    <FilterMenu
                        options={starTransactionFilters().map(option => ({
                            key: option.key,
                            label: t(option.label),
                        }))}
                        value={filter}
                        onChange={setFilter}
                        triggerLabel={t('balance_txn_filter')}
                    />
                }
                error={
                    isError ? (
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            icon="exclamation-diamond"
                            tone="error"
                            title={t('balance_txn_error_title')}
                            body={t('balance_txn_error_body')}
                            action={
                                <Button variant="secondary" size="large" onClick={refetch}>
                                    {t('common_retry')}
                                </Button>
                            }
                        />
                    ) : undefined
                }
                empty={
                    isFilteredEmpty ? (
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            art={MY_STAR_ART.empty}
                            title={t('balance_txn_filtered_empty_title')}
                            body={t('balance_txn_filtered_empty_body')}
                            action={
                                /*
                                 * The way out of this state is to clear the filter, so the state offers
                                 * it. Legacy leaves the reader to work out that the header icon is what
                                 * put them here.
                                 */
                                <Button
                                    variant="secondary"
                                    size="large"
                                    onClick={() => setFilter('')}
                                >
                                    {t('balance_txn_clear_filter')}
                                </Button>
                            }
                        />
                    ) : isEmpty ? (
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            art={MY_STAR_ART.empty}
                            title={t('balance_txn_empty_star_title')}
                            body={t('balance_txn_empty_star_body')}
                        />
                    ) : undefined
                }
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                sentinelRef={sentinelRef}
            />
        </div>
    )
}
