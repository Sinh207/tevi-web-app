'use client'

import { useRequireAuth } from '@features/auth'
import { useBalance } from '@features/balance'
import { ChannelEmptyState } from '@features/channel'
import type { ActionRow } from '@shared/components/action-rows'
import { ActionRows, ActionRowsSkeleton } from '@shared/components/action-rows'
import { FilterMenu } from '@shared/components/filter-menu'
import { LedgerPanel } from '@shared/components/ledger'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { convertFromUsd, DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Alert, AlertContent, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { useEffect } from 'react'
import { useCurrency } from '../hooks/use-currency'
import { useFirstPayoutFree } from '../hooks/use-first-payout-free'
import { useWalletLedger } from '../hooks/use-wallet-ledger'
import { MY_WALLET_ART } from '../lib/illustrations'
import { walletTransactionFilters } from '../lib/wallet-transaction-types'
import { CurrencyPicker } from './currency-picker'
import { TotalBalanceCard } from './total-balance-card'

/**
 * `/my-wallet` — the withdrawable balance, its ledger, and the way out to the payout screens.
 *
 * ## The Star half is gone, and that is the design's instruction rather than a simplification
 *
 * Legacy's `/my-wallet` is one screen with two tabs, Star and Currency, and ~300 duplicated lines per tab.
 * The design splits them and its handoff note is explicit: *"bên My wallet bỏ phần Star đi"* — My wallet
 * loses the Star part. So this screen is the Currency half only, `/my-star` is the other, and they are two
 * features that share no state. The address stays legacy's because the mobile apps link to it.
 *
 * ## The balance comes from the provider; the unit is this screen's
 *
 * `useBalance()` reaches `features/balance`, mounted above every route — the same figure the account drawer
 * shows, so this screen cannot disagree with the shell and opening it costs no extra balance request. What
 * this screen adds is the **unit**: `useCurrency` owns the switcher and the rate, because they exist on this
 * page and nowhere else.
 *
 * ## Four states, same shape as `/my-star`
 *
 * Loading / error / signed-out / success, and no ownership gate — the endpoint takes no channel, so there is
 * nothing in the URL that could disagree with the bearer. A failed *balance* leaves the ledger readable
 * behind a thin retry, because the history is the more useful half; only a signed-out session replaces the
 * screen.
 */
export function MyWalletView({ className }: { className?: string }) {
    const { t, currentLanguage } = useTranslation()
    const requireAuth = useRequireAuth()
    const {
        usd,
        isKnown,
        isLoading: isBalanceLoading,
        isError: isBalanceError,
        refresh,
    } = useBalance()
    const { currency, currencies, rate, selectCurrency } = useCurrency()
    const isFirstPayoutFree = useFirstPayoutFree()
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
    } = useWalletLedger({ displayCurrency: currency, rate })

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) fetchNextPage()
    }, [sentinelInView, fetchNextPage])

    /*
     * Legacy's three rows, its order, and the comp's tile colours. None of the destinations exists yet, so
     * all three render visibly not-ready — see `ActionRows`.
     *
     * The comp draws a **fourth** row (an `--icon-secondary` tile) whose label is lost to the 256 KiB
     * truncation of the design export, and legacy has only these three. It is left out rather than guessed:
     * an extra row with invented copy is worse than a row that arrives later.
     */
    const rows: ActionRow[] = [
        {
            key: 'balance_action_withdraw_request',
            label: t('balance_action_withdraw_request'),
            icon: 'sack-dollar',
            tile: 'var(--accents-success-active)',
        },
        {
            key: 'balance_action_withdraw_method',
            label: t('balance_action_withdraw_method'),
            icon: 'bank',
            tile: 'var(--accents-indigo-active)',
        },
        {
            key: 'balance_action_withdraw_tracking',
            label: t('balance_action_withdraw_tracking'),
            icon: 'clock',
            tile: 'var(--accents-warning-active)',
        },
    ]

    if (!isBalanceLoading && !isKnown && !isBalanceError) {
        return (
            <div className={cn('flex flex-1 flex-col', className)}>
                <ChannelEmptyState
                    className={cn('flex-1', RISE)}
                    icon="wallet"
                    title={t('balance_wallet_signed_out_title')}
                    body={t('balance_wallet_signed_out_body')}
                    action={
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

    const converted = convertFromUsd(usd, rate)

    return (
        <div className={cn('flex flex-1 flex-col gap-3', className)}>
            {isBalanceLoading ? (
                <ActionRowsSkeleton count={3} />
            ) : (
                <>
                    <TotalBalanceCard
                        label={t('balance_total_label')}
                        // `—`, not `0` — a zero is a claim about somebody's money, and the provider is what
                        // decides whether we have one. See `isKnown`.
                        value={
                            isKnown ? formatFiatAmount(converted, currency, currentLanguage) : '—'
                        }
                        /*
                         * Only when the display unit is not already USD. `undefined` rather than an empty
                         * string, so the card omits the whole line and its `gap-0` column does not reserve
                         * space for nothing.
                         */
                        subValue={
                            !isKnown || currency.code === DEFAULT_CURRENCY.code
                                ? undefined
                                : formatFiatAmount(usd, DEFAULT_CURRENCY, currentLanguage)
                        }
                        currencyControl={
                            <CurrencyPicker
                                currencies={currencies}
                                selected={currency}
                                onSelect={selectCurrency}
                                triggerLabel={t('balance_change_currency')}
                            />
                        }
                    />

                    {isFirstPayoutFree && (
                        /*
                         * `status="success"` with the DS's own success surface. It is a *statement* rather
                         * than something to act on, so `role="status"` and no actions — and it is absent,
                         * not dimmed, when the fee has been used: a promise that is no longer true must not
                         * be on screen at all.
                         */
                        <Alert status="success" role="status" className={cn('flex-none', RISE)}>
                            <AlertContent>
                                <AlertTitle>{t('balance_first_payout_free')}</AlertTitle>
                            </AlertContent>
                        </Alert>
                    )}

                    <ActionRows rows={rows} unavailableLabel={t('balance_action_unavailable')} />
                </>
            )}

            {isBalanceError && (
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
                        options={walletTransactionFilters().map(option => ({
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
                            art={MY_WALLET_ART.empty}
                            title={t('balance_txn_filtered_empty_title')}
                            body={t('balance_txn_filtered_empty_body')}
                            action={
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
                            art={MY_WALLET_ART.empty}
                            title={t('balance_txn_empty_currency_title')}
                            body={t('balance_txn_empty_currency_body')}
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
