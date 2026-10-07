'use client'

import { useAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { GetAppDialog } from '@shared/components/get-app-dialog'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import {
    Alert,
    AlertActions,
    AlertContent,
    AlertIcon,
    AlertSubtitle,
    AlertTitle,
} from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Loader } from '@shared/ui/loader'
import { type ReactNode, useState } from 'react'
import { useGetStar } from '../hooks/use-get-star'
import { GET_STAR_CONTAINER } from '../lib/container'
import { formatCharge, gatewayFeeCharge } from '../lib/gateway-fee'
import { GatewayAccordion } from './gateway-accordion'
import { GetStarHeader } from './get-star-header'
import { GetStarSkeleton } from './get-star-skeleton'

/**
 * `/get-star` — everything below the page's back bar.
 *
 * ```
 *  Get Star                    ↺ Transaction history
 *  Stars will be sent directly to you
 *  ──────────────────────────────────────────────
 *  (face) Wondercat @wondercat            ★ 8,734
 *         ID: 1107201702           Current star balance
 *
 *  Payment method
 *  ┌ [visa][mc] Card                 ≈ $0.011 each  ⌃ ┐
 *  │ ┌ ★ 100 ──┐ ┌ ★ 500 ──┐ ┌ ★ 1,000 ┐ ┌ ★ 5,000 ┐   │
 *  └──────────────────────────────────────────────────┘
 *  ┌ MoMo                              ≈ 280 ₫ each  ⌄ ┐
 *  ─────────────────────────────────────────────
 *  Total                                  $10.29   ← sticky
 *  [                Pay $10.29               ]
 * ```
 *
 * ## One accordion per gateway, as legacy draws it
 *
 * Each payment method is a card, and the open one holds the package grid priced in **that** method's
 * currency, fee included — legacy's `getStar/content/accordions`. An earlier pass split the two
 * choices into a grid and a separate method list; it was reverted to legacy's shape, where comparing
 * methods is opening another card and reading the same tiles' prices. `GatewayAccordion` records what
 * still differs from legacy (no order-summary dialog; folding a card keeps its gateway chosen).
 *
 * The sheet (`StarPurchaseDialog`) keeps its three steps and the flat lists: a 400px dialog is the
 * wrong place for eight tiles per method.
 *
 * ## What is on screen is what will be charged
 *
 * The total is `gatewayTotal` — package price plus that gateway's fee, converted and rounded to its
 * `min_unit`. It sits **with** the button rather than in a receipt row three lines up, because it is
 * the figure the press commits to. When no conversion rate came back the figure stays in USD and says
 * so (`payment_total_usd_note`) rather than being labelled with the gateway's currency — the
 * mislabelling `gatewayTotal` documents legacy doing.
 *
 * ## Four states, and a guest is not one of them
 *
 * Loading / error / empty / ready. Being signed out does **not** replace the screen: the catalogue is
 * public, the prices are the reason somebody came, and `useRequireStars`-style gating belongs on the
 * press. Pressing Pay as a guest opens the login dialog and the URL does not move
 * (`docs/DEFINITION_OF_DONE.md` §3) — the same shape `MyStarView` uses for its own signed-out case,
 * except that screen has nothing to show a guest and this one does.
 *
 * The balance prints `—` rather than `0` when it is not known, per `useBalance`'s own rule: a
 * fabricated zero on a page about money is worse than an admitted blank.
 *
 * ## Nothing here draws the payment
 *
 * The card form, the redirect, the settle poll and the verdict are all `PaymentProvider`'s, mounted
 * above every route — which is what lets a 3DS hop leave this page and come back to a document where
 * it was never rendered. This view's last act is `pay()`.
 */
export function GetStarView() {
    const { t, currentLanguage } = useTranslation()
    const { isAuthenticated } = useAuth()
    const flow = useGetStar()

    const feeCharge = gatewayFeeCharge(flow.selected?.price ?? 0, flow.gateway)

    return (
        <div className={cn(GET_STAR_CONTAINER, 'flex flex-1 flex-col gap-4 pb-6 md:gap-6')}>
            {/*
             * Outside `renderBody`, so it is on screen before either catalogue answers.
             *
             * Nothing in its top half depends on a request — the heading and the note are static and
             * the history link is a path — so putting it behind `isLoading` made the reader wait on
             * `payment-methods/` to be told what page they are on, and kept it out of the server's
             * HTML entirely. The account row inside it has its own unknown state and does not need
             * this one.
             */}
            <GetStarHeader />
            {renderBody()}
        </div>
    )

    function renderBody(): ReactNode {
        if (flow.isLoading) return <GetStarSkeleton />

        if (flow.isError) {
            return (
                <Alert className={RISE} status="error">
                    <AlertIcon status="error" />
                    <AlertContent>
                        <AlertTitle>{t('payment_packages_error_title')}</AlertTitle>
                        <AlertSubtitle>{t('payment_packages_error_body')}</AlertSubtitle>
                        <AlertActions>
                            <Button
                                data-testid="payment-get-star-retry"
                                variant="secondary"
                                size="medium"
                                onClick={flow.retry}
                            >
                                {t('common_retry')}
                            </Button>
                        </AlertActions>
                    </AlertContent>
                </Alert>
            )
        }

        /*
         * The catalogue answered and held nothing — legacy's `NotSupported`. Its own component, so
         * `/dev/get-star` can render it: it is reachable on the real page only from a region with no
         * gateway enabled, which is to say only by intercepting the network.
         */
        if (flow.isEmpty) return <StarCatalogueUnavailable />

        return (
            <div className="flex flex-1 flex-col gap-4 md:gap-6">
                {/* Only when somebody was sent here by a gap: it is what makes the pre-selected tile
                    legible as an answer rather than a guess. */}
                {flow.shortfall > 0 && (
                    <p className="type-dense-default m-0 text-(--text-subtitle)">
                        {t('payment_shortfall_hint', {
                            amount: formatStarAmount(flow.shortfall, currentLanguage),
                        })}
                    </p>
                )}

                {/*
                 * The accordion goes inert while the machine is working. Not for tidiness: the order was
                 * built from this selection and is already at the gateway, so a tile pressed now would
                 * change what the page claims is being bought while the reader is being charged for
                 * something else.
                 */}
                <GatewayAccordion
                    gateways={flow.gateways}
                    selected={flow.gateway}
                    onSelect={flow.selectGateway}
                    packages={flow.packages}
                    selectedPackage={flow.selected}
                    onSelectPackage={flow.select}
                    disabled={flow.isCheckoutBusy}
                />

                {/*
                 * `sticky bottom-0`, and `mt-auto` so it sits at the foot of a short page instead of
                 * halfway up it. **No offset for the mobile tab bar**: `TabBarShell` renders that bar,
                 * and its reserve, only on the four tab destinations, and `/get-star` is not one
                 * — holding an offset here would push the button up over content that cannot be
                 * scrolled into view (`follow-requests-view.tsx` measured that).
                 *
                 * `-mx-4 px-4 md:mx-0 md:px-0` undoes the column's phone inset: a bar that spans the
                 * window is the one thing on this screen that should touch both edges.
                 */}
                <div
                    className={cn(
                        '-mx-4 md:mx-0 sticky bottom-0 z-10 mt-auto flex flex-col gap-3',
                        'border-(--separator-default) border-t bg-(--background) px-4 pt-4 pb-4 md:px-0',
                    )}
                >
                    {/*
                     * ## The money is a live region
                     *
                     * Changing package or method changes the total, and neither radio announces it —
                     * a screen reader hears "500 Star, selected" and nothing about the figure that
                     * just moved by four dollars. `polite` so it waits for a gap rather than cutting
                     * the radio off, and `atomic` because the total, the method and the fee line are
                     * one sentence: read the region, not the word that changed.
                     *
                     * The **button is outside it**, deliberately. It carries the same amount, and a
                     * live region that includes it announces the figure twice on every arrow key.
                     */}
                    <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-3">
                        <div className="flex items-start justify-between gap-3">
                            <span className="flex min-w-0 flex-col">
                                <span className="type-dense-default text-(--text-subtitle)">
                                    {t('payment_summary_total')}
                                </span>
                                {/*
                                 * The method's name **under the total**, and it is not decoration. This
                                 * list is seven rows on a real catalogue and the default (card) is the
                                 * last of them, so on a phone the total is read with the selected row off
                                 * screen. Without this the figure is unattributed — and the rows visible
                                 * above it price Star differently, which makes it look wrong.
                                 */}
                                {flow.gateway && (
                                    <span className="type-caption-meta truncate text-(--text-subtitle)">
                                        {flow.gateway.name ?? flow.gateway.id}
                                    </span>
                                )}
                            </span>
                            <span className="type-title-t2-semibold flex-none text-(--text-title) tabular-nums">
                                {flow.amountLabel}
                            </span>
                        </div>

                        {/*
                         * Why the total is more than the tile said.
                         *
                         * On the live catalogue these fees run 15–45%, so a $3.00 tile charges $4.35 and
                         * the page said nothing about the difference — the single most alarming thing a
                         * payment screen can do. `gatewayFeeCharge` answers in the **charged** currency
                         * rather than in dollars, so the line under a 250,000 ₫ total is in dong too.
                         *
                         * Drawn only when there is a fee: `$0.00 fee` on a free gateway is a line about
                         * nothing.
                         */}
                        {feeCharge !== null && feeCharge.amount > 0 && (
                            <p className="type-caption-meta m-0 text-(--text-subtitle)">
                                {t('payment_fee_included', { amount: formatCharge(feeCharge) })}
                            </p>
                        )}

                        {/* `converted: false` means no conversion rate came back, so the figure is still
                        USD — said out loud rather than labelled with the gateway's currency. */}
                        {flow.charge?.converted === false && (
                            <p className="type-caption-meta m-0 text-(--text-subtitle)">
                                {t('payment_total_usd_note')}
                            </p>
                        )}

                        {/* The gateway's own declared band, refused here rather than by a 400 the reader
                        cannot read. */}
                        {!flow.isAccepted && flow.gateway && flow.selected && (
                            <p className="type-caption-meta m-0 text-(--text-error)">
                                {t('payment_gateway_rejects_amount', {
                                    gateway: flow.gateway.name ?? flow.gateway.id,
                                })}
                            </p>
                        )}
                    </div>

                    <Button
                        data-testid="payment-get-star-pay"
                        variant="accent"
                        size="large"
                        className="w-full"
                        /*
                         * Signed-out is deliberately **not** a reason to disable: the press is the
                         * gate, and it opens the login dialog. A dead button with no explanation is
                         * the worse of the two failures — see the hook's own note.
                         */
                        disabled={!flow.canPay}
                        onClick={flow.pay}
                    >
                        {flow.isCheckoutBusy && <Loader className="size-[18px]" />}
                        {t('payment_pay_amount', { amount: flow.amountLabel })}
                    </Button>

                    {/*
                     * A wallet gateway does not open a form — the machine navigates the browser to
                     * the gateway's own page. Between the press and the browser leaving there is a
                     * second or two in which nothing but a spinner in the button says why, and the
                     * sheet has said this out loud since pass 4. `role="status"` rather than another
                     * live region: this one is an event, not a figure that keeps changing.
                     */}
                    {flow.isLeaving && (
                        <p
                            role="status"
                            className="type-caption-meta m-0 text-center text-(--text-subtitle)"
                        >
                            {t('payment_taking_you_to_gateway', {
                                gateway: flow.gateway?.name ?? t('payment_method_legend'),
                            })}
                        </p>
                    )}

                    {!isAuthenticated && !flow.isLeaving && (
                        <p className="type-caption-meta m-0 text-center text-(--text-subtitle)">
                            {t('payment_sign_in_to_pay')}
                        </p>
                    )}
                </div>
            </div>
        )
    }
}

/**
 * **Not supported here** — the catalogue answered and held nothing: no packages, or no gateway
 * enabled for this region. Legacy's `NotSupported`, and it is a **screen** rather than a notice.
 *
 * It shared the error branch's `Alert` at first, which had the words right and the shape wrong: a
 * one-line notice on an otherwise blank page, offering nothing to do about it.
 *
 * Legacy is right about the part that matters — **there is still a way to buy Star, and it is the
 * app**. Its version draws a QR of the current URL and, on mobile only, an *Open Tevi App* button.
 * This presses through to `GetAppDialog`, which this app already owns (store links from remote
 * config *and* a Tevi-branded QR), and `NotificationView` uses for the same shape of problem. Three
 * things that buys: one press instead of an unasked-for QR, a code that points at the **app** rather
 * than at the website, and a way out on a desktop too — where legacy's button is hidden behind
 * `isMobile`.
 *
 * There is deliberately **no retry**. An empty catalogue *answered*; asking again returns the same
 * answer with a spinner in front of it. Only a failure can be retried, and that is the branch above.
 *
 * Its own component because the state is otherwise unreachable: on the real page it needs a region
 * with no gateway, so `/dev/get-star` is the only place it can be looked at.
 */
export function StarCatalogueUnavailable() {
    const { t } = useTranslation()
    const [isGetAppOpen, setGetAppOpen] = useState(false)

    return (
        <>
            <ChannelEmptyState
                className={cn('flex-1', RISE)}
                icon="globe"
                title={t('payment_packages_empty_title')}
                body={t('payment_packages_empty_body')}
                action={
                    <Button
                        data-testid="payment-get-star-get-app-cta"
                        variant="accent"
                        size="large"
                        onClick={() => setGetAppOpen(true)}
                    >
                        {t('payment_open_app')}
                    </Button>
                }
            />
            {/*
             * Its own copy rather than the generic "Get the Tevi app": the reader did not come here
             * for the app, they came to buy Star and were told they cannot. The dialog has to say why
             * it is the answer.
             */}
            <GetAppDialog
                testId="payment-get-star-get-app"
                open={isGetAppOpen}
                onOpenChange={setGetAppOpen}
                title={t('payment_packages_empty_title')}
                body={t('payment_get_app_body')}
            />
        </>
    )
}
