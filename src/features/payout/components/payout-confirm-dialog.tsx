'use client'

import { DialogScreenHeader } from '@shared/components/dialog-screen-header'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatAmountWithCode } from '@shared/lib/money'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent } from '@shared/ui/dialog'
import { Loader } from '@shared/ui/loader'
import Image from 'next/image'
import type { PayoutConfigRow } from '../api/config-types'
import type { PayoutOption } from '../api/payout-request-api'
import { PAYOUT_CONFIG_ORDER, payoutConfigLabelKey } from '../lib/payout-config-labels'
import { formatPayoutEtaRange } from '../lib/payout-eta'

/**
 * **Confirm this withdrawal** — the step between the send button and the request.
 *
 * Rebuilt from the product screenshot, and the shape it turned out to be is one this app already has:
 * **the same three-part figure sheet as `LedgerDetailDialog`** — a tinted strip, one large centred
 * amount, then label/value rows. That is not a coincidence to paper over; it is the pattern Tevi uses
 * whenever a single transaction is the subject, and matching it means a creator who has read one of
 * these can read the other.
 *
 * What I had was a titled dialog with the rows first and the figure last, which reads as a form summary
 * rather than a receipt-to-be.
 *
 * ## The strip is the **ETA**, not a status — and not the header either
 *
 * `LedgerDetailDialog`'s strip says *"Transaction completed successfully on …"*; this one says
 * *"Estimated receive time"* with the date range on the right. Same geometry, same success tint —
 * because on this screen the reassuring thing is *when the money arrives*, and it is the one fact a
 * reader cannot get from the figure.
 *
 * It used to double as the title band, holding `DialogTitle` as its left label and the close disc
 * beside the date. That left the dialog **unnamed** — nothing said what was being confirmed — and put a
 * trailing close on a `p-0` popup, which is the wrong edge for a screen-shaped dialog. There is now a
 * real `DialogScreenHeader` above it, matching legacy's *Confirm to withdraw* band.
 *
 * Dark takes the brighter rung for the reason that strip's own note gives: at low luminance the success
 * hue stops reading and a near-black green becomes a dark band.
 *
 * ## The figure is the **net** — what actually arrives, after fees
 *
 * `quote.net_amount`, which is legacy's `receiveAmount`
 * (`roundToTwo(parseFloat(payoutSummary.net_amount))`) and the same figure its confirm dialog prints.
 *
 * This was wrong, and the reasoning behind the wrong version was backwards. It showed `amount × rate`
 * — legacy's **`subReceiveAmount`**, the *gross* — on the grounds that "the net is the footer's job and
 * repeating it here would contradict the bar it was opened from". It is the other way round: the bar
 * says *Receive amount* and the dialog said a bigger number, so the dialog was the contradiction. On a
 * VND method with a 5% fast fee that is a difference of millions, presented as the thing being
 * confirmed.
 *
 * A confirmation states what the reader gets. The gross belongs where legacy puts it — the screen's own
 * *Sub-receive amount* row — and it is already there.
 *
 * **No quote, no figure**: a dash, not an invented one. `amount × rate` here would be the gross again,
 * and legacy's `0` is worse than either — a specific wrong number. The footer withholds its figure in
 * the same state, so the two stay in step.
 *
 * ## The rows come from `config.form`, not from a hard-coded list
 *
 * Legacy enumerates eleven fields with an `allowed` flag each. Here the fields are whatever the method
 * declares (**B84**), walked in `PAYOUT_CONFIG_ORDER` so the order does not shuffle between methods, and
 * labelled from the table the payout-method screens already share. A method that starts sending a new
 * field shows it without a code change.
 */
export function PayoutConfirmDialog({
    open,
    onClose,
    onConfirm,
    config,
    option,
    netAmount,
    netCurrency,
    isSubmitting,
}: {
    open: boolean
    onClose: () => void
    onConfirm: () => void
    config: PayoutConfigRow | null
    option: PayoutOption | null
    /**
     * The quote's `net_amount` — what the account actually receives. `null` before a quote lands, and
     * then the figure is withheld rather than guessed; see the note above.
     */
    netAmount: number | null
    /** The quote's `net_amount_currency`, falling back to the method's. */
    netCurrency: string
    isSubmitting: boolean
}) {
    const { t, currentLanguage } = useTranslation()

    if (!config) return null

    /*
     * `PAYOUT_CONFIG_ORDER` rather than `Object.keys(detail)`: the payload's key order is the backend's,
     * and a confirmation whose rows move between methods is one nobody can scan. Empty values are
     * skipped — legacy's `allowed` flag by another name.
     */
    const rows = PAYOUT_CONFIG_ORDER.filter(field => Boolean(config.detail[field])).map(field => ({
        field,
        labelKey: payoutConfigLabelKey(field, config.methodSlug),
        value: config.detail[field],
    }))

    const DAY_MS = 86_400_000
    const days = option?.durationDays ?? (option?.kind === 'fast' ? 1 : 15)
    const eta =
        option?.kind === 'fast'
            ? t('payout_request_option_hours', { hours: days * 24 })
            : formatPayoutEtaRange(
                  Date.now() + days * DAY_MS,
                  Date.now() + (days + 1) * DAY_MS,
                  currentLanguage,
              )

    /* What arrives. See the note above on why this is the net and not `amount × rate`. */
    const figure =
        netAmount === null ? null : formatAmountWithCode(netAmount, netCurrency, currentLanguage)

    return (
        <Dialog open={open} onOpenChange={next => !next && onClose()}>
            <DialogContent
                data-testid="payout-request-confirm-dialog"
                className="w-[512px] gap-0 p-0"
            >
                {/*
                 * **The band, which this dialog was missing.**
                 *
                 * It had none: the ETA strip doubled as the header, with `DialogTitle` standing in as
                 * the strip's left-hand label and the close disc wedged into the strip beside the date.
                 * That left the dialog unnamed — nothing on it said *what* was being confirmed — and it
                 * put a trailing close disc on a `p-0` screen-shaped popup, which is the wrong edge
                 * (`docs/DESIGN_SYSTEM.md` §7). Legacy has the band: *Cancel* leading, *Confirm to
                 * withdraw* centred.
                 *
                 * So the title moves here and the strip goes back to being one fact.
                 */}
                <DialogScreenHeader
                    title={t('payout_request_confirm_title')}
                    testId="payout-request-confirm-header"
                />

                {/*
                 * The ETA strip — no longer the header, so it carries the date and nothing else.
                 * `items-center` now that there is no 40px control to align a label against.
                 */}
                <div className="flex items-center justify-between gap-3 bg-(--accents-success-bg-active) px-4 py-3 dark:bg-(--accents-success-bg-focus)">
                    <p className="type-dense-default m-0 text-(--text-subtitle)">
                        {t('payout_request_eta')}
                    </p>
                    <span
                        dir="ltr"
                        data-testid="payout-request-confirm-eta"
                        className="type-dense-strong shrink-0 text-(--text-title)"
                    >
                        {eta}
                    </span>
                </div>

                <div className="flex flex-col items-center gap-1 px-4 py-6">
                    <p
                        dir="ltr"
                        data-testid="payout-request-confirm-amount"
                        className="type-heading-h1-bold m-0 text-center text-(--text-title)"
                    >
                        {figure ?? '—'}
                    </p>
                    <p className="type-body-default m-0 text-center text-(--text-body)">
                        {t('payout_request_title')}
                    </p>
                </div>

                <div className="flex flex-col gap-3 border-(--separator-default) border-t px-4 py-4">
                    <Row
                        label={t('payout_request_method_label')}
                        value={
                            config.methodCurrency
                                ? `${config.methodName} (${config.methodCurrency})`
                                : config.methodName
                        }
                        logo={config.methodLogo}
                    />
                    {rows.map(row => (
                        <Row
                            key={row.field}
                            label={row.labelKey ? t(row.labelKey) : row.field}
                            value={row.value}
                        />
                    ))}
                </div>

                <div className="px-4 pt-2 pb-6">
                    <Button
                        data-testid="payout-request-confirm"
                        variant="accent"
                        size="large"
                        fullWidth
                        disabled={isSubmitting}
                        aria-busy={isSubmitting}
                        onClick={onConfirm}
                    >
                        {isSubmitting ? (
                            <Loader className="size-[18px]" />
                        ) : (
                            t('payout_request_send')
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * One label/value line, with the method's mark when there is one.
 *
 * `truncate` on the value: an account number must not wrap mid-digit-group, and a wallet address is long
 * enough that it always would.
 */
function Row({ label, value, logo }: { label: string; value: string; logo?: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="type-dense-default flex-none text-(--text-body)">{label}</span>
            <span className="flex min-w-0 items-center gap-2">
                {logo && (
                    <Image
                        src={logo}
                        alt=""
                        aria-hidden
                        width={24}
                        height={24}
                        className="flex-none rounded-full"
                        unoptimized
                    />
                )}
                <span
                    dir="ltr"
                    className="type-dense-strong min-w-0 truncate text-end text-(--text-title)"
                >
                    {value}
                </span>
            </span>
        </div>
    )
}
