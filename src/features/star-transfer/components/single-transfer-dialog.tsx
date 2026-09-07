'use client'

import { TextAreaField, TextField } from '@shared/components/field'
import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import { formatStarAmount } from '@shared/lib/money'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { useEffect, useState } from 'react'
import { useSelfParty } from '../hooks/use-self-party'
import type { SingleTransferFlow } from '../hooks/use-single-transfer'
import { MESSAGE_MAX_LENGTH } from '../lib/transfer-rules'
import { StarAmount } from './star-mark'
import {
    TransferAmountHero,
    TransferDetailRow,
    TransferInfoCard,
    TransferPartyBlock,
    TransferSummaryLine,
} from './transfer-details'
import {
    TransferDialog,
    TransferDialogBody,
    TransferDialogFooter,
    TransferDialogHeader,
} from './transfer-dialog'
import { TransferParty } from './transfer-party'

/**
 * **Single transfer** — legacy's two-step dialog, plus its confirmation.
 *
 * ```
 * Single transfer   form:    Receiver Tevi ID · Star amount · Messages            → Next
 * Confirm transfer  review:  the figure · From · To · fee · message · time        → Back | Confirm
 * Confirm this transfer?     the interstitial legacy raises over the review       → Close | Yes, I confirm
 * ```
 *
 * The third step is `web-app`'s and was dropped here once, on the argument that two confirmations of the
 * same press is one too many. That is a product opinion, and this screen is specified by legacy: money
 * leaves on the last press, legacy asks once more, and the interstitial is where its own wording about
 * checking the details lives. `ConfirmDialog` is the app's component for exactly that shape.
 *
 * The shell — 512 from `sm`, a bottom sheet below it, *Cancel · title · Star pill* in the header, small
 * pill buttons at the trailing edge — is `TransferDialog`; see that file for what it reproduces and what
 * it deliberately does not.
 *
 * ## The balance is in the header, not in a summary strip
 *
 * There was a summary block here (total over balance, with a shortfall line). Legacy has no such thing on
 * these screens: the **Star pill in the header** carries the balance and the **amount field** carries the
 * shortfall, which is two places instead of three and is what a reader of the mobile app already knows.
 *
 * ## Cancel goes back, it does not discard
 *
 * From the review, Back returns to the form with everything still in it. Legacy resets all three fields;
 * that is a bug rather than a design, so a reader who wants to change 500 to 5,000 keeps their ID and note.
 */
export function SingleTransferDialog({ flow }: { flow: SingleTransferFlow }) {
    const { t, currentLanguage } = useTranslation()
    const self = useSelfParty()
    const receiver = flow.lookup.party
    const [confirming, setConfirming] = useState(false)

    /*
     * The interstitial belongs to the review step, so it closes when that step ends — on success (the
     * flow moves to `receipt`) and on Back (it moves to the form). It used to close on the press instead,
     * which meant `pending` never rendered: the reader pressed *Yes, I confirm*, the sheet vanished, and a
     * write that took a second or failed gave them nothing to look at but a toast.
     */
    useEffect(() => {
        if (flow.step !== 'review') setConfirming(false)
    }, [flow.step])

    return (
        <>
            {/* ── Form ───────────────────────────────────────────────────────────────── */}
            <TransferDialog open={flow.step === 'form'} onClose={flow.close}>
                <TransferDialogHeader
                    title={t('star_transfer_single')}
                    onCancel={flow.close}
                    showBalance
                />
                <TransferDialogBody>
                    <h3 className="type-body-strong text-(--text-title)">
                        {t('star_transfer_form_title')}
                    </h3>

                    {/*
                     * One left edge with the heading — see `TransferDialogBody`.
                     *
                     * **`gap-2`, not `gap-4`, and the reason is `FieldShell`.** Every field reserves a
                     * 16px message line under itself (plus its own 6px gap) so that an error appearing
                     * does not push the form down — a good decision, and one that makes the *visible*
                     * distance between an input and the next label 22px larger than the gap says. At
                     * `gap-4` that came to 38px between fields and the form read as three unrelated
                     * questions; at 8 it is 30, and when an error does appear the sentence still has 8px
                     * of air under it. Measured, not guessed: the reserved slot is `min-h-4`.
                     */}
                    <div className="flex flex-col gap-2">
                        <TextField
                            data-testid="star-transfer-receiver"
                            label={t('star_transfer_receiver_label')}
                            placeholder={t('star_transfer_receiver_placeholder')}
                            // `text`, not `number`: a Tevi ID is an identifier that happens to be digits,
                            // and a number input brings a spinner, scroll-wheel editing and locale
                            // grouping — all wrong for something being copied in.
                            inputMode="numeric"
                            autoComplete="off"
                            value={flow.receiverId}
                            onChange={e => flow.setReceiverId(e.target.value)}
                            /*
                             * The checking spinner and the found tick go in the **label row**, not inside
                             * the field: `TextField`'s only in-field slot is `prefix`, and the amount
                             * field below already uses it for the Star mark. Putting one of the pair
                             * somewhere else from the other is worse than putting both here.
                             */
                            labelData={<LookupState status={flow.lookup.status} />}
                            error={
                                flow.lookup.status === 'invalid'
                                    ? t('star_transfer_receiver_invalid')
                                    : flow.lookup.status === 'error'
                                      ? t('star_transfer_error')
                                      : null
                            }
                            /*
                             * The sentence only — **the tick is in the label row and not here too.**
                             * `LookupState` above already draws it, in the slot the spinner just left, so
                             * a second one 20px below it made the same statement twice in one glance.
                             */
                            hint={
                                flow.lookup.status === 'found' ? (
                                    <span className="text-(--text-success)">
                                        {t('star_transfer_receiver_ok')}
                                    </span>
                                ) : undefined
                            }
                        />

                        {receiver && (
                            /*
                             * A dashed card, as legacy draws it: this is not a row of a list, it is a
                             * *confirmation* of who the ID resolved to, and the dashed edge is what says
                             * "this appeared because of what you typed".
                             */
                            <div className="rounded-xl border border-(--separator-default) border-dashed bg-(--background-elevated) p-3">
                                <TransferParty party={receiver} />
                            </div>
                        )}

                        <TextField
                            data-testid="star-transfer-amount"
                            label={t('star_transfer_amount_label')}
                            placeholder={t('star_transfer_amount_placeholder')}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={flow.amount}
                            onChange={e => flow.setAmount(e.target.value)}
                            prefix={<StarMark />}
                            error={
                                flow.amountProblem === 'insufficient'
                                    ? t('star_transfer_amount_insufficient')
                                    : flow.amountProblem === 'invalid'
                                      ? t('star_transfer_amount_placeholder')
                                      : null
                            }
                        />

                        <TextAreaField
                            data-testid="star-transfer-message"
                            label={t('star_transfer_message_label')}
                            placeholder={t('star_transfer_message_placeholder')}
                            rows={4}
                            value={flow.message}
                            onChange={e => flow.setMessage(e.target.value)}
                            labelData={`${flow.message.length}/${MESSAGE_MAX_LENGTH}`}
                        />
                    </div>
                </TransferDialogBody>
                <TransferDialogFooter>
                    <Button
                        data-testid="star-transfer-single-review"
                        variant="accent"
                        size="medium"
                        className="rounded-full"
                        disabled={!flow.canReview}
                        onClick={flow.review}
                    >
                        {t('star_transfer_next')}
                    </Button>
                </TransferDialogFooter>
            </TransferDialog>

            {/* ── Review ─────────────────────────────────────────────────────────────── */}
            <TransferDialog open={flow.step === 'review'} onClose={flow.close}>
                <TransferDialogHeader
                    title={t('star_transfer_review_title')}
                    onCancel={flow.close}
                />
                <TransferDialogBody>
                    {/*
                     * The figure, then the fields that make it up — `TransferAmountHero` and
                     * `TransferInfoCard`, shared with the bulk review so the two cannot drift. The heading
                     * over the figure used to be `type-title-t2-semibold`, the same size as the section
                     * heading below it, so the total's *label* competed with a section title and the
                     * hierarchy read as two headings with a number between them.
                     */}
                    <TransferAmountHero
                        label={t('star_transfer_review_amount')}
                        value={flow.stars}
                    />

                    <div className="flex flex-col gap-2">
                        <h3 className="type-body-strong text-(--text-title)">
                            {t('star_transfer_info_title')}
                        </h3>
                        <TransferInfoCard>
                            {self && (
                                <TransferPartyBlock label={t('star_transfer_from')} party={self} />
                            )}
                            {receiver && (
                                <TransferPartyBlock
                                    label={t('star_transfer_to')}
                                    party={receiver}
                                />
                            )}
                            {/*
                             * The fee is a **real figure and always shown**, reading `0`: transferring
                             * Star is free today and legacy prints the same zero on both of its confirm
                             * screens. "What will this cost me" is a question the screen should answer
                             * even when the answer is nothing.
                             */}
                            <TransferSummaryLine
                                label={t('star_transfer_fee')}
                                value={<StarAmount value={0} />}
                            />
                            {/*
                             * The note stays **stacked** while the figures beside it are two-column rows:
                             * 128 characters right-aligned against a label is a ragged paragraph. The rule
                             * is stated once in `transfer-details.tsx`.
                             */}
                            {flow.message.trim() && (
                                <TransferDetailRow
                                    label={t('star_transfer_message')}
                                    value={flow.message.trim()}
                                />
                            )}
                            {/*
                             * The reader's clock, not the server's: this row says "now". The transfer's
                             * real timestamp is on the receipt one screen later, where it comes off the
                             * response. Legacy prints `new Date()` here too.
                             */}
                            <TransferSummaryLine
                                label={t('star_transfer_requested_time')}
                                value={formatLedgerDateTime(Date.now(), currentLanguage)}
                            />
                        </TransferInfoCard>
                    </div>
                </TransferDialogBody>
                <TransferDialogFooter>
                    <Button
                        data-testid="star-transfer-single-back"
                        variant="secondary"
                        size="medium"
                        className="rounded-full"
                        disabled={flow.isSending}
                        onClick={flow.back}
                    >
                        {t('common_back')}
                    </Button>
                    <Button
                        data-testid="star-transfer-single-submit"
                        variant="accent"
                        size="medium"
                        className="rounded-full"
                        disabled={flow.isSending}
                        onClick={() => setConfirming(true)}
                    >
                        {t('common_confirm')}
                    </Button>
                </TransferDialogFooter>
            </TransferDialog>

            {/*
             * Legacy's interstitial, as the app's own `ConfirmDialog`: Cancel first in the DOM so focus
             * and Escape land on the answer that changes nothing, and `pending` disabling both buttons
             * while the write is in flight.
             */}
            <ConfirmDialog
                testId="star-transfer-single-confirm"
                open={confirming}
                onOpenChange={setConfirming}
                title={t('star_transfer_confirm_this')}
                description={t('star_transfer_confirm_body', {
                    amount: formatStarAmount(flow.stars, currentLanguage),
                })}
                confirmLabel={t('star_transfer_confirm')}
                cancelLabel={t('common_close')}
                pending={flow.isSending}
                // Deliberately **not** closed here: `pending` is what the reader sees while the write
                // runs, and a failure has to leave them somewhere they can try again. The effect above
                // closes it when the step actually moves.
                onConfirm={flow.confirm}
            />
        </>
    )
}

/**
 * The lookup's state, in the label row: a spinner while asking, a tick when somebody owns the ID.
 *
 * `invalid` and `error` draw **nothing** here — they have the message line under the field, and a red mark
 * in the label row as well would state the same problem twice in one glance. `idle` draws nothing because
 * nothing has been asked.
 */
function LookupState({ status }: { status: SingleTransferFlow['lookup']['status'] }) {
    if (status === 'checking') {
        // `Loader` is a fixed 24px DS component; scaled to the 16px the label row's other mark uses.
        return <Loader className="size-4" />
    }
    if (status === 'found') {
        return (
            <Icon
                name="check-circle"
                weight="filled"
                size={16}
                className="text-(--text-success)"
                // Decorative: the hint line under the field says the same thing in words.
                aria-hidden
            />
        )
    }
    return null
}
