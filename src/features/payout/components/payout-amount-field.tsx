'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { PAYOUT_BLOCK } from '../lib/container'
import type { PayoutAmountError } from '../lib/payout-amount'

/**
 * *Withdraw amount* — a port of legacy's `withdrawAmount/index.js`.
 *
 * ## The header carries the rate, and I had left it out
 *
 * `($1.00 ≈ 25,457.68 VND)`, right-aligned against the section title. It is the only place on the screen
 * that says what a dollar becomes in the settlement currency, and without it the net figure in the
 * summary arrives with no explanation of how it got so large. Legacy puts it here; so does this.
 *
 * ## **Max** sits beside the field, not inside it
 *
 * Legacy's grid is two halves: the input on the left, the Max button right-aligned on the right, 14/400
 * in `#501BC0` (`--text-brand`). I had put it inside the input's border, which reads as an affix — a
 * part of the field rather than a control that changes it.
 *
 * ## The helper line is a **range**, not a ceiling
 *
 * *"Enter an amount between $10.00 and $4,400.03"* — legacy's `helperText`, replaced by the error when
 * there is one. My version printed only the maximum, which leaves somebody who types `5` guessing at
 * why it was refused.
 *
 * ## What is deliberately not ported: `isAllowed`
 *
 * Legacy blocks the keystroke that would exceed the ceiling and silently rewrites the field to
 * `min(maxAmount, balance)`. Not reproduced: a field that edits itself mid-typing is how a caret ends
 * up somewhere the reader did not put it, and the rewrite is invisible — somebody typing `5000` into a
 * `4400` ceiling gets `4400` with no statement that anything was capped. Here the figure is accepted and
 * the range is stated, which is the same information delivered where it can be read.
 */
export function PayoutAmountField({
    amount,
    onChange,
    maxAmount,
    minAmount,
    exchangeRate,
    currency,
    error,
}: {
    amount: number | null
    onChange: (value: number | null) => void
    maxAmount: number
    /**
     * The method's own floor. **Not the constant**: the live payload puts `"15.00"` on VAI Wallet and
     * `null` on bank transfer, so a hint that always said `$10.00` would be wrong on one of them —
     * and it is the sentence somebody reads to find out why their figure was refused.
     */
    minAmount: number
    /** The method's rate, for the header line. `null` withholds it rather than printing `≈ 0`. */
    exchangeRate: number | null
    currency: string
    error: PayoutAmountError | { key: null; text: string } | null
}) {
    const { t, currentLanguage } = useTranslation()

    const errorText = error
        ? error.key === null
            ? error.text
            : t(error.key, {
                  amount:
                      'limit' in error
                          ? formatFiatAmount(error.limit, DEFAULT_CURRENCY, currentLanguage)
                          : '',
              })
        : null

    return (
        <section className={cn(PAYOUT_BLOCK, 'flex flex-col gap-2 bg-(--background-surface) p-3')}>
            <div className="flex items-baseline justify-between gap-3">
                <span className="type-body-strong text-(--text-title)">
                    {t('payout_request_amount_label')}
                </span>
                {/*
                 * `$1.00 ≈ <rate> <currency>`. Withheld entirely when the method states no rate: a
                 * conversion line with a zero in it is worse than none, since it reads as a rate of
                 * zero rather than as an unknown one.
                 */}
                {exchangeRate !== null && currency && (
                    <span
                        dir="ltr"
                        data-testid="payout-request-rate"
                        className="type-dense-default text-(--text-body)"
                    >
                        {`(${formatFiatAmount(1, DEFAULT_CURRENCY, currentLanguage)} ≈ ${new Intl.NumberFormat(
                            currentLanguage,
                        ).format(exchangeRate)} ${currency})`}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2">
                <div
                    className={cn(
                        'flex min-w-0 flex-1 items-center gap-1 border-b py-2',
                        errorText
                            ? 'border-(--accents-error-active)'
                            : 'border-(--separator-default) focus-within:border-(--text-brand)',
                    )}
                >
                    <span className="type-body-strong text-(--text-title)">
                        {DEFAULT_CURRENCY.symbol}
                    </span>
                    <input
                        id="payout-amount"
                        data-testid="payout-request-amount"
                        /*
                         * `text` + `inputMode="decimal"`, never `type="number"`: the spinner is wrong on
                         * money, `1e5` parses, and several locales get a keypad with no decimal key.
                         *
                         * Legacy uses `react-number-format` for grouping while typing. Not adopted — a
                         * formatter that rewrites the field under the cursor is a caret bug waiting on a
                         * locale with a different separator. The figure is grouped where it is *read*
                         * (the header, the helper, the summary, the bar) and left alone where it is typed.
                         */
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        value={amount === null ? '' : String(amount)}
                        onChange={event => {
                            const raw = event.target.value.trim()
                            if (raw === '') {
                                onChange(null)
                                return
                            }
                            // Commas stripped, so `1,000` is not reported as a missing amount.
                            const parsed = Number(raw.replaceAll(',', ''))
                            onChange(Number.isNaN(parsed) ? Number.NaN : parsed)
                        }}
                        aria-invalid={errorText ? true : undefined}
                        aria-describedby="payout-amount-helper"
                        className="type-body-strong min-w-0 flex-1 bg-transparent text-(--text-title) outline-none placeholder:text-(--text-placeholder)"
                        placeholder="0.00"
                    />
                </div>
                {/*
                 * Beside the field, right-aligned — legacy's own placement. 14/400 in `--text-brand`,
                 * with the size-`small` padding undone the way every text-button in this repo does it.
                 */}
                <Button
                    data-testid="payout-request-max"
                    variant="ghost"
                    size="small"
                    disabled={maxAmount <= 0}
                    onClick={() => onChange(maxAmount)}
                    className="type-dense-default h-auto flex-none px-0 text-(--text-brand) hover:not-disabled:bg-transparent hover:underline"
                >
                    {t('payout_request_max')}
                </Button>
            </div>

            {/*
             * The error replaces the range, as legacy's `helperText` does. `role="alert"` only when it is
             * an error: a helper line announcing itself on every render is noise in a screen reader.
             */}
            <p
                id="payout-amount-helper"
                role={errorText ? 'alert' : undefined}
                data-testid={errorText ? 'payout-request-amount-error' : undefined}
                className={cn(
                    'type-caption-meta m-0',
                    errorText ? 'text-(--accents-error-active)' : 'text-(--text-body)',
                )}
            >
                {errorText ??
                    t('payout_request_amount_range', {
                        min: formatFiatAmount(minAmount, DEFAULT_CURRENCY, currentLanguage),
                        max: formatFiatAmount(maxAmount, DEFAULT_CURRENCY, currentLanguage),
                    })}
            </p>
        </section>
    )
}
