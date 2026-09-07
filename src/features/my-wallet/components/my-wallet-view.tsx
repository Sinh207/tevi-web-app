'use client'

import { useRequireAuth } from '@features/auth'
import { useBalance, useCurrency } from '@features/balance'
import { ChannelEmptyState } from '@features/channel'
import {
    PAYOUT_METHOD_PATH,
    PAYOUT_REQUEST_PATH,
    PAYOUT_TRACKING_PATH,
} from '@features/payout/routes'
import type { ActionRow } from '@shared/components/action-rows'
import { ActionRows, ActionRowsSkeleton } from '@shared/components/action-rows'
import { LedgerPanel } from '@shared/components/ledger'
import { LedgerDetailDialog } from '@shared/components/ledger-detail-dialog'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { convertFromUsd, DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Alert, AlertContent, AlertTitle } from '@shared/ui/alert'
import { APP_BAR_HEIGHT } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { Card, CardItem, CardMeta } from '@shared/ui/card'
import { Skeleton } from '@shared/ui/skeleton'
import Link from 'next/link'
import { useEffect } from 'react'
import { WALLET_LEDGER_PAGE_SIZE } from '../api/wallet-ledger-api'
import { useFirstPayoutFree } from '../hooks/use-first-payout-free'
import { useWalletEntryDetail } from '../hooks/use-wallet-entry-detail'
import { useWalletLedger } from '../hooks/use-wallet-ledger'
import { MY_WALLET_ART } from '../lib/illustrations'
import { MY_WALLET_TRANSACTION_HISTORY_PATH } from '../routes'
import { BalanceHelpButton } from './balance-help-button'
import { CurrencyPicker } from './currency-picker'
import { TeviCoinAppLink } from './tevi-coin-app-link'
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
 * ## The balance and the unit both come from `features/balance`
 *
 * `useBalance()` reaches the provider mounted above every route — the same figure the account drawer shows,
 * so this screen cannot disagree with the shell and opening it costs no extra balance request.
 * `useCurrency()` is the same feature's, and is called with no argument here: this is the screen the figure
 * belongs to, so the currency list and the rate go out with the page. The drawer offers the same switcher
 * and gates the pair on being open — see the hook.
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
    const { currency, currencies, isListLoading, rate, selectCurrency } = useCurrency()
    const isFirstPayoutFree = useFirstPayoutFree()
    const {
        groups,
        entries,
        isLoading,
        isError,
        bonuses,
        isEmpty,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        refetch,
    } = useWalletLedger({ displayCurrency: currency, rate })

    const { select, detail } = useWalletEntryDetail({
        entries,
        displayCurrency: currency,
        rate,
        bonuses,
        // The node, not a slug — see `TeviCoinAppLink`, and `LedgerDetailDialog`'s `bonus.link`.
        bonusLink: <TeviCoinAppLink />,
    })

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) fetchNextPage()
    }, [sentinelInView, fetchNextPage])

    /*
     * Legacy's three rows, its order, and the comp's tile colours. All three have destinations now
     * (`features/payout`), so all three carry an `href` — which is the only thing `ActionRows` reads to
     * decide between a real link and the not-ready treatment.
     *
     * The comp draws a **fourth** row (an `--icon-secondary` tile) whose label is lost to the 256 KiB
     * truncation of the design export, and legacy has only these three. It is left out rather than guessed:
     * an extra row with invented copy is worse than a row that arrives later.
     */
    const rows: ActionRow[] = [
        {
            key: 'balance_action_withdraw_request',
            label: t('balance_action_withdraw_request'),
            icon: 'dollar-arrow-up',
            tile: 'var(--accents-success-active)',
            href: PAYOUT_REQUEST_PATH,
        },
        {
            key: 'balance_action_withdraw_method',
            label: t('balance_action_withdraw_method'),
            icon: 'bank',
            tile: 'var(--accents-indigo-active)',
            /*
             * The saved destinations, and the way to add one. It leads to the *list* rather than
             * straight to `setup-payouts` even for an account with nothing saved: the list's empty
             * state offers the same button, and a row that skips a screen depending on state is a row
             * whose destination nobody can predict.
             */
            href: PAYOUT_METHOD_PATH,
        },
        {
            key: 'balance_action_withdraw_tracking',
            label: t('balance_action_withdraw_tracking'),
            icon: 'money-search',
            tile: 'var(--accents-warning-active)',
            href: PAYOUT_TRACKING_PATH,
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
                            data-testid="my-wallet-sign-in"
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
                /*
                 * The hero card's skeleton, not just the rows'. This branch drew only
                 * `ActionRowsSkeleton`, so the sequence a reader actually saw was: `loading.tsx`
                 * paints a card, the client mounts and the card **disappears**, then the balance
                 * arrives and it comes back. The same parts as `loading.tsx`, in the same order, so
                 * the two moments of this screen measure the same.
                 */
                <>
                    <Card type="balance" aria-busy="true" className="flex-none">
                        <CardItem type="large-item">
                            <Skeleton w={96} h={14} />
                        </CardItem>
                        <CardMeta gap="4" justify="start">
                            <Skeleton w={168} h={32} delay={160} />
                        </CardMeta>
                    </Card>
                    <ActionRowsSkeleton data-testid="my-wallet-actions-loading" count={3} />
                </>
            ) : (
                <>
                    <TotalBalanceCard
                        testId="my-wallet-total"
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
                        help={<BalanceHelpButton />}
                        currencyControl={
                            <CurrencyPicker
                                currencies={currencies}
                                selected={currency}
                                isLoading={isListLoading}
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

                    <ActionRows
                        testId="my-wallet-actions"
                        rows={rows}
                        unavailableLabel={t('balance_action_unavailable')}
                    />
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
                    <Button
                        data-testid="my-wallet-refresh"
                        variant="secondary"
                        size="small"
                        onClick={() => void refresh()}
                    >
                        {t('common_retry')}
                    </Button>
                </div>
            )}

            <LedgerPanel
                testId="my-wallet-ledger"
                title={t('balance_txn_title')}
                className="flex-1"
                /*
                 * The page's own `PageBackBar` is sticky and 60px tall, so the panel header parks below
                 * it instead of under it. See `LedgerPanel`'s note on `stickyTop`.
                 */
                stickyTop={APP_BAR_HEIGHT}
                fullBleed
                pageSize={WALLET_LEDGER_PAGE_SIZE}
                groups={groups}
                loading={isLoading}
                /*
                 * **View all**, where `/my-star` keeps a filter menu — legacy's arrangement for this
                 * screen, and the reason the two panels differ: only this one has a full-ledger page
                 * behind it (`/my-wallet/transaction-history`), which is where the filter now lives.
                 * With the filter gone from here, no filtered-empty state can be reached either, so
                 * this screen no longer renders one.
                 *
                 * Only when there is a next page to go and see. With every movement already on screen
                 * the link would lead to the same rows in a different frame — legacy's own condition
                 * (`transactions.length > 0 && hasMore`).
                 *
                 * A real `<a>` via `render`, not an `onClick`: `Button` reads the `href` and announces
                 * it as a link, so it is middle-clickable and copyable like the address it is.
                 * `/my-star`'s equivalent is a button because it switches state within one URL.
                 *
                 * ## The styling is the DS's `List/Trailing` button, with one deliberate divergence
                 *
                 * `.tevi-list-trailing[data-variant='button']` is 16px, weight regular, no surface and
                 * no padding — so `h-auto px-0 text-base font-normal`, undoing what `size="small"`
                 * brings. The **colour** is the divergence: the DS paints it
                 * `--accents-indigo-active` (blue), and this is `--text-brand` (purple) because the
                 * product asked for it and legacy's own button is `#501BC0`. That token exists for
                 * this, and its own note carries the contrast arithmetic.
                 *
                 * Hover is an underline, not `ghost`'s grey pill: at `px-0` the pill hugs the words
                 * with no padding to sit in, which is what made it read as a stray chip. `ghost`'s
                 * resting background is already transparent, so only the hover needs undoing.
                 */
                action={
                    groups.length > 0 &&
                    hasNextPage && (
                        <Button
                            data-testid="my-wallet-view-all"
                            variant="ghost"
                            size="small"
                            className="h-auto px-0 text-base font-normal text-(--text-brand) transition-colors hover:not-disabled:bg-transparent hover:underline"
                            render={<Link href={MY_WALLET_TRANSACTION_HISTORY_PATH} />}
                        >
                            {t('balance_txn_view_all')}
                        </Button>
                    )
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
                                <Button
                                    data-testid="my-wallet-retry"
                                    variant="secondary"
                                    size="large"
                                    onClick={refetch}
                                >
                                    {t('common_retry')}
                                </Button>
                            }
                        />
                    ) : undefined
                }
                empty={
                    isEmpty ? (
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
                onRowPress={select}
            />

            {detail && <LedgerDetailDialog {...detail} />}
        </div>
    )
}
