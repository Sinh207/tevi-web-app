'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatAmountWithCode } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Loader } from '@shared/ui/loader'
import type { PayoutQuote } from '../api/payout-request-api'
import { PAYOUT_BLOCK } from '../lib/container'
import { PAYOUT_FEE_ORDER, payoutFeeLabel } from '../lib/payout-fees'
import { PayoutFeeCharge } from './payout-fee-charge'
import { PayoutFeeHelp } from './payout-fee-help'

/**
 * The fee breakdown — legacy's `withdrawalSummary/`, and three things I had missing.
 *
 * ## 1. **Sub-receive amount** is the first line, and without it the block does not add up
 *
 * `amount × rate` in the settlement currency — what the gross is worth before fees. Legacy shows it
 * above a dashed divider, then the deductions, then the net. Leaving it out is what made my version
 * jump from a figure in dollars to two deductions in dong with nothing to subtract them from.
 *
 * ## 2. Each fee's title carries its **rate**, not just its name
 *
 * *"Withdraw fee: 5%"*, *"Transaction fee: 1 USD + 5%"* — legacy's `formatTitle`, which composes the flat
 * and percent components and prints `---` when a fee states neither. The charge alone tells a creator
 * what was taken; the rate tells them why, and it is the half that answers "is this right?".
 *
 * ## 3. The help glyph is a **control**, on two of the three rows
 *
 * This shipped as an inert mark, on the reading that legacy's `IconBtnHelp` here had no handler. It
 * does: `withdrawalSummary` imports `iconBtnHelpWithdrawFee` and `iconBtnHelpTransactionFee` — the same
 * two dialogs the withdraw *detail* screen opens, already ported as `PayoutFeeHelp` — and hangs them off
 * `payout_fee` and `payout_transaction_fee`. So both are pressable here too, from one copy of the copy.
 *
 * `payout_option_fee` keeps neither: legacy draws no glyph on that row, and no sentence explaining a
 * withdraw *option* fee exists in either app. A `?` opening nothing was the actual defect.
 *
 * ## The three states, and the failure withholds
 *
 * Quoting shows a loader with the previous figures gone — a price being recalculated must not read as the
 * current price. A failed quote shows one line and **no figures at all**: a stale quote here is a price
 * the server has not agreed to.
 */
export function PayoutRequestSummary({
    quote,
    isQuoting,
    isError,
    amount,
    currency,
    exchangeRate,
}: {
    quote: PayoutQuote | null
    isQuoting: boolean
    isError: boolean
    amount: number | null
    currency: string
    /** For the sub-receive line — `amount × rate`. `null` withholds the line. */
    exchangeRate: number | null
}) {
    const { t, currentLanguage } = useTranslation()

    if (isQuoting) {
        return (
            <section className="flex items-center justify-center rounded-xl bg-(--background-surface) p-3">
                <Loader />
            </section>
        )
    }

    if (isError) {
        return (
            <section className="rounded-xl bg-(--background-surface) p-3" role="status">
                <p
                    data-testid="payout-request-quote-error"
                    className="type-dense-default m-0 text-(--text-body)"
                >
                    {t('payout_request_quote_unavailable')}
                </p>
            </section>
        )
    }

    if (!quote || amount === null) return null

    /*
     * Legacy's three fee types, in its order — `payout_fee`, `payout_transaction_fee`,
     * `payout_option_fee` — rather than `Object.values(quote.fees)`. The payload's key order is the
     * backend's, and a breakdown whose lines move between options is one nobody can scan. A type the
     * quote does not carry is skipped, which is legacy's `allowed` flag.
     */
    const subReceive = exchangeRate !== null ? Math.round(amount * exchangeRate * 100) / 100 : null

    return (
        <section
            className={cn(PAYOUT_BLOCK, 'flex flex-col gap-2 bg-(--background-surface) p-3')}
            data-testid="payout-request-summary"
        >
            {/* Sub-receive, then a dashed rule — legacy's own separator on this block. */}
            {subReceive !== null && (
                <>
                    <div className="flex items-center justify-between gap-3">
                        <span className="type-dense-default text-(--text-body)">
                            {t('payout_request_sub_receive')}
                        </span>
                        <span
                            dir="ltr"
                            data-testid="payout-request-sub-receive"
                            className="type-dense-strong text-(--text-title)"
                        >
                            {formatAmountWithCode(subReceive, currency, currentLanguage)}
                        </span>
                    </div>
                    <hr className="m-0 border-(--separator-default) border-t border-dashed" />
                </>
            )}

            {PAYOUT_FEE_ORDER.map(type => {
                const fee = quote.fees[type]
                if (!fee) return null
                /*
                 * `1 USD + 5%` / `5%` / `1 USD`, and `---` when the fee states neither — legacy's
                 * `formatTitle`, including the em-dash fallback. The pieces are composed here rather
                 * than in a lib because the join words are translations.
                 */
                const parts: string[] = []
                if (fee.flatFeeAmount > 0) parts.push(`${fee.flatFeeAmount} USD`)
                if (fee.percentFeeRate > 0) parts.push(`${fee.percentFeeRate}%`)
                const rate = parts.length > 0 ? parts.join(' + ') : '---'
                const feeLabel = payoutFeeLabel(type)

                /*
                 * **The charge is converted, and this was wrong.**
                 *
                 * `subtotal.amount` is quoted in the *amount's* currency — `TEVI` on the live payload —
                 * while every other figure on this block is in the **settlement** currency. Legacy
                 * multiplies it out (`feeAmount = roundToTwo(amount * exchangeRate)`) and I was printing
                 * the raw value with its own currency code.
                 *
                 * On a rate-1 method (USDT) the two are identical, which is why it looked right. On VND
                 * at 25,429.85 the line read `-250.00 TEVI` where it should read `-6,357,463 VND` — four
                 * orders of magnitude, and it does not subtract from the sub-receive figure above it, so
                 * the block stops adding up.
                 *
                 * `payoutComputeRate` in `payout-fees.ts` had this arithmetic already, for the withdraw
                 * *detail* screen. It just was not being used here.
                 *
                 * With no rate the raw charge is shown in its own unit instead of a converted guess.
                 */
                const charge =
                    fee.subtotal === null
                        ? null
                        : exchangeRate !== null
                          ? Math.round(fee.subtotal * exchangeRate * 100) / 100
                          : fee.subtotal
                const chargeCurrency =
                    exchangeRate !== null ? currency : fee.subtotalCurrency || currency

                return (
                    <div
                        key={type}
                        data-testid="payout-request-fee"
                        data-option-value={type}
                        className="flex items-start justify-between gap-3"
                    >
                        <span className="type-dense-default flex items-center gap-1 text-(--text-body)">
                            {/*
                             * `payoutFeeLabel`, **not a local copy of the three keys.** This file had
                             * its own `payout_request_fee_*` trio saying the same thing as the shared
                             * `payout_fee_*` — and they had already drifted in translation (`vi`:
                             * "Tùy chọn rút" vs "Hình thức rút"; `ar`: "رسوم العملية" vs
                             * "رسوم المعاملة"), which is precisely what `payout-fees.ts`'s note about
                             * keeping one key set was written to prevent. The duplicates are gone from
                             * all nine locales.
                             */}
                            {/*
                             * ⚠ `?? ` a **slug**, not `''`. `t('')` returns the empty string, so an
                             * unlabelled fee would print no label at all — a charge on a breakdown
                             * with nothing naming it. `PAYOUT_FEE_ORDER` and `FEE_LABELS` happen to
                             * carry the same three keys today, which made that unreachable by
                             * coincidence; `PayoutDetailRows` already falls back to billy's own slug
                             * and this now matches it.
                             */}
                            {feeLabel ? t(feeLabel, { rate }) : `${type}: ${rate}`}
                            {/*
                             * **The two fees legacy can explain, explained** — and only those two.
                             * `withdrawalSummary` imports `iconBtnHelpWithdrawFee` and
                             * `iconBtnHelpTransactionFee`, the same pair the withdraw *detail* rows
                             * use, so this is `PayoutFeeHelp` rather than a third copy of the copy.
                             *
                             * `payout_option_fee` gets **no glyph**: legacy hangs nothing off it, and
                             * there is no sentence anywhere in either app that says what a withdraw
                             * option fee is. A `?` that opens nothing is worse than no `?` — this
                             * block used to draw one on all three rows.
                             */}
                            {type === 'payout_fee' && <PayoutFeeHelp kind="withdraw" />}
                            {type === 'payout_transaction_fee' && (
                                <PayoutFeeHelp kind="transaction" />
                            )}
                        </span>
                        {/*
                         * **A waived fee now says so**, which it did not.
                         *
                         * The parser reads `original` first (`PayoutQuoteFee.isWaived`), so `charge`
                         * here is the *pre*-waiver figure — and the waiver treatment is not optional
                         * alongside that: printing the pre-waiver amount as a live deduction is what
                         * legacy's own request screen does, and it leaves the block **not adding up**
                         * (measured: 110,741,672 against a stated net of 112,014,556, because
                         * `net_amount` already reflects the waiver). Before either change the row read
                         * `Transaction fee: ---` and `-0` — consistent, and meaningless.
                         *
                         * `PayoutFeeCharge` is the detail screen's treatment, now shared.
                         */}
                        <span dir="ltr" className="type-dense-strong shrink-0">
                            <PayoutFeeCharge
                                charge={
                                    charge === null
                                        ? null
                                        : formatAmountWithCode(
                                              charge,
                                              chargeCurrency,
                                              currentLanguage,
                                          )
                                }
                                isWaived={fee.isWaived}
                            />
                        </span>
                    </div>
                )
            })}
        </section>
    )
}
