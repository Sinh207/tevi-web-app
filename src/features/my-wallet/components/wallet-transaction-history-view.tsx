'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { useCurrency } from '@features/balance'
import { ChannelEmptyState } from '@features/channel'
import { PageBackBar } from '@features/navigation'
import { BarIconButton } from '@shared/components/bar-icon-button'
import { FilterMenu } from '@shared/components/filter-menu'
import { LedgerPanel } from '@shared/components/ledger'
import { LedgerDetailDialog } from '@shared/components/ledger-detail-dialog'
import { useInView } from '@shared/hooks/use-in-view'
import { useScrollIntoViewOnChange } from '@shared/hooks/use-scroll-into-view-on-change'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { APP_BAR_HEIGHT } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { useEffect, useRef } from 'react'
import { WALLET_LEDGER_PAGE_SIZE } from '../api/wallet-ledger-api'
import { useWalletEntryDetail } from '../hooks/use-wallet-entry-detail'
import { useWalletLedger } from '../hooks/use-wallet-ledger'
import { MY_WALLET_CONTAINER, MY_WALLET_PANEL, MY_WALLET_SCREEN } from '../lib/container'
import { MY_WALLET_ART } from '../lib/illustrations'
import { walletTransactionFilters } from '../lib/wallet-transaction-types'
import { MY_WALLET_PATH } from '../routes'
import { TeviCoinAppLink } from './tevi-coin-app-link'

/**
 * `/my-wallet/transaction-history` — the whole currency ledger, and the only place its filter lives.
 *
 * ## Why it is a page and not a taller panel
 *
 * Legacy's address, and legacy's split: `/my-wallet` shows the balance, the payout rows and the
 * recent movements under a **View all** link, and this page shows the ledger with nothing above it.
 * The filter came with it, which is the point — a type filter is a question about the *whole*
 * history, and asking it inside a summary panel means a creator filters to `payout`, sees three rows,
 * and cannot tell whether that is all of them.
 *
 * ## No balance, and no `useBalance`
 *
 * This screen shows no figure of its own, so it does not mount the balance query — but it does need
 * `useCurrency`, because a row's amount is converted into the reader's display unit and the two
 * screens must not disagree about which one that is. `useCurrency` reads the same query as
 * `/my-wallet`, so arriving here through the link costs no new request.
 *
 * ## This view owns the bar, which the sibling screens leave to their page
 *
 * The filter belongs in `PageBackBar`'s `actions` slot — the arrangement legacy's own top bar has,
 * and what that prop was drawn for. Its value is `useWalletLedger`'s state, which is client state,
 * so the bar cannot be composed in the server page above it. Hence the whole screen is one client
 * component and the page is a shell. `showHeader={false}` on the panel follows from the same
 * decision: the title is on the bar, and printing it again 8px below reads as a rendering bug.
 *
 * ## Signed-out is `isAuthenticated`, not a missing balance
 *
 * `/my-wallet` infers it from the balance provider (`!isKnown`), which this screen has no reason to
 * mount. `isBootstrapping` is what keeps the signed-out state from flashing on a cold load: the app
 * always ends up with *a* session, and until that has happened "no account" is not yet true.
 */
export function WalletTransactionHistoryView({ className }: { className?: string }) {
    const { t } = useTranslation()
    const { isAuthenticated, isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()
    const { currency, rate } = useCurrency()
    const {
        groups,
        entries,
        bonuses,
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

    const { select, detail } = useWalletEntryDetail({
        entries,
        displayCurrency: currency,
        rate,
        bonuses,
        // The node, not a slug — see `TeviCoinAppLink`, and `LedgerDetailDialog`'s `bonus.link`.
        bonusLink: <TeviCoinAppLink />,
    })

    /*
     * Changing the filter replaces the list, so a reader deep in a long one is put back at its top —
     * see `useScrollIntoViewOnChange` for why it is guarded on being scrolled past.
     */
    const panelRef = useRef<HTMLElement>(null)
    useScrollIntoViewOnChange(panelRef, filter, APP_BAR_HEIGHT)

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) fetchNextPage()
    }, [sentinelInView, fetchNextPage])

    const isSignedOut = !isBootstrapping && !isAuthenticated

    /*
     * The active filter's label, or `undefined` for "All" — which is the absence of a filter rather
     * than one of its values, so it must not light the trigger up.
     */
    const activeFilterOption = walletTransactionFilters().find(option => option.key === filter)
    const activeFilterLabel = filter && activeFilterOption ? t(activeFilterOption.label) : undefined

    return (
        <>
            {/*
             * The bar carries the *screen's* colour, not `--background`: below `md` the surface runs
             * edge to edge including behind this bar, and the list scrolls under it — a page-coloured
             * bar there shows rows sliding past the title. See `MY_WALLET_SCREEN`.
             */}
            <div className={cn('sticky top-0 z-20', MY_WALLET_SCREEN)}>
                <PageBackBar
                    title={t('balance_txn_title')}
                    /*
                     * Back goes to `/my-wallet` when there is no history to go back through — a
                     * shared link or a push notification opened this URL directly, and the wallet is
                     * the screen this page is a part of. `PageBackBar` defaults to `/`.
                     */
                    home={MY_WALLET_PATH}
                    className={MY_WALLET_CONTAINER}
                    actions={
                        /*
                         * Withheld while signed out and while the first page is loading: a filter
                         * over nothing is a control that cannot answer, and legacy shows the same
                         * `BtnFilter` unconditionally — which is how it offers a menu that silently
                         * does nothing on a ledger that failed to load.
                         */
                        !isSignedOut && !isLoading && !isError ? (
                            <FilterMenu
                                testId="my-wallet-history-filter"
                                options={walletTransactionFilters().map(option => ({
                                    key: option.key,
                                    label: t(option.label),
                                }))}
                                value={filter}
                                onChange={setFilter}
                                /* Unused: the supplied trigger brings its own name. Passed because
                                   the prop is required, and it is the right string if the trigger is
                                   ever dropped. */
                                triggerLabel={t('balance_txn_filter')}
                                /*
                                 * `compact` — the skin the channel Live tab's filter wears, which is
                                 * legacy's `iconBtnFilter`: 160 wide, label leading and a trailing
                                 * `check-all` in brand purple, a rule between rows. `FilterMenu`'s
                                 * own note has the table; the DS `Dropdown` port is the default and
                                 * is what these screens used to be on.
                                 */
                                variant="compact"
                                trigger={
                                    <BarIconButton
                                        data-testid="my-wallet-history-filter-trigger"
                                        name="sliders-simple"
                                        /*
                                         * The name **says which filter is on**, because the glyph
                                         * cannot: `sliders-simple` ships in one weight only, so
                                         * there is no filled form to swap to, and the fill below is
                                         * invisible to a screen reader. Same call
                                         * `/my-membership`'s bar filter makes.
                                         */
                                        label={
                                            activeFilterLabel
                                                ? t('balance_txn_filter_active', {
                                                      value: activeFilterLabel,
                                                  })
                                                : t('balance_txn_filter')
                                        }
                                        /*
                                         * A filter that is on has to look on: this bar shows the
                                         * page title, not the filter, so without a fill the only
                                         * signal is the ledger being shorter than expected.
                                         * `hover:not-disabled:` matches `BarIconButton`'s own
                                         * specificity, or its surface hover wins on pointer-over and
                                         * the button flashes back to looking unfiltered.
                                         */
                                        className={cn(
                                            activeFilterLabel &&
                                                'bg-(--brand) text-(--text-on-accent) hover:not-disabled:bg-(--brand)',
                                        )}
                                    />
                                }
                            />
                        ) : null
                    }
                />
            </div>

            <div className={cn(MY_WALLET_CONTAINER, 'flex flex-1 flex-col pb-6', className)}>
                {isSignedOut ? (
                    /*
                     * **The same surface the list sits on.** A state and the list it replaces are one
                     * object at both ends — see `MY_WALLET_PANEL`. `flex-1` on the box and on the
                     * state inside it, so a short message is centred in the space rather than pinned
                     * under the bar.
                     */
                    <div className={cn(MY_WALLET_PANEL, 'flex-1')}>
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            icon="wallet"
                            title={t('balance_wallet_signed_out_title')}
                            body={t('balance_wallet_signed_out_body')}
                            action={
                                <Button
                                    data-testid="my-wallet-history-sign-in"
                                    variant="primary"
                                    size="large"
                                    onClick={requireAuth(() => undefined)}
                                >
                                    {t('auth_sign_in')}
                                </Button>
                            }
                        />
                    </div>
                ) : (
                    <LedgerPanel
                        testId="my-wallet-history"
                        title={t('balance_txn_title')}
                        showHeader={false}
                        className="flex-1"
                        stickyTop={APP_BAR_HEIGHT}
                        fullBleed
                        pageSize={WALLET_LEDGER_PAGE_SIZE}
                        ref={panelRef}
                        groups={groups}
                        loading={isLoading}
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
                                            data-testid="my-wallet-history-retry"
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
                            isFilteredEmpty ? (
                                <ChannelEmptyState
                                    className={cn('flex-1', RISE)}
                                    art={MY_WALLET_ART.empty}
                                    title={t('balance_txn_filtered_empty_title')}
                                    body={t('balance_txn_filtered_empty_body')}
                                    action={
                                        <Button
                                            data-testid="my-wallet-history-clear-filter"
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
                        onRowPress={select}
                    />
                )}
            </div>

            {detail && <LedgerDetailDialog {...detail} />}
        </>
    )
}
