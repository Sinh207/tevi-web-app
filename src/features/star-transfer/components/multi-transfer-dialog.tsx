'use client'

import { useBalance } from '@features/balance'
import { TextAreaField } from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import { formatStarAmount } from '@shared/lib/money'
import { formatBytes } from '@shared/lib/storage-usage'
import { cn } from '@shared/lib/utils'
import { Alert, AlertContent, AlertIcon, AlertTitle } from '@shared/ui/alert'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Icon } from '@shared/ui/icon'
import { Loader } from '@shared/ui/loader'
import { type DragEvent, useEffect, useId, useState } from 'react'
import type { MultiTransferFlow } from '../hooks/use-multi-transfer'
import { useSelfParty } from '../hooks/use-self-party'
import { MAX_RECEIVERS, MAX_TEMPLATE_BYTES, MESSAGE_MAX_LENGTH } from '../lib/transfer-rules'
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
 * **Multi transfer** — legacy's CSV flow: upload, review, and its confirmation.
 *
 * ```
 * Multi transfer     upload:  instructions · dropzone · Messages                  → Next
 * Confirm transfer   review:  the total · From · n/10 receivers · rows · fee …    → Back | Confirm
 * Confirm this transfer?      the interstitial legacy raises over the review      → Close | Yes, I confirm
 * ```
 *
 * Shell, header and footer are `TransferDialog`'s — 512 from `sm`, a bottom sheet below it. The dropzone is
 * the one part with no DS component behind it (`components.css` has no `.tevi-*` upload control, in the
 * readable half or in the five the 256 KiB cap loses), so it is legacy's dashed box drawn with `--input-*`
 * tokens.
 */
export function MultiTransferDialog({ flow }: { flow: MultiTransferFlow }) {
    const { t, currentLanguage } = useTranslation()
    const { isKnown, hasEnoughStars } = useBalance()
    const self = useSelfParty()
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
    const plan = flow.plan
    const total = plan?.total ?? 0
    /*
     * Unlike the single flow, this review **is** reachable with an unaffordable total: a CSV can add up to
     * more than the balance and there is no field to refuse it on the way in. So the figure turns red and
     * the sentence under it says why — legacy's own treatment.
     */
    const short = isKnown && total > 0 && !hasEnoughStars(total)

    return (
        <>
            {/* ── Upload ─────────────────────────────────────────────────────────────── */}
            <TransferDialog open={flow.step === 'upload'} onClose={flow.close}>
                <TransferDialogHeader
                    title={t('star_transfer_multi')}
                    onCancel={flow.close}
                    showBalance
                />
                <TransferDialogBody>
                    <h3 className="type-body-strong text-(--text-title)">
                        {t('star_transfer_upload_title')}
                    </h3>

                    {/* One left edge with the heading — see `TransferDialogBody`; `gap-3` between the
                        instructions block and the note field, for the reason the single form's stack
                        spells out — the field reserves a message line of its own. */}
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3">
                            {/*
                             * A real list, because they are ordered steps. Legacy renders them as `<li>`s
                             * inside a `<ul>` and then strips the bullet characters out of the translated
                             * strings at runtime — which is why every one of those keys still starts with
                             * a `•` on the wire.
                             */}
                            {/* `list-decimal`, because the element is an `<ol>` and these are three
                                ordered steps. It was `list-disc`: an ordered list wearing bullets, which
                                is the markup and the picture disagreeing. */}
                            <ol className="type-dense-default flex list-decimal flex-col gap-1.5 ps-5 text-(--text-subtitle)">
                                <li>
                                    {/*
                                     * A `<button>`, not a link: the template is fetched with this
                                     * account's bearer and handed to the browser as a blob, so there is no
                                     * URL to open, copy or middle-click.
                                     */}
                                    <Button
                                        data-testid="star-transfer-download-template"
                                        variant="ghost"
                                        size="small"
                                        // `align-baseline` because a `Button` is an inline-*flex*
                                        // box: without it the link sits a couple of pixels above the
                                        // list marker it belongs to.
                                        className="h-auto gap-1 px-0 align-baseline text-(--text-link) underline"
                                        disabled={flow.isDownloading}
                                        onClick={flow.downloadTemplate}
                                    >
                                        {/* The glyph is what makes this read as a download rather than as
                                            a link to somewhere; the file arrives as a blob and there is no
                                            page behind it. */}
                                        <Icon name="download-bracket" size={16} aria-hidden />
                                        {t('star_transfer_download_template')}
                                    </Button>
                                </li>
                                <li>
                                    {t('star_transfer_upload_step_fill')}
                                    <ul className="list-[circle] ps-5">
                                        <li>{t('star_transfer_upload_step_ids')}</li>
                                        <li>{t('star_transfer_upload_step_amounts')}</li>
                                    </ul>
                                </li>
                                <li>{t('star_transfer_upload_step_upload')}</li>
                            </ol>

                            <Dropzone flow={flow} />
                        </div>

                        <TextAreaField
                            data-testid="star-transfer-multi-message"
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
                        data-testid="star-transfer-multi-review"
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
                    {/* The figure and the card are `TransferAmountHero` / `TransferInfoCard`, shared with
                        the single review so the two cannot drift apart. */}
                    <TransferAmountHero
                        label={t('star_transfer_review_amount')}
                        value={total}
                        tone={short ? 'error' : 'default'}
                        note={
                            short && (
                                /*
                                 * Legacy pairs this sentence with a link to `/get-star`. That route
                                 * exists now and the second half is still text, deliberately: this sheet
                                 * holds a list somebody has just built row by row, and a link out of it
                                 * throws the list away. The sheet-over-dialog is what belongs here when
                                 * it is asked for — the same call `TransferDialogHeader` records.
                                 */
                                <p className="type-dense-strong text-(--text-error)">
                                    {t('star_transfer_insufficient_body')}{' '}
                                    {t('star_transfer_get_more')}
                                </p>
                            )
                        }
                    />

                    {plan && plan.invalid > 0 && (
                        /*
                         * The lines that will **not** be sent, as the DS `Alert` in its mini shape rather
                         * than as a red sentence loose on the sheet. Two things it fixes: nothing failed —
                         * rows were skipped — so this is `warning`, amber, not the error red legacy prints;
                         * and a contained note with a glyph is read, where a red paragraph above a list is
                         * read as the list being broken. Legacy renders it through
                         * `dangerouslySetInnerHTML` to bold the count; here the count is a value in the
                         * sentence, which needs no HTML at all.
                         */
                        <Alert status="warning" type="mini" role="alert">
                            <AlertIcon status="warning" type="mini" />
                            <AlertContent>
                                <AlertTitle type="mini">
                                    {t('star_transfer_invalid_rows', { count: plan.invalid })}
                                </AlertTitle>
                            </AlertContent>
                        </Alert>
                    )}

                    <div className="flex flex-col gap-2">
                        <h3 className="type-body-strong text-(--text-title)">
                            {t('star_transfer_info_title')}
                        </h3>
                        <TransferInfoCard>
                            {self && (
                                <TransferPartyBlock label={t('star_transfer_from')} party={self} />
                            )}

                            <div className="flex items-baseline justify-between gap-3">
                                <span className="type-dense-strong text-(--text-title)">
                                    {t('star_transfer_to')}
                                </span>
                                {/*
                                 * `{n}/{max} receivers added`, as legacy prints it — a count against
                                 * the cap the client has always displayed. It is **not** enforced: 10
                                 * is unverified (B54), and refusing a transfer the backend would have
                                 * accepted is worse than a count that turns out to be advisory.
                                 */}
                                <span className="type-caption-meta text-(--text-subtitle)">
                                    <span className="type-dense-strong text-(--text-title) tabular-nums">
                                        {plan?.receivers.length ?? 0}/{MAX_RECEIVERS}
                                    </span>{' '}
                                    {t('star_transfer_receivers_added')}
                                </span>
                            </div>

                            {/*
                             * One receiver per row of the card, so ten of them read as a list of ten
                             * rather than as ten dashed boxes. The dashed edge stays where it means
                             * something — the single flow's *"this is who the ID you typed resolved to"* —
                             * and a row of a list does not need one.
                             */}
                            {plan?.receivers.map((receiver, index) => (
                                <TransferParty
                                    testId="star-transfer-receiver-row"
                                    rowIndex={index}
                                    key={receiver.party.id}
                                    party={receiver.party}
                                    trailing={
                                        <span className="flex items-center gap-1">
                                            <StarAmount value={receiver.stars} />
                                            {/*
                                             * Subtle until it is pointed at. A red glyph on every row
                                             * turns a list being reviewed into a list of problems; the
                                             * colour belongs to the moment somebody reaches for it.
                                             */}
                                            <Button
                                                data-testid="star-transfer-remove-receiver"
                                                variant="ghost"
                                                size="small"
                                                iconOnly
                                                aria-label={t('star_transfer_remove')}
                                                disabled={flow.isSending}
                                                className="text-(--text-subtitle) hover:text-(--text-error)"
                                                onClick={() =>
                                                    flow.removeReceiver(receiver.party.id)
                                                }
                                            >
                                                <Icon name="trash" size={16} />
                                            </Button>
                                        </span>
                                    }
                                />
                            ))}

                            <TransferSummaryLine
                                label={t('star_transfer_fee')}
                                value={<StarAmount value={0} />}
                            />
                            {/* Stacked while the figures around it are two-column rows — the rule is
                                stated once in `transfer-details.tsx`. */}
                            {flow.message.trim() && (
                                <TransferDetailRow
                                    label={t('star_transfer_message')}
                                    value={flow.message.trim()}
                                />
                            )}
                            <TransferSummaryLine
                                label={t('star_transfer_requested_time')}
                                value={formatLedgerDateTime(Date.now(), currentLanguage)}
                            />
                        </TransferInfoCard>
                    </div>
                </TransferDialogBody>
                <TransferDialogFooter>
                    <Button
                        data-testid="star-transfer-multi-back"
                        variant="secondary"
                        size="medium"
                        className="rounded-full"
                        disabled={flow.isSending}
                        onClick={flow.back}
                    >
                        {t('common_back')}
                    </Button>
                    <Button
                        data-testid="star-transfer-multi-submit"
                        variant="accent"
                        size="medium"
                        className="rounded-full"
                        disabled={flow.isSending || !flow.canReview}
                        onClick={() => setConfirming(true)}
                    >
                        {t('common_confirm')}
                    </Button>
                </TransferDialogFooter>
            </TransferDialog>

            <ConfirmDialog
                testId="star-transfer-multi-confirm"
                open={confirming}
                onOpenChange={setConfirming}
                title={t('star_transfer_confirm_this')}
                description={t('star_transfer_confirm_body', {
                    amount: formatStarAmount(total, currentLanguage),
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
 * The file box: a dashed target that is also a real `<label>` for a real `<input type="file">`.
 *
 * ## Drag and drop is implemented, not just promised
 *
 * The copy says *"Drag or drop a CSV here or browse file"* in all nine locales — and legacy renders it over
 * a `<label>` with **no drop handler at all**, so dropping a file on it navigates the tab to that file and
 * the reader loses the page. The handlers below take the first dropped file and run it through the same
 * `chooseFile` the input does, so both routes get the same validation.
 *
 * `dragging` is local state rather than a CSS-only affordance because there is no selector for "a file is
 * over this element".
 */
function Dropzone({ flow }: { flow: MultiTransferFlow }) {
    const { t, currentLanguage } = useTranslation()
    const inputId = useId()
    const [dragging, setDragging] = useState(false)

    const failed = flow.fileProblem !== null || flow.uploadFailed
    const message =
        flow.fileProblem === 'too-large'
            ? t('star_transfer_file_too_large', {
                  limit: formatBytes(MAX_TEMPLATE_BYTES, currentLanguage),
              })
            : flow.fileProblem === 'wrong-type'
              ? t('star_transfer_file_type')
              : flow.uploadFailed
                ? t('star_transfer_upload_failed')
                : null

    function onDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault()
        setDragging(false)
        flow.chooseFile(event.dataTransfer.files.item(0))
    }

    return (
        /*
         * The drop target. Drag-and-drop is a **pointer-only enhancement** over the real `<label>` +
         * `<input type="file">` inside this box, which is the keyboard and screen-reader path. Giving the
         * wrapper a role would announce a control that does not exist.
         */
        // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only enhancement — see above
        <div
            onDragOver={event => {
                // Both are required: without `preventDefault` on *dragover* the drop never fires, and the
                // browser opens the file in the tab instead.
                event.preventDefault()
                setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
                'flex flex-col gap-2 rounded-xl border border-dashed p-4 transition-colors duration-150',
                // A surface, not a hole. Unfilled, this box was the dialog's own sheet colour inside a
                // hairline dash — 200px of nothing, which is why it read as a gap in the form rather than
                // as the control the step is about. Elevated rather than Surface, for the reason
                // `TransferInfoCard` states: in dark, Surface *is* the dialog's own fill.
                'bg-(--background-elevated)',
                dragging
                    ? 'border-(--input-border-focus) bg-(--background-segment)'
                    : 'border-(--input-border)',
                failed && 'border-(--input-border-error)',
            )}
        >
            <input
                data-testid="star-transfer-file"
                id={inputId}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={event => {
                    flow.chooseFile(event.target.files?.item(0) ?? null)
                    /*
                     * Cleared so choosing the *same* file again still fires `change` — the common case
                     * after "that file was the wrong shape, let me fix it and re-upload". Without this the
                     * second attempt does nothing at all.
                     */
                    event.target.value = ''
                }}
            />

            {flow.file ? (
                <div
                    className={cn(
                        'flex min-w-0 items-center gap-2 rounded-lg px-3 py-2',
                        failed
                            ? 'border border-(--input-border-error) bg-(--accents-error-bg-active)'
                            : 'border border-(--separator-default) bg-(--background-segment)',
                    )}
                >
                    <Icon name="document" size={24} className="flex-none text-(--text-subtitle)" />
                    <span className="flex min-w-0 flex-auto flex-col">
                        <span className="type-dense-emphasis truncate text-(--text-title)">
                            {flow.file.name}
                        </span>
                        {/*
                         * `formatBytes`, localised — legacy prints the raw byte count with "kb" after it,
                         * so a 40 KB file reads "40960kb".
                         */}
                        <span className="type-caption-meta text-(--text-subtitle)">
                            {formatBytes(flow.file.size, currentLanguage)}
                        </span>
                    </span>
                    {flow.isValidating ? (
                        <Loader label={t('common_loading')} />
                    ) : (
                        <Button
                            data-testid="star-transfer-clear-file"
                            variant="ghost"
                            size="small"
                            iconOnly
                            aria-label={t('star_transfer_remove')}
                            onClick={flow.clearFile}
                        >
                            <Icon
                                name="xmark"
                                size={16}
                                className={failed ? 'text-(--text-error)' : undefined}
                            />
                        </Button>
                    )}
                </div>
            ) : (
                <label
                    htmlFor={inputId}
                    className="group flex cursor-pointer flex-col items-center gap-2 py-2"
                >
                    {/* The glyph in a disc, which is what gives the empty state a subject. A bare 24px
                        icon floating over a dashed rectangle is the same information with nothing to
                        look at. */}
                    <span className="flex size-10 items-center justify-center rounded-full bg-(--background-segment) text-(--text-subtitle) transition-colors duration-150 group-hover:text-(--text-title)">
                        <Icon name="upload-bracket" size={20} />
                    </span>
                    <span className="type-dense-emphasis text-(--text-title)">
                        {t('star_transfer_attach_file')}
                    </span>
                </label>
            )}

            {/* The hint stays under both states: after a refused file it is the instruction for what to do
                next, which is exactly when it is most needed. */}
            <label
                htmlFor={inputId}
                className="type-dense-default cursor-pointer text-center text-(--text-subtitle)"
            >
                {t('star_transfer_browse_hint')}
            </label>

            {message && (
                <p role="alert" className="type-caption-meta text-(--text-error)">
                    {message}
                </p>
            )}
        </div>
    )
}
