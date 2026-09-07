'use client'

import { useBalance } from '@features/balance'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import {
    Alert,
    AlertActions,
    AlertContent,
    AlertIcon,
    AlertSubtitle,
    AlertTitle,
} from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import type { ReactNode } from 'react'
import type { StarPurchaseFlow } from '../hooks/use-star-purchase'
import type { CheckoutAction } from '../lib/checkout-action'
import { formatCharge } from '../lib/gateway-fee'
import { GatewayList } from './gateway-list'
import { StarPackageGrid } from './star-package-grid'

/**
 * Buying Star — packages, the order, and the gateway's own step, in one dialog.
 *
 * ```
 *  [1] Get Star            [2] ← Order summary        [3] ← Checkout
 *   Balance ★ 1,240            ★ 1,000 · $9.99            ● Visa ···· 4242
 *   ┌────┐┌────┐               Bonus     +100 ★           ○ New method
 *   │★100││★500│               Method    [list]           ─────────────────
 *   └────┘└────┘               Total     $10.29           [ Pay $10.29 ]
 *   [ Continue ]               [ Continue ]
 * ```
 *
 * ## Three steps, one dialog, and the third one is not ours
 *
 * Step 3 is whatever the **gateway** answered: a card form (`STRIPE`), a hand-off to a hosted page
 * (`REDIRECT`, where the machine navigates and this shows a line while it does), or a third-party
 * iframe (`CODA`). The sheet does not decide which — `parseCheckoutAction` did, and `useCheckout`
 * holds it. What the sheet does is get out of the way once the machine has left those states, so the
 * status dialog is not stacked under a sheet (`useStarPurchase`'s own effect).
 *
 * ## Why the balance is on step 1
 *
 * The sheet is usually opened by a press that could not be afforded, so "how much do I have" is the
 * question the reader arrived with. When it was opened *by* a shortfall the gap is named too, because
 * "you need 500 more" is what makes the pre-selected tile make sense.
 *
 * ## The DS centred dialog, not a bottom sheet
 *
 * This app has no bottom-sheet primitive; `membership-detail-dialog.tsx` is the pattern — a fixed
 * title band, one scrolling body, and `max-h` so a long catalogue scrolls inside rather than pushing
 * the actions off a phone.
 */
export function StarPurchaseDialog({
    flow,
    action,
    isCheckoutBusy,
    onPay,
}: {
    flow: StarPurchaseFlow
    /** What the machine is currently holding, or `null` before `checkout/` has answered. */
    action: CheckoutAction | null
    isCheckoutBusy: boolean
    /** Step 2's Continue — hands the order to the machine. The card form is the provider's. */
    onPay: () => void
}) {
    const { t, currentLanguage } = useTranslation()
    const { star, isKnown } = useBalance()

    const amountLabel = formatCharge(flow.charge)

    return (
        <Dialog
            open={flow.step !== 'closed'}
            onOpenChange={open => {
                if (!open && !isCheckoutBusy) flow.close()
            }}
            /*
             * Once the machine is working, the sheet cannot be dismissed out from under it — the same
             * rule `CheckoutStatusDialog` applies while confirming, for the same reason: unmounting
             * `<Elements>` mid-confirmation orphans the confirmation.
             */
            disablePointerDismissal={isCheckoutBusy}
        >
            <DialogContent className="max-h-[min(88vh,720px)] w-[400px] gap-0 overflow-hidden p-0">
                <div className="relative flex h-14 flex-none items-center justify-center border-(--separator-default) border-b px-2">
                    {flow.step === 'summary' || flow.step === 'payment' ? (
                        <button
                            data-testid="payment-purchase-back"
                            type="button"
                            aria-label={t('common_back')}
                            disabled={isCheckoutBusy}
                            onClick={flow.back}
                            className="absolute start-2 flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--text-title) outline-none hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Icon name="angle-left" size={20} />
                        </button>
                    ) : (
                        <DialogClose
                            data-testid="payment-purchase-close"
                            aria-label={t('common_close')}
                            className="absolute start-2 flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--text-title) outline-none hover:bg-(--background-segment) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
                        >
                            <Icon name="xmark" size={20} />
                        </DialogClose>
                    )}
                    <DialogTitle className="truncate">
                        {flow.step === 'packages'
                            ? t('payment_get_star_title')
                            : flow.step === 'summary'
                              ? t('payment_order_summary_title')
                              : t('payment_checkout_title')}
                    </DialogTitle>
                </div>

                {renderBody()}
            </DialogContent>
        </Dialog>
    )

    function renderBody(): ReactNode {
        if (flow.isLoading) {
            return (
                <div className="flex min-h-[280px] items-center justify-center p-4">
                    <Loader label={t('common_loading')} />
                </div>
            )
        }

        if (flow.isError || flow.isEmpty) {
            return (
                <div className="p-4">
                    <Alert status={flow.isError ? 'error' : 'info'}>
                        <AlertIcon status={flow.isError ? 'error' : 'info'} />
                        <AlertContent>
                            <AlertTitle>
                                {flow.isError
                                    ? t('payment_packages_error_title')
                                    : t('payment_packages_empty_title')}
                            </AlertTitle>
                            <AlertSubtitle>
                                {flow.isError
                                    ? t('payment_packages_error_body')
                                    : t('payment_packages_empty_body')}
                            </AlertSubtitle>
                            {/* Only a failure can be retried. An empty catalogue answered, and asking
                                again would give the same answer with a spinner in front of it. */}
                            {flow.isError && (
                                <AlertActions>
                                    <Button
                                        data-testid="payment-purchase-retry"
                                        variant="secondary"
                                        size="medium"
                                        onClick={flow.retry}
                                    >
                                        {t('common_retry')}
                                    </Button>
                                </AlertActions>
                            )}
                        </AlertContent>
                    </Alert>
                </div>
            )
        }

        if (flow.step === 'packages') {
            return (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                        <div className="flex items-center justify-between gap-3">
                            <span className="type-dense-default text-(--text-subtitle)">
                                {t('payment_your_balance')}
                            </span>
                            <span className="flex items-center gap-1">
                                <StarMark />
                                <span className="type-body-strong text-(--text-title)">
                                    {isKnown ? formatStarAmount(star, currentLanguage) : '—'}
                                </span>
                            </span>
                        </div>

                        {/* Only when a failed press opened the sheet: it is what makes the
                            pre-selected tile legible as an answer rather than a guess. */}
                        {flow.shortfall > 0 && (
                            <p className="type-dense-default m-0 text-(--text-subtitle)">
                                {t('payment_shortfall_hint', {
                                    amount: formatStarAmount(flow.shortfall, currentLanguage),
                                })}
                            </p>
                        )}

                        <StarPackageGrid
                            packages={flow.packages}
                            selected={flow.selected}
                            onSelect={flow.select}
                        />
                    </div>
                    <Footer>
                        <Button
                            data-testid="payment-purchase-review"
                            variant="accent"
                            size="large"
                            className="w-full"
                            disabled={!flow.selected}
                            onClick={flow.review}
                        >
                            {t('common_continue')}
                        </Button>
                    </Footer>
                </div>
            )
        }

        if (flow.step === 'summary') {
            return (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
                        <dl className="m-0 flex flex-col gap-3">
                            <SummaryRow label={t('payment_summary_stars')}>
                                {formatStarAmount(flow.stars, currentLanguage)}
                            </SummaryRow>
                            <SummaryRow label={t('payment_summary_price')}>
                                {t('payment_price_usd', {
                                    amount: (flow.selected?.price ?? 0).toFixed(2),
                                })}
                            </SummaryRow>
                        </dl>

                        <GatewayList
                            gateways={flow.gateways}
                            selected={flow.gateway}
                            onSelect={flow.selectGateway}
                        />
                    </div>
                    <Footer>
                        {/*
                         * The total sits **with** the button rather than in the list above it: it is
                         * the figure the press commits to, and legacy puts it three rows up where it
                         * reads as one more line of the receipt.
                         *
                         * `converted: false` means no conversion rate was available, so the figure is
                         * still USD — said out loud rather than labelled with the gateway's currency,
                         * which is the mislabelling `gatewayTotal` documents.
                         */}
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="type-dense-default text-(--text-subtitle)">
                                {t('payment_summary_total')}
                            </span>
                            <span className="type-body-strong text-(--text-title)">
                                {amountLabel}
                            </span>
                        </div>
                        {flow.charge?.converted === false && (
                            <p className="type-caption-meta m-0 text-(--text-subtitle)">
                                {t('payment_total_usd_note')}
                            </p>
                        )}
                        {/*
                         * The gateway's own band (`min_payment_amount` / `max_payment_amount`), which
                         * the catalogue declares — so a package it will not take is refused here
                         * rather than by a 400 the reader cannot read.
                         */}
                        {!flow.isAccepted && flow.gateway && flow.selected && (
                            <p className="type-caption-meta m-0 text-(--text-error)">
                                {t('payment_gateway_rejects_amount', {
                                    gateway: flow.gateway.name ?? flow.gateway.id,
                                })}
                            </p>
                        )}
                        <Button
                            data-testid="payment-purchase-pay"
                            variant="accent"
                            size="large"
                            className="w-full"
                            disabled={!flow.isAccepted || isCheckoutBusy}
                            onClick={onPay}
                        >
                            {isCheckoutBusy && <Loader className="size-[18px]" />}
                            {t('common_continue')}
                        </Button>
                    </Footer>
                </div>
            )
        }

        /*
         * ── step 3: whatever the gateway asked for ─────────────────────────────────────────────
         *
         * **The card form is not here.** A `STRIPE` action is handled by `CardCheckoutDialog`, which the
         * provider owns, because a donation and a membership tier produce exactly the same action and
         * would each have needed their own copy of this panel — the arrangement legacy has, and the
         * reason its three checkout screens disagree about what a decline looks like. The sheet steps
         * aside for `card` the way it does for the status states (`useStarPurchase`).
         *
         * What is left here is the hand-off: a gateway that takes the reader somewhere else.
         */
        if (action?.kind === 'redirect' || action?.kind === 'embedded' || isCheckoutBusy) {
            /*
             * A hand-off. The machine is already navigating (`redirect`) or the embedded provider owns
             * the next step; this is the line that says so, rather than a dialog that vanishes with no
             * explanation. Coda's iframe is a later pass — until then the reader is told, which is
             * better than an empty panel.
             */
            return (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 p-4">
                    <Loader />
                    <p className="type-dense-default m-0 text-center text-(--text-subtitle)">
                        {t('payment_taking_you_to_gateway', {
                            gateway: flow.gateway?.name ?? t('payment_method_legend'),
                        })}
                    </p>
                </div>
            )
        }

        return (
            <div className="p-4">
                <Alert status="error">
                    <AlertIcon status="error" />
                    <AlertContent>
                        <AlertTitle>{t('payment_error_unsupported_method')}</AlertTitle>
                        <AlertSubtitle>{t('payment_unsupported_body')}</AlertSubtitle>
                        <AlertActions>
                            <Button
                                data-testid="payment-purchase-back-error"
                                variant="secondary"
                                size="medium"
                                onClick={flow.back}
                            >
                                {t('common_back')}
                            </Button>
                        </AlertActions>
                    </AlertContent>
                </Alert>
            </div>
        )
    }
}

/** The dialog's action band: a fixed floor under a scrolling body. */
function Footer({ children }: { children: ReactNode }) {
    return (
        <div className="flex flex-none flex-col gap-3 border-(--separator-default) border-t p-4">
            {children}
        </div>
    )
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <dt className="type-dense-default m-0 text-(--text-subtitle)">{label}</dt>
            <dd className="type-dense-strong m-0 text-(--text-title)">{children}</dd>
        </div>
    )
}
