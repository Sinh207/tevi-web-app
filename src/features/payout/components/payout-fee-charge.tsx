'use client'

import { useTranslation } from '@shared/i18n/use-translation'

/**
 * What a fee row shows on its value side: a deduction, a **waived** deduction, or a dash.
 *
 * ## Why this is a component and not two copies
 *
 * Two screens print a fee breakdown — the withdraw *request* (`PayoutRequestSummary`, from the quote)
 * and the withdraw *detail* (`PayoutDetailRows`, from the request DTO). They read different DTOs, so
 * the *arithmetic* cannot be shared, but the three display states are identical, and only the detail
 * screen had them: the request summary printed every fee as a live charge, waived or not.
 *
 * ## The two ways to get this wrong, measured
 *
 * Both were live, and they fail differently — which is why the fix is *both* halves and not either
 * one. On a fixture whose waived transaction fee would have cost 50 TEVI (≈1,272,884 VND):
 *
 * | | the row reads | does the block add up? |
 * |---|---|---|
 * | **ignoring `original`** (what shipped here) | `Transaction fee: ---` · `-0 VND` | yes, meaninglessly |
 * | **`original` first, no waiver treatment** (legacy's own request screen) | `Transaction fee: 1 USD + 5%` · `-1,272,884 VND` | **no** — 110,741,672 against a stated net of 112,014,556 |
 * | this | `1 USD + 5%` · ~~`-1,272,884`~~ *Free* | yes |
 *
 * So reading `original` without saying "waived" would have *introduced* a broken sum, because the
 * backend's `net_amount` already reflects the waiver. The shipped bug was quieter: a fee row with no
 * rate and a `-0`, which hides that a fee exists and was forgiven.
 *
 * `payout-fees.ts` predicted the drift in writing: it kept legacy's shared label keys "so the two
 * screens cannot drift once the request flow lands". The request flow landed with its own copy of the
 * keys and none of the waiver handling. This is the other half of that lesson.
 *
 * ## The three states, and why a waived fee shows a number at all
 *
 * Legacy's own treatment (`withdrawDetail/.../detail/index.js`): the amount it **would** have cost,
 * struck through, then *Free*. Printing only "Free" hides the size of the discount; printing only the
 * number says it was charged. Both halves are needed.
 */
export function PayoutFeeCharge({
    /**
     * The charge, already formatted **and already the pre-waiver figure when waived** — the parsers
     * read `original` first, so the caller does not choose. `null` when there is no rate to convert
     * with, or no subtotal.
     */
    charge,
    isWaived,
}: {
    charge: string | null
    isWaived: boolean
}) {
    const { t } = useTranslation()

    if (isWaived) {
        return (
            <span className="flex items-center justify-end gap-1">
                {charge && (
                    <span className="type-dense-default text-(--text-placeholder) line-through">
                        -{charge}
                    </span>
                )}
                {/*
                 * `--text-success`, the DS's own semantic token, and matched to the detail screen
                 * deliberately rather than repainted here.
                 *
                 * ⚠ Measured, it is `--accents-success-active` (`#26bb26`) in both modes — **2.32:1**
                 * on a Light `--background-subtle` ground, under AA for 14px. That is a design-system
                 * property, not this component's: `--text-success` is what the whole app uses, so
                 * deviating in one row would only create drift. It is worth raising with Brand; it is
                 * not worth fixing here alone.
                 */}
                <span className="type-dense-strong text-(--text-success)">
                    {t('payout_fee_free')}
                </span>
            </span>
        )
    }

    // `—`, not `0`: a zero is a claim about a charge nobody confirmed.
    if (charge === null) return <>—</>

    return <span className="text-(--text-error)">-{charge}</span>
}
