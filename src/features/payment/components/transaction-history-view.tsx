'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { StarMark } from '@shared/components/star-mark'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime, formatLedgerMonth, ledgerMonthKey } from '@shared/lib/ledger-time'
import { formatPlainAmount, formatStarAmount } from '@shared/lib/money'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import {
    Alert,
    AlertActions,
    AlertContent,
    AlertIcon,
    AlertSubtitle,
    AlertTitle,
} from '@shared/ui/alert'
import { APP_BAR_HEIGHT } from '@shared/ui/app-bar'
import { Badge, type BadgeStatus } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { ListHeader, ListHeaderDesc, ListHeaderText, ListHeaderTitle } from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import { Skeleton } from '@shared/ui/skeleton'
import Image from 'next/image'
import { type CSSProperties, type ReactNode, useEffect, useMemo } from 'react'
import { TRANSACTIONS_PAGE_SIZE } from '../api/checkout-api'
import type { StarTransaction } from '../api/types'
import { useStarTransactions } from '../hooks/use-star-transactions'
import { GET_STAR_TRANSACTIONS_CONTAINER } from '../lib/container'
import {
    type TransactionStatus,
    transactionStatus,
    transactionStatusKey,
} from '../lib/transaction-status'

/** The badge's paint per state. `pending` is amber for the reason the slow checkout state is. */
const BADGE: Record<TransactionStatus, BadgeStatus> = {
    settled: 'success',
    pending: 'warning',
    failed: 'error',
}

/**
 * `/get-star/transaction-history` — the Star this account has bought, and whether each one went
 * through.
 *
 * ```
 *  ← Transaction history
 *  ┌──────────────────────────────────────────────────────┐
 *  │ [visa]  ★ 500  Completed                  ₫137,500   │
 *  │         Credit or Debit Card · 26 Aug 2026, 15:27    │
 *  └──────────────────────────────────────────────────────┘
 * ```
 *
 * ## Not the ledger on `/my-star`, and that is the whole reason it exists
 *
 * `/my-star` is billy's **balance movements** — Star arriving and leaving, whatever the reason. This
 * is paymee's **payments**: what was charged, through which gateway, and whether it settled. A top-up
 * that failed or is still pending produces no ledger entry at all, which makes it exactly the row
 * somebody opens this list to find, having been charged and not credited. Two endpoints, two
 * questions.
 *
 * ## A page, and the address is nested under the thing it is about
 *
 * `/get-star/transaction-history`, next to `/my-wallet/transaction-history` — the same words for the
 * same kind of list, under whichever screen owns it. It was a dialog first, on the argument that
 * somebody checking last week's top-up is in the middle of buying another one; a page wins anyway,
 * because this is a list somebody links to, bookmarks, sends to support with a transaction id in it,
 * and scrolls a long way down. A modal can do none of those.
 *
 * ## Four states, and the guest one is not the empty one
 *
 * Loading / error / signed-out / empty. Splitting the last two matters: an anonymous session is not
 * an account with no purchases, and `useStarTransactions` never asks on its behalf — so "no purchases
 * yet" would be a claim about somebody the request was never made for. The prompt gates the
 * **action** (`useRequireAuth` raises the login dialog) rather than redirecting, so the URL stays put
 * and signing in leaves the reader here. Same shape as `MyStarView`.
 *
 * ## The amounts, and which of them is authoritative
 *
 * Star is `top_up_quantity` — what was bought, before any bonus the backend adds. The fiat figure is
 * `payment.amount` in `payment.amount_currency`, printed as it arrived: this row is a **receipt**, so
 * nothing here re-derives it through `gatewayTotal`. A display total that disagreed with the charge
 * would be worse than no total.
 */
export function TransactionHistoryView() {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    const { isAuthenticated } = useAuth()
    const history = useStarTransactions()

    /*
     * The same pair `MyStarView` uses — a sentinel plus an effect, with `enabled` detached the moment
     * there is nothing left to fetch, so no observer is left attached to a callback that would do
     * nothing.
     */
    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: history.hasNextPage && !history.isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) history.fetchNextPage()
    }, [sentinelInView, history.fetchNextPage])

    return (
        <div className={cn(GET_STAR_TRANSACTIONS_CONTAINER, 'flex flex-1 flex-col md:pb-6')}>
            {renderBody()}
        </div>
    )

    function renderBody(): ReactNode {
        /*
         * Signed out **before** loading and before empty. The hook does not ask on an anonymous
         * session's behalf, so both of those would be describing a request that never happened.
         */
        if (!isAuthenticated) {
            return (
                <ChannelEmptyState
                    className={cn('flex-1 px-4', RISE)}
                    icon="clock"
                    title={t('payment_txn_signed_out_title')}
                    body={t('payment_txn_signed_out_body')}
                    action={
                        /*
                         * The action *is* the gate: `useRequireAuth` opens the login dialog when there
                         * is no real account, and by the time its callback could run there is nothing
                         * left to do — the branch unmounts.
                         */
                        <Button
                            data-testid="payment-history-sign-in"
                            variant="primary"
                            size="large"
                            onClick={requireAuth(() => undefined)}
                        >
                            {t('auth_sign_in')}
                        </Button>
                    }
                />
            )
        }

        if (history.isLoading) return <TransactionSkeleton />

        if (history.isError) {
            return (
                <Alert className={cn('mx-4 md:mx-0', RISE)} status="error">
                    <AlertIcon status="error" />
                    <AlertContent>
                        <AlertTitle>{t('payment_txn_error_title')}</AlertTitle>
                        <AlertSubtitle>{t('payment_txn_error_body')}</AlertSubtitle>
                        <AlertActions>
                            <Button
                                data-testid="payment-history-retry"
                                variant="secondary"
                                size="medium"
                                onClick={history.refetch}
                            >
                                {t('common_retry')}
                            </Button>
                        </AlertActions>
                    </AlertContent>
                </Alert>
            )
        }

        if (history.isEmpty) {
            return (
                <ChannelEmptyState
                    className={cn('flex-1 px-4', RISE)}
                    icon="clock"
                    title={t('payment_txn_empty_title')}
                    body={t('payment_txn_empty_body')}
                />
            )
        }

        return (
            <div className="flex flex-1 flex-col">
                <TransactionList rows={history.rows} />

                {history.hasNextPage && (
                    <div ref={sentinelRef} className="flex justify-center py-3">
                        {history.isFetchingNextPage && <Loader />}
                    </div>
                )}
            </div>
        )
    }
}

/**
 * One purchase. Two lines, because the five fields split cleanly into "what" and "how".
 *
 * Exported on its own for the reason `LedgerRow` is: the real screen needs a signed-in account that
 * has actually bought Star, so `/dev/get-star` is the only place the three statuses and a gateway
 * with no logo can be seen side by side.
 *
 * It reads `useTranslation()` itself rather than taking `t` as a prop — a translated component that
 * has to be handed its translator is one a preview cannot render without borrowing the caller's.
 */
export function TransactionRow({
    row,
    rule,
    className,
    style,
}: {
    row: StarTransaction
    /** Draw the hairline above this row — every row but the first in its month. */
    rule?: boolean
    className?: string
    style?: CSSProperties
}) {
    const { t, currentLanguage: locale } = useTranslation()
    const status = transactionStatus(row.status)
    const method = row.payment?.payment_method
    const logo = method?.images[0] ?? null
    const when = formatLedgerDateTime(row.created_at ? Date.parse(row.created_at) : null, locale)
    const currency = row.payment?.amount_currency
    const paid = row.payment
        ? `${formatPlainAmount(row.payment.amount, locale)}${currency ? ` ${currency}` : ''}`
        : null

    return (
        <li
            className={cn(
                'flex items-center gap-3 px-4 py-3',
                /*
                 * A hairline **inset to the text column**, not a full-bleed rule: it separates the
                 * rows, and running it under the 32px mark column would cut the leading glyphs off
                 * from the row they belong to. `ListRowRule` does the same in the DS.
                 */
                rule && 'border-(--separator-default) border-t',
                className,
            )}
            style={style}
        >
            {/*
             * The gateway's own mark when it ships one, and a neutral glyph when it does not — legacy
             * reads `images[0]` unguarded, so a gateway with an empty array renders a broken image.
             */}
            <span className="flex size-8 flex-none items-center justify-center">
                {logo ? (
                    <Image
                        src={logo}
                        alt=""
                        aria-hidden
                        width={28}
                        height={28}
                        className="h-7 w-7 rounded-(--radius-sm) object-contain"
                    />
                ) : (
                    <Icon name="wallet" size={20} className="text-(--icon-secondary)" />
                )}
            </span>

            <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="flex flex-none items-center gap-1">
                        <StarMark size={14} />
                        <span className="type-dense-strong text-(--text-title) tabular-nums">
                            {formatStarAmount(row.top_up_quantity, locale)}
                        </span>
                    </span>
                    <Badge size="small" status={BADGE[status]}>
                        {t(transactionStatusKey(status))}
                    </Badge>
                </span>
                {/*
                 * ## The date drops to its own line below `md`
                 *
                 * `Credit or Debit Card (USD) · Aug 26, 2026, 02:02 AM` is ~230px of text, and on a
                 * 390px phone the row has about 190 left for it after the mark, the badge column and
                 * the amount — so joined into one line the **method name** is what elides, and the
                 * method is the half somebody is scanning for. Stacked, each gets the full width.
                 *
                 * From `md` the column is 612 and both fit on one line, which is where the `·` earns
                 * its place: it is a separator between two things on a line, so it is drawn only when
                 * there is a line to separate. `aria-hidden` because a screen reader reads two
                 * elements as two things already.
                 */}
                <span className="flex min-w-0 flex-col md:flex-row md:items-baseline md:gap-1">
                    {method?.name && (
                        <span className="type-caption-meta min-w-0 truncate text-(--text-subtitle)">
                            {method.name}
                        </span>
                    )}
                    {method?.name && when && (
                        <span
                            aria-hidden
                            className="type-caption-meta hidden flex-none text-(--text-subtitle) md:inline"
                        >
                            ·
                        </span>
                    )}
                    {when && (
                        <span className="type-caption-meta flex-none truncate text-(--text-subtitle)">
                            {when}
                        </span>
                    )}
                </span>
            </div>

            {paid && (
                <span className="type-dense-strong flex-none text-(--text-title) tabular-nums">
                    {paid}
                </span>
            )}
        </li>
    )
}

/**
 * The purchases themselves — **props only**, so `/dev/get-star` can render the month headers and the
 * three statuses without an account that has actually bought Star. Same split, and the same reason,
 * as `shared/components/ledger`: the panel knows nothing about paymee, and the screen that owns the
 * request hands it finished rows.
 *
 * Grouped by month the way `/my-star` and `/my-wallet` group theirs — a purchase history is read by
 * "when", and an ungrouped stack makes the reader do the bucketing.
 */
export function TransactionList({ rows }: { rows: StarTransaction[] }) {
    const { t, currentLanguage } = useTranslation()
    const groups = useMemo(
        () => groupByMonth(rows, currentLanguage, t('payment_txn_undated')),
        [rows, currentLanguage, t],
    )

    /*
     * A **running** index across the groups, not within one: a month header is a divider, not a
     * restart, so basing the stagger on the position in a group would make the first row of every
     * month animate at zero and the ramp would visibly reset mid-list. `% pageSize` is what stops a
     * scroll-appended page from arriving half a second late — `ledger.tsx` settled on exactly this
     * pair, for exactly this shape of list.
     */
    let position = 0

    return (
        /*
         * One panel, not a stack of bordered boxes — the grammar `/my-star` and `/my-wallet` already
         * use for a list of movements.
         *
         * ⚠ `overflow-clip`, never `overflow-hidden`. The two clip identically and respect the radius
         * identically, but `hidden` makes the box a **scroll container**, and the month headers inside
         * would then resolve their `sticky` against a port that never scrolls — so they would scroll
         * away with the rows. Measured and recorded in `ledger.tsx`.
         */
        <div className="flex flex-col overflow-clip bg-(--background-surface) md:rounded-xl">
            {groups.map(group => (
                <div key={group.key} className="flex flex-col">
                    {/*
                     * `top` clears the page's own back bar (60, `APP_BAR_HEIGHT`), which is sticky
                     * above this. `top-0` would park the label *under* it — the trap `ledger.tsx`
                     * documents, invisible in a screenshot and only ever seen while scrolling.
                     */}
                    {group.label && (
                        <ListHeader
                            variant="nested"
                            rule={false}
                            style={{ top: APP_BAR_HEIGHT }}
                            className="sticky z-[1] bg-(--background-surface)"
                        >
                            <ListHeaderDesc>
                                <ListHeaderText>
                                    <ListHeaderTitle>{group.label}</ListHeaderTitle>
                                </ListHeaderText>
                            </ListHeaderDesc>
                        </ListHeader>
                    )}
                    <ul className="m-0 flex list-none flex-col p-0">
                        {group.rows.map((row, index) => (
                            <TransactionRow
                                key={row.id}
                                row={row}
                                rule={index > 0}
                                className={RISE}
                                style={riseDelay(position++ % TRANSACTIONS_PAGE_SIZE)}
                            />
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    )
}

/** A month's worth of purchases. The trailing group carries the undated label instead of a month. */
interface TransactionGroup {
    key: string
    label: string
    rows: StarTransaction[]
}

/**
 * Bucket the rows by the month they were paid in, keeping the server's order inside each bucket.
 *
 * The **key is locale-independent** (`ledgerMonthKey`) and only the label is formatted, so switching
 * language re-labels the groups rather than re-bucketing them — the rule `useStarLedger` states.
 *
 * Rows the backend sent with no usable `created_at` collect into a single trailing group under its
 * **own label**. Leaving that group unlabelled was the first attempt and it was worse than the
 * problem it avoided: an undated row rendered directly under *July 2026* reads as a July purchase,
 * which is the guess-printed-next-to-an-amount this exists to prevent. The label is passed in rather
 * than looked up here so the helper stays pure and testable.
 */
function groupByMonth(
    rows: StarTransaction[],
    locale: string,
    undatedLabel: string,
): TransactionGroup[] {
    const groups: TransactionGroup[] = []
    const byKey = new Map<string, TransactionGroup>()
    const undated: StarTransaction[] = []

    for (const row of rows) {
        const at = row.created_at ? Date.parse(row.created_at) : Number.NaN
        if (!Number.isFinite(at)) {
            undated.push(row)
            continue
        }
        const key = ledgerMonthKey(at)
        let group = byKey.get(key)
        if (!group) {
            group = { key, label: formatLedgerMonth(at, locale), rows: [] }
            byKey.set(key, group)
            groups.push(group)
        }
        group.rows.push(row)
    }

    if (undated.length > 0) groups.push({ key: 'undated', label: undatedLabel, rows: undated })
    return groups
}

/**
 * Three rows at the real geometry — `p-3`, a 28px mark, a 21px line over an 18px one — so the list
 * does not jump when it lands. Each box paints `--background-surface` explicitly: the dark-mode trap
 * `card-management-skeleton.tsx` records, where the default fill is `--black` in Dark only.
 */
export function TransactionSkeleton() {
    return (
        <div
            aria-busy="true"
            className="flex flex-col overflow-clip bg-(--background-surface) md:rounded-xl"
        >
            {Array.from({ length: 3 }, (_, index) => `txn-skeleton-${index}`).map((key, index) => (
                <div
                    key={key}
                    className={cn(
                        'flex items-center gap-3 px-4 py-3',
                        index > 0 && 'border-(--separator-default) border-t',
                    )}
                >
                    <Skeleton w={28} h={28} delay={index * 160} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex h-[21px] items-center">
                            <Skeleton w={120} delay={index * 160} />
                        </div>
                        {/*
                         * Two sub-lines below `md`, one from `md` up — the row itself stacks the
                         * method and the date there, so a single-line skeleton would be ~18px short
                         * on a phone and the list would jump by that much per row when it lands.
                         */}
                        <div className="flex h-[18px] items-center">
                            <Skeleton w={140} delay={index * 160} />
                        </div>
                        <div className="flex h-[18px] items-center md:hidden">
                            <Skeleton w={168} delay={index * 160} />
                        </div>
                    </div>
                    <div className="flex h-[21px] items-center">
                        <Skeleton w={72} delay={index * 160} />
                    </div>
                </div>
            ))}
        </div>
    )
}
