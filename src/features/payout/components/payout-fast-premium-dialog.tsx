'use client'

import { PREMIUM_PATH } from '@features/premium/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { useRouter } from 'next/navigation'

/**
 * *⚡ Get Fast Withdrawal with Premium* — the sheet a locked **Fast** press raises.
 *
 * Ported from the product screenshot rather than from `web-app`'s source, because the two disagree and
 * the screenshot is the shipped screen. Legacy's `ConfirmDialog` has one description line and a
 * *Close* / *Subscribe now* pair; the real one has four parts:
 *
 * 1. a bolt beside the title,
 * 2. **"Get your money within 24 hours"** — the promise, with the duration in bold,
 * 3. the benefits sentence,
 * 4. two buttons, and the second is not a dismissal but a **choice**: *Continue with Standard
 *    Withdrawal*.
 *
 * That last one is why this is not `ConfirmDialog`. A cancel labelled *Close* leaves somebody who cannot
 * afford Premium with no stated way forward; *Continue with Standard Withdrawal* tells them the cheaper
 * option is a real answer and selects it. So the dismissal does work — it picks Saving — which a generic
 * confirm dialog has no way to express.
 *
 * ## The duration comes from the payload, not from the copy
 *
 * `metadata.payout_duration × 24`, the same arithmetic the Fast card does. Hard-coding "24 hours" into
 * the sentence would make it wrong the day the backoffice changes the option, and this is the sentence
 * the offer rests on.
 *
 * ## Still a centred dialog, not a bottom sheet
 *
 * The screenshot is a phone sheet. This app deliberately does not port `ResponsiveModal` — the decision
 * is recorded and stands — so it is a dialog at both widths.
 */
export function PayoutFastPremiumDialog({
    open,
    onClose,
    hours,
    onContinueStandard,
}: {
    open: boolean
    onClose: () => void
    /** From the option's own `payout_duration`. `null` withholds the promise line rather than guessing. */
    hours: number | null
    /** Picks the standard option and closes — see the note on the second button. */
    onContinueStandard: () => void
}) {
    const { t } = useTranslation()
    const router = useRouter()

    return (
        <Dialog open={open} onOpenChange={next => !next && onClose()}>
            <DialogContent
                data-testid="payout-request-premium-dialog"
                className="w-[420px] gap-0 overflow-hidden p-0"
            >
                {/*
                 * ## A brand header, rather than a bolt beside a heading
                 *
                 * The first version put the glyph inline with the title on a plain surface, which reads
                 * as a warning — a mark next to a sentence. This is a **sell**, so it gets the treatment
                 * the app's other paid surfaces get: the brand gradient, the mark in a filled disc over
                 * it, and the title in white.
                 *
                 * The gradient is `Card type="premium"`'s own (`--primary-400 → --primary-300 →
                 * --primary-500`), by literal rather than by using the card: that component brings a
                 * yellow inset ring and a row layout, neither of which belongs at the top of a dialog.
                 */}
                <div className="flex flex-col items-center gap-2 bg-[linear-gradient(90deg,var(--primary-400)_0%,var(--primary-300)_32.7%,var(--primary-500)_100%)] px-6 pt-6 pb-5 text-center">
                    {/*
                     * **Green, not yellow.** The bolt is one mark across this feature — the Fast card, the
                     * note under the cards, and this header — so it carries one colour. Yellow read as a
                     * warning glyph that happened to be a bolt; `--accents-success-active` is what the
                     * card uses and what legacy draws.
                     */}
                    <span className="flex size-12 items-center justify-center rounded-full bg-(--white)/15">
                        <Icon
                            weight="filled"
                            name="bolt-lightning"
                            size={24}
                            aria-hidden
                            className="text-(--accents-success-active)"
                        />
                    </span>
                    <DialogTitle className="type-title-t2-semibold text-(--white)">
                        {t('payout_request_premium_title')}
                    </DialogTitle>
                </div>

                <div className="flex flex-col gap-3 px-4 pt-5 pb-4 sm:px-6 sm:pb-6">
                    {/*
                     * The promise, with the duration in bold — the one figure in the sheet, so it carries
                     * the emphasis rather than the whole sentence. Withheld when the payload states no
                     * duration: a promise about speed with no speed in it is worse than one line fewer.
                     */}
                    {hours !== null && (
                        <p className="type-body-default m-0 text-center text-(--text-title)">
                            {t('payout_request_premium_promise')}{' '}
                            <strong className="type-body-strong">
                                {t('payout_request_option_hours', { hours })}
                            </strong>
                        </p>
                    )}

                    <p className="type-dense-default m-0 text-center text-(--text-body)">
                        {t('payout_request_premium_body')}
                    </p>

                    <Button
                        data-testid="payout-request-premium-subscribe"
                        variant="accent"
                        size="large"
                        fullWidth
                        onClick={() => {
                            onClose()
                            router.push(PREMIUM_PATH)
                        }}
                    >
                        {t('payout_request_premium_action')}
                    </Button>

                    {/*
                     * **A choice, not a dismissal.** It selects the standard option and closes, which is what
                     * its label promises — a button reading *Continue with Standard Withdrawal* that merely
                     * shut the dialog would leave the reader to go and pick Saving themselves, having just
                     * been told they were continuing.
                     */}
                    <Button
                        data-testid="payout-request-premium-standard"
                        /*
                         * **`ghost`, not `secondary`.** Both buttons here are real choices, but they are
                         * not equal ones: the subscribe button is the offer and this is the way past it.
                         * An outlined `secondary` gives the two the same visual weight, which turns a
                         * sheet with a recommendation into a sheet asking a question — and it is the
                         * shape that makes somebody hesitate over the cheaper option.
                         *
                         * Text-only keeps it a full-width, reachable control (still a `Button`, still
                         * `size="large"`, so the tap target does not shrink) while reading as secondary.
                         */
                        variant="ghost"
                        size="large"
                        fullWidth
                        onClick={() => {
                            onContinueStandard()
                            onClose()
                        }}
                    >
                        {t('payout_request_premium_standard')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
