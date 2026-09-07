'use client'

import { useRequireAuth } from '@features/auth'
import { useBalance, useBalanceDisplay } from '@features/balance'
import { ChannelEmptyState } from '@features/channel'
import { GET_STAR_PATH } from '@features/payment/routes'
import type { ActionRow } from '@shared/components/action-rows'
import { ActionRows, ActionRowsSkeleton } from '@shared/components/action-rows'
import { FilterMenu } from '@shared/components/filter-menu'
import { LedgerPanel } from '@shared/components/ledger'
import { LedgerDetailDialog } from '@shared/components/ledger-detail-dialog'
import { useInView } from '@shared/hooks/use-in-view'
import { useScrollIntoViewOnChange } from '@shared/hooks/use-scroll-into-view-on-change'
import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY } from '@shared/lib/money'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { APP_BAR_HEIGHT } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { useEffect, useRef } from 'react'
import { STAR_LEDGER_PAGE_SIZE } from '../api/star-ledger-api'
import { useStarEntryDetail } from '../hooks/use-star-entry-detail'
import { useStarLedger } from '../hooks/use-star-ledger'
import { MY_STAR_ART } from '../lib/illustrations'
import { ALL_STAR_TRANSACTIONS, starTransactionFilters } from '../lib/star-transaction-types'
import { GIFT_STAR_PATH } from '../routes'
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
    const {
        star,
        isKnown,
        isLoading: isBalanceLoading,
        isError: isBalanceError,
        refresh,
    } = useBalance()
    /*
     * Two different things called `star`, and both are needed here. The provider's is the **number**,
     * which is what decides whether there is anything to gift; `useBalanceDisplay`'s is the **string**
     * the hero card prints, already `—` when the figure is unknown. Aliased rather than renamed at the
     * card, so the one that reaches the screen keeps the plainer name.
     */
    const { star: starDisplay } = useBalanceDisplay()
    const {
        groups,
        entries,
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
    /*
     * `DEFAULT_CURRENCY` and `rate: 1` are inert here, exactly as they are in `useStarLedger` — a
     * Star figure is not converted, so `formatLedgerAmount` branches on the row's own unit before it
     * ever reads either. See that hook's note on why they are passed rather than made optional.
     */
    const { select, detail } = useStarEntryDetail({
        entries,
        displayCurrency: DEFAULT_CURRENCY,
        rate: 1,
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

    /*
     * Built once, and the active row is looked up in the very list the menu renders — so the
     * trigger's accessible name and the ticked row cannot drift apart. `ALL_STAR_TRANSACTIONS` is
     * the *absence* of a filter rather than one of its values, so it names nothing and lights
     * nothing up. Same shape as `/my-wallet/transaction-history`'s.
     */
    const filterOptions = starTransactionFilters().map(option => ({
        key: option.key,
        label: t(option.label),
    }))
    const activeFilterLabel =
        filter === ALL_STAR_TRANSACTIONS
            ? undefined
            : filterOptions.find(option => option.key === filter)?.label

    /*
     * Both rows go somewhere now, and both are plain `href`s: *Get more Star* to `/get-star` and *Gift
     * Star* to `/gift-star`. They sit next to each other and do the same kind of thing, so their
     * addresses have the same shape — `features/payment/routes.ts` carries the rule, and
     * `CreatorPickerView` records why Gift Star stopped being a dialog.
     *
     * `GET_STAR_PATH` comes from `@features/payment/routes`, the import-free module, and not from that
     * feature's barrel: this file is a client component that would otherwise pull the whole payment
     * graph — Stripe's loader included — into `/my-star`'s chunk to read one string. `GIFT_STAR_PATH`
     * is this feature's own `./routes`, which is where its addresses live.
     *
     * Neither row is behind `useRequireStars`: both are **navigations**, and the gift itself happens
     * inside `features/donation` on whichever space the picker sends the reader to. That guard is for
     * the point a price is actually paid.
     *
     * ## Gift Star is dimmed at a zero balance, and only when the figure is **known**
     *
     * Legacy's rule (`disabled={!balanceTVS}` on the same row): there is no point choosing who to gift
     * Star to with none to give. Ported, with one narrowing that legacy does not make — `isKnown`. Its
     * `balanceTVS` is falsy while the request is in flight *and* after it fails, so a 502 dims the row
     * for the rest of the session; here a failure leaves the row pressable, which is the rule
     * `features/permission` states in general terms and this screen already follows for its ledger: a
     * failure is not a denial.
     *
     * Tile colours are the comp's: warning for Get more Star, indigo for Gift Star.
     *
     * ## Both glyphs are **filled**, which is legacy's and was the port's mistake
     *
     * `balanceCard/index.js` draws `IconStarFilled` and `IconGift`, and both are single solid paths —
     * `IconStarFilled`'s is byte-identical to the sprite's `star--filled`. This shipped as outline
     * `plus-circle` and outline `gift-simple` instead, which is also the wrong shape for the surface:
     * a `ListLeadingTile` is a **solid colour with a `--white` glyph knocked out of it**, and an
     * outline glyph on one reads as a hairline drawing floating on a block rather than as a mark.
     *
     * `star`, not `plus-circle` — the row says *Get Star*, and the plus was standing in for the
     * subject with the action. The `+` affordance it was carrying belongs to the top bar's pill,
     * which is a control with no room for a word.
     *
     * The bare ids would not do it: `star` aliases `star--regular` in the sprite, so the filled
     * drawing has to be asked for by weight. `ActionRowGlyph` is what makes that a checked pair.
     */
    const rows: ActionRow[] = [
        {
            key: 'balance_action_get_star',
            label: t('balance_action_get_star'),
            icon: 'star',
            iconWeight: 'filled',
            tile: 'var(--accents-warning-active)',
            href: GET_STAR_PATH,
        },
        {
            key: 'balance_action_gift_star',
            label: t('balance_action_gift_star'),
            icon: 'gift-simple',
            iconWeight: 'filled',
            tile: 'var(--accents-indigo-active)',
            href: GIFT_STAR_PATH,
            disabledReason: isKnown && star <= 0 ? t('balance_gift_star_none') : undefined,
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
                            data-testid="my-star-sign-in"
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
                <ActionRowsSkeleton data-testid="my-star-actions-loading" count={2} />
            ) : (
                <>
                    {/* `star` is already `—` when the figure is unknown — that decision belongs to the
                        provider, not to this screen. See `useBalanceDisplay`. */}
                    <StarBalanceCard label={t('balance_star_label')} value={starDisplay} />
                    <ActionRows
                        testId="my-star-actions"
                        rows={rows}
                        unavailableLabel={t('balance_action_unavailable')}
                    />
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
                    <Button
                        data-testid="my-star-refresh"
                        variant="secondary"
                        size="small"
                        onClick={() => void refresh()}
                    >
                        {t('common_retry')}
                    </Button>
                </div>
            )}

            <LedgerPanel
                testId="my-star-ledger"
                title={t('balance_txn_title')}
                className="flex-1"
                /*
                 * The page's own `PageBackBar` is sticky and 60px tall, so the panel header parks below
                 * it instead of under it. See `LedgerPanel`'s note on `stickyTop`.
                 */
                stickyTop={APP_BAR_HEIGHT}
                fullBleed
                pageSize={STAR_LEDGER_PAGE_SIZE}
                ref={panelRef}
                groups={groups}
                loading={isLoading}
                action={
                    <FilterMenu
                        testId="my-star-filter"
                        options={filterOptions}
                        value={filter}
                        onChange={setFilter}
                        /*
                         * On, so it looks on — and **says so**, because the glyph cannot:
                         * `sliders-simple` ships in one weight, so there is no filled form to swap
                         * to, and the brand ink below is invisible to a screen reader. The same call
                         * `/my-wallet/transaction-history` and `/my-membership` make on their bar
                         * triggers; only the treatment differs, since a 24px glyph has no disc to
                         * fill. `ALL_STAR_TRANSACTIONS` is this list's "everything" row.
                         */
                        active={filter !== ALL_STAR_TRANSACTIONS}
                        triggerLabel={
                            activeFilterLabel
                                ? t('balance_txn_filter_active', { value: activeFilterLabel })
                                : t('balance_txn_filter')
                        }
                        /*
                         * `compact`, matching the channel Live tab's filter — see the note at
                         * `/my-wallet/transaction-history`'s call site. The trigger stays the
                         * default 24px glyph: this one sits in a `ListHeaderAction` on a 48-tall
                         * header, whose own padding is the target, rather than in a page bar.
                         */
                        variant="compact"
                        icon="sliders-simple"
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
                                <Button
                                    data-testid="my-star-retry"
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
                                    data-testid="my-star-clear-filter"
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
                onRowPress={select}
            />

            {detail && <LedgerDetailDialog {...detail} />}
        </div>
    )
}
