'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatAmountWithCode } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Loader } from '@shared/ui/loader'
import { PayoutTermsNote } from './payout-terms-note'

/**
 * The footer — *Receive amount* and the send button.
 *
 * Built to match **`/get-star`**'s footer rather than legacy's, and the two differences are both fixes.
 *
 * ## `sticky bottom-0 mt-auto`, not `fixed`
 *
 * Legacy is `position: fixed` with a hand-computed `max-width: 612px`. Sticky needs neither: it stays in
 * the column, so it inherits the 612 and needs no width of its own, and it takes up space in the flow —
 * which removes the 80px spacer legacy reserves (`mb: '80px'`) and that I had copied. A spacer is a
 * number that has to be kept in step with the bar's height, and it never is.
 *
 * `mt-auto` puts it at the foot of a *short* page instead of halfway up one.
 *
 * ## **No offset for the mobile tab bar**, and this was a real bug
 *
 * I had `bottom-[84px]`, reasoning that the bar must clear the tab bar. It must not: `TabBarShell`
 * renders that bar — and reserves its 84px — only on the four tab destinations plus the reader's own
 * channel (`isTabDestination`), and `/my-wallet/payout-request` is none of them. So the offset lifted the
 * footer 84px into empty space, over content that cannot be scrolled out from under it.
 *
 * `/get-star`'s footer carries the same note, arrived at the same way; `follow-requests-view.tsx`
 * measured it first.
 *
 * ## `-mx-4 px-4 md:mx-0 md:px-0`
 *
 * Undoes the column's phone inset. A footer that spans the window is the one thing on this screen that
 * should touch both edges — below `md` the column is the screen, and a bar inset by 16 reads as a card.
 *
 * ## The figure is a **live region**; the button is outside it
 *
 * Changing the amount, the method or the option changes the net, and none of those controls announces
 * it. `polite` waits for a gap rather than cutting a radio off, and `atomic` because the label and the
 * figure are one sentence. The button stays outside: it would otherwise announce the same figure twice
 * on every keystroke — exactly the split `/get-star` makes.
 */
export function PayoutRequestActions({
    netAmount,
    netCurrency,
    canSubmit,
    isSubmitting,
    onReview,
}: {
    netAmount: number | null
    netCurrency: string
    canSubmit: boolean
    isSubmitting: boolean
    /** Opens the confirm dialog. Never submits — legacy's `handleOpen('confirm')`. */
    onReview: () => void
}) {
    const { t, currentLanguage } = useTranslation()

    return (
        <div
            className={cn(
                '-mx-4 md:mx-0 sticky bottom-0 z-10 mt-auto flex flex-col gap-3',
                'border-(--separator-default) border-t bg-(--background) px-4 pt-4 pb-4 md:px-0',
            )}
        >
            <div
                aria-live="polite"
                aria-atomic="true"
                className="flex items-center justify-between gap-3"
            >
                <span className="type-dense-default text-(--text-subtitle)">
                    {t('payout_request_receive_amount')}
                </span>
                {/*
                 * Absent rather than `—` before the quote lands: a dash where a figure will be reads as
                 * zero, and this is the number somebody decides on. `tabular-nums` so it does not jitter
                 * as the amount is typed.
                 */}
                {netAmount !== null && (
                    <span
                        dir="ltr"
                        data-testid="payout-request-receive"
                        className="type-title-t2-semibold flex-none text-(--accents-indigo-active) tabular-nums"
                    >
                        {formatAmountWithCode(netAmount, netCurrency, currentLanguage)}
                    </span>
                )}
            </div>

            <Button
                data-testid="payout-request-submit"
                variant="accent"
                size="large"
                className="w-full"
                disabled={!canSubmit}
                aria-busy={isSubmitting}
                onClick={onReview}
            >
                {isSubmitting && <Loader className="size-[18px]" />}
                {t('payout_request_send')}
            </Button>

            {/*
             * *"By clicking “Send request”, you are agreeing to Tevi Terms and conditions"* — legacy's
             * sentence, and it names the button on purpose.
             *
             * **Under the button, not at the foot of the summary** where legacy puts it. Legacy's own
             * placement leaves the agreement above two fee lines and a pinned bar, so the last thing
             * before the press is a figure and the terms are somewhere up the page. Here it sits with
             * the press it describes — which is also where `setup-payouts` and `payout-method` put
             * theirs, so the three screens agree.
             *
             * `PayoutTermsNote` carries the mechanism: a real `Link` in a new tab, and prefix-plus-link
             * rather than legacy's `dangerouslySetInnerHTML` fed from a translation file.
             */}
            <PayoutTermsNote
                testId="payout-request-terms"
                prefixKey="payout_request_terms_prefix"
                linkKey="payout_request_terms_link"
            />
        </div>
    )
}
