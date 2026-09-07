'use client'

import { useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { MY_WALLET_PATH } from '@features/my-wallet/routes'
import { PageBackBar } from '@features/navigation'
import { useInView } from '@shared/hooks/use-in-view'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { PayoutConfigRow } from '../api/config-types'
import { usePayoutConfigs } from '../hooks/use-payout-configs'
import { PAYOUT_CARD_CONTAINER } from '../lib/container'
import { SETUP_PAYOUTS_PATH } from '../routes'
import { PayoutMethodDetailDialog } from './payout-method-detail-dialog'
import { PayoutMethodRow } from './payout-method-row'
import { PayoutMethodSkeleton } from './payout-method-skeleton'
import { PayoutTermsNote } from './payout-terms-note'

/**
 * `/my-wallet/payout-method` — the destinations this account can be paid to.
 *
 * ## A card stack on the page colour, which is what makes it *not* a single-panel screen
 *
 * The first cut put the items in one full-bleed panel (`docs/DESIGN_SYSTEM.md` §6). Wrong screen for
 * that rule: legacy draws each method as its own 16px `Paper` on `#f4f4f4` with 12px between them, and
 * a stack of cards is precisely the shape §6 exempts — `MY_WALLET_SCREEN` draws the same line one
 * level up, where a hero card, an alert and three action rows sit on page colour with the gaps showing
 * through. So the screen keeps `--background` at every width and the cards carry the surface.
 *
 * ## The action sits at the end of the list and sticks to the bottom
 *
 * `sticky bottom-0`, which is legacy's own (`position: sticky; bottom: 0` on its action grid item) and
 * behaves as both readings of "put it where it belongs": with two methods it sits directly under the
 * last card, and with twenty it stays above the fold instead of being a scroll away. It is **not**
 * pushed down by a growing panel — that was the earlier arrangement and it left the button stranded at
 * the bottom of a mostly empty screen.
 *
 * It carries its own page-coloured background and bleeds past the column's gutter below `md`, or the
 * cards scroll visibly *through* it.
 *
 * ## The empty state is a screen, not a redirect
 *
 * Legacy `history.replaceState`s to `/my-wallet/setup-payouts` when the list comes back empty. Three
 * things are wrong with that and all three are user-visible: it rewrites the URL **without telling
 * Next**, so the router's idea of the route and the address bar disagree until the next navigation; it
 * fires on the *unfiltered* list, so an account whose only method is `deleted` is bounced too; and it
 * makes Back useless — you land on setup, press Back, and arrive at a screen that immediately throws
 * you forward again.
 *
 * So an empty list says so and offers the same button the populated one does.
 *
 * ## One dialog, kept mounted, holding the card it was opened for
 *
 * The detail lives in a dialog per legacy, but there is **one** of it rather than one per card: a
 * dialog inside a list item is a portal per item, and the removal has to survive the item unmounting
 * (which is exactly what a successful removal does). The open row is held here in state.
 */
export function PayoutMethodView({ className }: { className?: string }) {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    const {
        methods,
        isLoading,
        isError,
        isEmpty,
        isSignedOut,
        hasNextPage,
        isFetchingNextPage,
        loadMore,
        refetch,
        isRemoving,
        remove,
    } = usePayoutConfigs()

    const [openMethod, setOpenMethod] = useState<PayoutConfigRow | null>(null)

    const [sentinelRef, sentinelInView] = useInView<HTMLDivElement>({
        enabled: hasNextPage && !isFetchingNextPage,
    })

    useEffect(() => {
        if (sentinelInView) loadMore()
    }, [sentinelInView, loadMore])

    /*
     * The open dialog follows the list: after a removal the row it was opened for is gone from the
     * cache, and after a refetch its figures have moved. Reading the *current* row by id rather than
     * holding a snapshot means the dialog can never show a daily remainder the list disagrees with.
     */
    const current = openMethod ? (methods.find(row => row.id === openMethod.id) ?? null) : null

    /** The states that replace the list. All three are one block, so all three are one card. */
    const state = isSignedOut ? (
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="bank"
            title={t('payout_signed_out_title')}
            body={t('payout_signed_out_body')}
            action={
                <Button
                    data-testid="payout-method-sign-in"
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
            title={t('payout_method_error_title')}
            body={t('payout_method_error_body')}
            action={
                <Button
                    data-testid="payout-method-retry"
                    variant="secondary"
                    size="large"
                    onClick={refetch}
                >
                    {t('common_retry')}
                </Button>
            }
        />
    ) : isEmpty ? (
        /*
         * The common first state, not an edge: a creator arrives here with nothing saved. So the copy
         * says what a payout method is *for*, and the action is the one thing to do about it — which is
         * also why the sticky button below is hidden in this state rather than offered twice.
         */
        <ChannelEmptyState
            className={cn('flex-1', RISE)}
            icon="bank"
            title={t('payout_method_empty_title')}
            body={t('payout_method_empty_body')}
            action={
                <Button
                    data-testid="payout-method-add-empty"
                    variant="accent"
                    size="large"
                    render={<Link href={SETUP_PAYOUTS_PATH} />}
                >
                    {t('payout_method_add')}
                </Button>
            }
        />
    ) : null

    return (
        <>
            {/* Page-coloured, like the cards' ground and like `/my-wallet`'s bar: there is no panel
                here for the bar to continue, so a surface-coloured bar would draw a seam. */}
            <div className="sticky top-0 z-20 bg-(--background)">
                <PageBackBar
                    title={t('payout_method_title')}
                    // `/my-wallet`, for `PayoutTrackingView`'s reason: this URL can be opened cold.
                    home={MY_WALLET_PATH}
                    className={PAYOUT_CARD_CONTAINER}
                />
            </div>

            <div
                className={cn(PAYOUT_CARD_CONTAINER, 'flex flex-1 flex-col gap-3 pb-6', className)}
            >
                {state ? (
                    // The states get the card treatment the items have, so a screen with nothing on it
                    // is still the same object as a screen with two methods on it.
                    <div className="flex flex-1 flex-col rounded-2xl bg-(--background-surface)">
                        {state}
                    </div>
                ) : isLoading ? (
                    <PayoutMethodSkeleton />
                ) : (
                    <>
                        <section
                            aria-label={t('payout_method_title')}
                            className="flex flex-col gap-3"
                        >
                            {methods.map((method, index) => (
                                <div
                                    key={method.id}
                                    className={RISE}
                                    style={riseDelay(Math.min(index, 5))}
                                >
                                    <PayoutMethodRow
                                        method={method}
                                        onOpen={() => setOpenMethod(method)}
                                    />
                                </div>
                            ))}
                        </section>
                        {hasNextPage && (
                            <div
                                ref={sentinelRef}
                                // A loading mechanism, not content — the cards announce themselves.
                                aria-hidden="true"
                                className="flex items-center justify-center py-2"
                            >
                                {isFetchingNextPage && <Loader />}
                            </div>
                        )}
                        {/*
                         * Directly under the last card, and `sticky bottom-0` so a long list keeps it
                         * reachable — legacy's own arrangement, and the one that reads right at both
                         * lengths. **No `mt-auto`**: pushing it to the bottom of the viewport is what
                         * it did first, and with two methods that leaves a button floating alone under
                         * 600px of empty page, related to nothing.
                         *
                         * The negative gutter lets its background cover the cards passing underneath
                         * at the phone's edges; without it they scroll visibly through the button.
                         */}
                        <div className="-mx-4 sticky bottom-0 flex flex-col gap-2 bg-(--background) px-4 pt-3 pb-2 md:mx-0 md:px-0">
                            <Button
                                data-testid="payout-method-add"
                                variant="accent"
                                size="large"
                                render={<Link href={SETUP_PAYOUTS_PATH} />}
                                className="w-full"
                            >
                                <Icon name="plus" size={20} aria-hidden />
                                {t('payout_method_add')}
                            </Button>
                            <PayoutTermsNote testId="payout-method-terms" />
                        </div>
                    </>
                )}
            </div>

            <PayoutMethodDetailDialog
                method={current}
                open={Boolean(current)}
                onOpenChange={next => {
                    if (!next) setOpenMethod(null)
                }}
                isRemoving={isRemoving}
                onRemove={remove}
            />
        </>
    )
}
