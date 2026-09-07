'use client'

import { useAuth, useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { MY_WALLET_PATH } from '@features/my-wallet/routes'
import { PageBackBar } from '@features/navigation'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { APP_BAR_HEIGHT } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { ListHeader, ListHeaderDesc, ListHeaderText, ListHeaderTitle } from '@shared/ui/list'
import { Loader } from '@shared/ui/loader'
import { useEffect } from 'react'
import { PAYOUT_PAGE_SIZE } from '../api/payout-api'
import { usePayoutRequests } from '../hooks/use-payout-requests'
import { PAYOUT_CONTAINER, PAYOUT_PANEL, PAYOUT_SCREEN } from '../lib/container'
import { PAYOUT_ART } from '../lib/illustrations'
import { PayoutRequestRow } from './payout-request-row'
import { PayoutRequestSkeleton } from './payout-request-skeleton'

/**
 * `/my-wallet/payout-tracking` — every payout request this account has made, newest first.
 *
 * ## The first of the five payout screens, and the shallowest on purpose
 *
 * It is read-only: one endpoint, no filter, no form. Building it first is what makes billy's payout
 * contract visible — the status vocabulary, the `net_amount`-as-a-string, the missing `count` — before
 * a screen that *spends* money has to depend on any of it.
 *
 * ## This view owns the bar, like `/my-wallet/transaction-history`
 *
 * Not because of a control in it — there is none — but because the whole screen is client-side anyway
 * (the list is a bearer's) and splitting the bar into the server page above would mean the skeleton
 * and the screen disagree about who draws it. `loading.tsx` draws its own static bar for the same
 * reason. `home` is `/my-wallet`, because a shared link or a push notification can open this URL with
 * no history behind it and the wallet is the screen this one is part of.
 *
 * ## Four states, the ledger's shape minus one
 *
 * Loading / error / signed-out / list. There is **no filtered-empty**: `payout-request/` takes no
 * filter, so "nothing here" has exactly one meaning and offering two messages for it would be
 * inventing a distinction the endpoint cannot make.
 */
export function PayoutTrackingView({ className }: { className?: string }) {
    const { t } = useTranslation()
    const { isAuthenticated, isBootstrapping } = useAuth()
    const requireAuth = useRequireAuth()
    const {
        groups,
        isLoading,
        isError,
        isEmpty,
        hasNextPage,
        isFetchingNextPage,
        fetchNextPage,
        refetch,
    } = usePayoutRequests()

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) fetchNextPage()
    }, [sentinelInView, fetchNextPage])

    const isSignedOut = !isBootstrapping && !isAuthenticated

    return (
        <>
            {/*
             * The bar carries the screen's own colour, not `--background`: below `md` the surface runs
             * edge to edge including behind this bar, and the list scrolls *under* it — a page-coloured
             * bar there would show rows sliding past the title. From `md` it returns to the page colour
             * and the panel below becomes the card.
             */}
            <div className={cn('sticky top-0 z-20', PAYOUT_SCREEN)}>
                <PageBackBar
                    title={t('payout_tracking_title')}
                    home={MY_WALLET_PATH}
                    className={PAYOUT_CONTAINER}
                />
            </div>

            <div className={cn(PAYOUT_CONTAINER, 'flex flex-1 flex-col pb-6', className)}>
                {isSignedOut || isError || isEmpty ? (
                    /*
                     * **The same surface the list sits on.** All four states share one ground, so the
                     * screen does not change shape depending on what it has to say — an empty state
                     * floating directly on `--background` while the list it replaces is a rounded card
                     * reads as a page that failed to load rather than one with nothing in it.
                     *
                     * `flex-1` on the card and the state inside it, so a short message is centred in
                     * the space rather than pinned under the bar.
                     */
                    <div className={cn(PAYOUT_PANEL, 'flex-1')}>
                        {isSignedOut ? (
                            <ChannelEmptyState
                                className={cn('flex-1', RISE)}
                                icon="bank"
                                title={t('payout_signed_out_title')}
                                body={t('payout_signed_out_body')}
                                action={
                                    <Button
                                        data-testid="payout-sign-in"
                                        variant="primary"
                                        size="large"
                                        onClick={requireAuth(() => undefined)}
                                    >
                                        {t('auth_sign_in')}
                                    </Button>
                                }
                            />
                        ) : isError ? (
                            <ChannelEmptyState
                                className={cn('flex-1', RISE)}
                                icon="exclamation-diamond"
                                tone="error"
                                title={t('payout_tracking_error_title')}
                                body={t('payout_tracking_error_body')}
                                action={
                                    <Button
                                        data-testid="payout-retry"
                                        variant="secondary"
                                        size="large"
                                        onClick={refetch}
                                    >
                                        {t('common_retry')}
                                    </Button>
                                }
                            />
                        ) : (
                            /*
                             * The **common** case, not an edge: this screen ships before the request
                             * flow it tracks does. So legacy's copy says what a payout request is and
                             * where it will appear, rather than "nothing here".
                             */
                            <ChannelEmptyState
                                className={cn('flex-1', RISE)}
                                art={PAYOUT_ART.empty}
                                title={t('payout_tracking_empty_title')}
                                body={t('payout_tracking_empty_body')}
                            />
                        )}
                    </div>
                ) : (
                    /*
                     * No card that expands as it reaches the top — and `LedgerPanel` no longer has
                     * one either. That mechanism (`useStuckAtTop`, now deleted) drove the treatment
                     * off a **scroll position**; `web-app` drives it off the **breakpoint** — its
                     * panel header is `#FFFFFF` below `md` and `#f4f4f4` from `md`, with no scroll
                     * listener anywhere. `LedgerPanel`'s `fullBleed` is that, and this screen states
                     * the same thing in `PAYOUT_SCREEN` / `PAYOUT_PANEL`.
                     */
                    <section aria-label={t('payout_tracking_title')} className={PAYOUT_PANEL}>
                        {isLoading ? (
                            <PayoutRequestSkeleton />
                        ) : (
                            (() => {
                                /*
                                 * A running index **across** the groups: a month header is a divider,
                                 * not a restart, so keying the stagger to the position within a group
                                 * would make the first row of every month animate at zero.
                                 */
                                let position = 0
                                return groups.map(group => (
                                    <div key={group.key} className="flex flex-col">
                                        {/*
                                         * `nested` — the DS's quieter header, right for a divider
                                         * inside a panel. Sticky below the bar, at the same offset
                                         * the ledger's month labels use.
                                         */}
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
                                        {group.rows.map((payout, index) => (
                                            <div
                                                data-testid="payout-row"
                                                data-payout-id={payout.id}
                                                key={payout.id}
                                                className={RISE}
                                                style={riseDelay(position++ % PAYOUT_PAGE_SIZE)}
                                            >
                                                <PayoutRequestRow
                                                    payout={payout}
                                                    rule={index > 0}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ))
                            })()
                        )}

                        {hasNextPage && (
                            <div
                                ref={sentinelRef}
                                // A loading mechanism, not content: the rows it brings in announce
                                // themselves.
                                aria-hidden="true"
                                className="flex items-center justify-center py-4"
                            >
                                {isFetchingNextPage && <Loader />}
                            </div>
                        )}
                    </section>
                )}
            </div>
        </>
    )
}
