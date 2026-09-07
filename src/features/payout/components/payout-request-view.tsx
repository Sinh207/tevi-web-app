'use client'

import { TwoStepVerificationDialog, useRequireAuth } from '@features/auth'
import { ChannelEmptyState } from '@features/channel'
import { MY_WALLET_PATH } from '@features/my-wallet/routes'
import { PageBackBar } from '@features/navigation'
import { useTranslation } from '@shared/i18n/use-translation'
import { RISE } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { usePayoutRequestForm } from '../hooks/use-payout-request-form'
import { PAYOUT_CARD, PAYOUT_CARD_CONTAINER, PAYOUT_SCREEN } from '../lib/container'
import { PAYOUT_TRACKING_PATH, SETUP_PAYOUTS_PATH } from '../routes'
import { PayoutAmountField } from './payout-amount-field'
import { PayoutConfirmDialog } from './payout-confirm-dialog'
import { PayoutMethodPickerDialog } from './payout-method-picker-dialog'
import { PayoutMethodSummaryRow } from './payout-method-summary-row'
import { PayoutOptionCards } from './payout-option-cards'
import { PayoutRequestActions } from './payout-request-actions'
import { PayoutRequestBalance } from './payout-request-balance'
import { PayoutRequestSkeletonForm } from './payout-request-skeleton-form'
import { PayoutRequestSummary } from './payout-request-summary'
import { PayoutVerificationDialog } from './payout-verification-dialog'

/**
 * `/my-wallet/payout-request` — ask for a withdrawal.
 *
 * The one screen in this feature that **spends money**, which decides most of what follows: the figures
 * come from the server's quote and never from arithmetic here, the submit is never retried, and a 4xx is
 * classified into an *outcome* before anything is shown (`payout-request-errors.ts`).
 *
 * ## Four states before the form, and one of them is a redirect
 *
 * Signed-out, loading, **no active withdraw method**, and the form. The third is legacy's, and legacy
 * does it with `window.history.replaceState` inside a `catch` — a redirect performed by rewriting the
 * URL without telling the router, which leaves Next's tree pointing at a page that is no longer on
 * screen. Here it is `router.replace(SETUP_PAYOUTS_PATH)` in an effect: same destination, and the router
 * knows.
 *
 * `replace` rather than `push`, for the reason legacy's `replaceState` gets right: somebody who arrived
 * here with no method set up should not be able to press Back into a screen that will bounce them
 * forward again.
 *
 * ## Two presses, or three
 *
 * Send → confirm → request. For an account with **two-step verification** on there is a passcode step
 * between the last two (`TwoStepVerificationDialog`, owned by `features/auth`), and the code it collects
 * goes on the request as well as being verified. Before that step existed, such an account could not
 * withdraw here at all: the request went without a passcode, the backend refused it, and the refusal
 * landed in `unknown` — one generic sentence with nothing to press.
 *
 * ## Sections, in legacy's order
 *
 * Balance → method → amount → option → summary → submit. Each is its own card on the page colour, which
 * is the multi-block treatment (`docs/DESIGN_SYSTEM.md` §6): this is **not** a single-panel screen, so
 * `<main>` keeps the page colour and the gaps between cards separate them.
 */
export function PayoutRequestView({ className }: { className?: string }) {
    const { t } = useTranslation()
    const router = useRouter()
    const requireAuth = useRequireAuth()
    const form = usePayoutRequestForm()
    /*
     * One boolean per dialog — legacy holds them in one `open` object plus a handler pair that closes
     * "whichever is open". Separate state because they are separate questions: the picker is a choice,
     * the confirm is a commitment and the passcode is a credential, and closing one must never close
     * another.
     */
    const [pickerOpen, setPickerOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    /**
     * The passcode step, for an account with two-step verification on.
     *
     * A third boolean rather than a step enum, because the three dialogs are not a sequence: the picker
     * can be raised at any time, and confirm → passcode is the only ordered pair. An enum would make
     * the picker a "step" and then need a rule for what happens if it is opened during one.
     */
    const [passcodeOpen, setPasscodeOpen] = useState(false)

    /*
     * No method, no form. Legacy rewrites the URL with `replaceState`; this tells the router, so the
     * tree actually changes. Guarded on `hasNoMethod`, which is only true once the list has settled —
     * redirecting during load would bounce every visit.
     */
    useEffect(() => {
        if (form.hasNoMethod) router.replace(SETUP_PAYOUTS_PATH)
    }, [form.hasNoMethod, router])

    /*
     * A created request has a detail screen, and that is where the reader goes — legacy pushes
     * `/my-wallet/payout-tracking/{id}`. In an effect rather than in the mutation's `onSuccess`, so
     * navigation stays a render concern and the hook stays testable without a router.
     */
    useEffect(() => {
        if (form.createdId) router.replace(`${PAYOUT_TRACKING_PATH}/${form.createdId}`)
    }, [form.createdId, router])

    const bar = (
        <div className={cn('sticky top-0 z-20', PAYOUT_SCREEN)}>
            <PageBackBar
                title={t('payout_request_title')}
                home={MY_WALLET_PATH}
                className={PAYOUT_CARD_CONTAINER}
            />
        </div>
    )

    if (form.isSignedOut) {
        return (
            <>
                {bar}
                <div className={cn(PAYOUT_CARD_CONTAINER, 'flex flex-1 flex-col pb-6', className)}>
                    <div className={cn(PAYOUT_CARD, 'flex-1')}>
                        <ChannelEmptyState
                            className={cn('flex-1', RISE)}
                            icon="bank"
                            title={t('payout_signed_out_title')}
                            body={t('payout_signed_out_body')}
                            action={
                                <Button
                                    data-testid="payout-request-sign-in"
                                    variant="primary"
                                    size="large"
                                    onClick={requireAuth(() => undefined)}
                                >
                                    {t('auth_sign_in')}
                                </Button>
                            }
                        />
                    </div>
                </div>
            </>
        )
    }

    return (
        <>
            {bar}
            <div
                className={cn(PAYOUT_CARD_CONTAINER, 'flex flex-1 flex-col gap-3', className)}
                data-testid="payout-request"
            >
                {form.isLoading ? (
                    /*
                     * Built from the form's own blocks rather than from guessed heights — see
                     * `PayoutRequestSkeletonForm`, where three boxes of 96/140/180 used to be.
                     */
                    <PayoutRequestSkeletonForm />
                ) : (
                    <>
                        {/*
                         * Legacy's order, from `content/index.js`: balance → amount → method → option →
                         * summary, then the pinned actions bar. Each is its own block on the page colour
                         * with 12px between them (`gap-3`), which is legacy's `spacing={1.5}`.
                         */}
                        <PayoutRequestBalance balance={form.balance} />

                        <PayoutAmountField
                            amount={form.amount}
                            onChange={form.setAmount}
                            maxAmount={form.maxAmount}
                            minAmount={form.minAmount}
                            exchangeRate={form.exchangeRate}
                            currency={form.currency}
                            error={form.fieldError}
                        />

                        <PayoutMethodSummaryRow
                            config={form.method}
                            canChange={form.methods.length > 1}
                            onOpenPicker={() => setPickerOpen(true)}
                        />

                        <PayoutOptionCards
                            options={form.options}
                            selectedId={form.option?.id ?? null}
                            onSelect={form.selectOption}
                            /*
                             * The offer is withheld while there is no withdraw method: this screen is
                             * already on its way to `setup-payouts`, and the options list resolves
                             * before the configs do — so the sheet opened over a redirect.
                             */
                            canOffer={form.methods.length > 0}
                        />

                        <PayoutRequestSummary
                            quote={form.quote}
                            isQuoting={form.isQuoting}
                            isError={form.isQuoteError}
                            amount={form.amount}
                            currency={form.currency}
                            exchangeRate={form.exchangeRate}
                        />

                        {/*
                         * `unknown` is the only outcome shown here — `verification-required` raises its
                         * dialog, `amount-rejected` is under the field, and `quote-expired` needs no
                         * message at all since the query re-asks on its own.
                         */}
                        {form.outcome?.kind === 'unknown' && (
                            <p
                                role="alert"
                                data-testid="payout-request-error"
                                className="type-dense-default m-0 text-(--accents-error-active)"
                            >
                                {form.outcome.message ?? t('payout_request_failed')}
                            </p>
                        )}

                        {/*
                         * **Inside the column, not a sibling.** The footer is `sticky bottom-0` with
                         * `mt-auto`, so it belongs to this flex column: that is what gives it the 612
                         * width for free, and what makes it reserve its own height instead of needing
                         * the 80px spacer legacy hand-computes.
                         *
                         * **Opens the confirm dialog. It does not submit** — legacy's
                         * `handleOpen('confirm')`, and the reason that dialog was ported: one press on
                         * a money screen must not be the whole action.
                         */}
                        <PayoutRequestActions
                            netAmount={form.quote?.netAmount ?? null}
                            netCurrency={form.quote?.netAmountCurrency ?? form.currency}
                            canSubmit={form.canSubmit}
                            isSubmitting={form.isSubmitting}
                            onReview={() => setConfirmOpen(true)}
                        />
                    </>
                )}
            </div>

            <PayoutMethodPickerDialog
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                methods={form.methods}
                selectedId={form.method?.id ?? null}
                onSelect={form.selectMethod}
            />

            <PayoutConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                /*
                 * **Confirm is not always the last press.** With two-step verification on, this hands
                 * over to the passcode dialog instead of submitting — legacy's own branch
                 * (`confirmWithdraw/actions`: `if (currentUser?.two_fa_passcode) handleOpen('twoFa')`).
                 *
                 * The confirm dialog closes either way, so the two are never on screen together: base-ui
                 * portals both at `z-50`, and the second would take focus while the first still owned
                 * the scroll lock.
                 */
                onConfirm={() => {
                    setConfirmOpen(false)
                    if (form.requiresPasscode) {
                        setPasscodeOpen(true)
                        return
                    }
                    form.submit()
                }}
                config={form.method}
                option={form.option}
                /*
                 * The **same two values the footer gets**, deliberately from one place: the dialog used
                 * to be handed `amount` + `exchangeRate` and do its own arithmetic, which is how it
                 * came to print the gross while the bar right behind it printed the net.
                 */
                netAmount={form.quote?.netAmount ?? null}
                netCurrency={form.quote?.netAmountCurrency ?? form.currency}
                isSubmitting={form.isSubmitting}
            />

            {/*
             * Opened by the confirm step for an account that has a passcode, **and re-opened by the
             * server** when the write says one is needed after all — a profile that was cached before
             * two-step verification was switched on elsewhere. `passcode-required` is the outcome that
             * covers it, so nothing here has to trust `/me` being current.
             *
             * `form.submit(passcode)` and not a bare `submit()`: the code goes on the request as well as
             * having been verified. See `submit`'s own note.
             */}
            <TwoStepVerificationDialog
                open={passcodeOpen || form.outcome?.kind === 'passcode-required'}
                onClose={() => {
                    setPasscodeOpen(false)
                    // Also clears a `passcode-required` outcome, which is the *other* thing holding this
                    // dialog open — without it, closing would leave it open.
                    form.dismissOutcome()
                }}
                onVerified={passcode => {
                    setPasscodeOpen(false)
                    form.dismissOutcome()
                    form.submit(passcode)
                }}
                error={
                    form.outcome?.kind === 'passcode-required'
                        ? (form.outcome.message ?? t('payout_request_passcode_required'))
                        : null
                }
            />

            <PayoutVerificationDialog
                open={form.outcome?.kind === 'verification-required'}
                onClose={form.dismissOutcome}
            />
        </>
    )
}
