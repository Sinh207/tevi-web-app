'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatPlainAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { PayoutConfigRow } from '../api/config-types'
import { PAYOUT_CARD } from '../lib/container'
import { payoutMethodSummary } from '../lib/payout-method-summary'

/**
 * One saved payout method — legacy's card: a 36px mark, then four lines.
 *
 * ## The four lines, and why each one is there
 *
 * `Bank Transfer 24/7 (VND)` · `Ada Lovelace` · `0071000123456` · `Daily limit (remaining): …` —
 * which method, whose account, which account, and how much can still go out today. Legacy prints all
 * four and they answer different questions, so none of them is decoration. Which *field* fills the
 * middle two depends on the method (`payoutMethodSummary`).
 *
 * ## A card, and the whole card is the control
 *
 * `PAYOUT_CARD` carries the geometry and states why it is a card rather than a list row. The element is
 * one `<button>`: the only thing a card does is open its detail, so anything nested would be a second
 * tab stop for the same action. Remove lives inside that dialog — a destructive control on a list item
 * is one mis-tap from deleting the account's only way to be paid.
 *
 * ## The status only appears when it is bad
 *
 * `active` is the normal case and saying so is noise. `error` is a method the backend could not use,
 * and `usePayoutConfigs` deliberately keeps those cards visible — legacy hides them, which leaves a
 * creator with failing payouts and a screen that says nothing. The chip is how they find out.
 */
export function PayoutMethodRow({
    method,
    onOpen,
}: {
    method: PayoutConfigRow
    /** Opens the detail dialog — the only place a method can be inspected or removed. */
    onOpen: () => void
}) {
    const { t, currentLanguage } = useTranslation()
    const summary = payoutMethodSummary(method)
    const isBroken = method.status === 'error'

    return (
        <button
            type="button"
            data-testid="payout-method-row"
            data-card-id={method.id}
            onClick={onOpen}
            className={PAYOUT_CARD}
        >
            {method.methodLogo ? (
                /*
                 * Backend-served, which is the documented exception to the no-remote-images rule
                 * (`docs/STATIC_ASSETS.md`): content rather than static art. `alt=""` — the method's
                 * name is the first line beside it.
                 */
                <Image
                    src={method.methodLogo}
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 flex-none rounded-md object-contain"
                />
            ) : (
                // A method with no mark still fills the slot, or its text starts 46px inside every
                // other card's.
                <span className="flex size-9 flex-none items-center justify-center rounded-md bg-(--background-segment) text-(--icon-secondary)">
                    <Icon name="bank" size={18} aria-hidden />
                </span>
            )}

            <span className="flex min-w-0 flex-1 flex-col">
                {/* The method and its settlement currency — legacy's caption line, and the quietest of
                    the four because it is the one a reader already knows. */}
                <span className="type-caption-meta truncate text-(--text-subtitle)">
                    {method.methodCurrency
                        ? `${method.methodName} (${method.methodCurrency})`
                        : method.methodName}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                    <span className="type-body-strong min-w-0 flex-1 truncate text-(--text-title)">
                        {summary.title}
                    </span>
                    {isBroken && (
                        <span
                            data-testid="payout-method-row-status"
                            className="type-caption-meta flex-none rounded-full bg-(--accents-error-bg-active) px-2 py-0.5 text-(--text-error)"
                        >
                            {t('payout_method_status_error')}
                        </span>
                    )}
                </span>
                {summary.subtitle && (
                    <span className="type-dense-default truncate text-(--text-title)">
                        {summary.subtitle}
                    </span>
                )}
                <span
                    className={cn(
                        'type-caption-meta truncate',
                        // `—` for an unknown remainder, so the card does not read as "nothing left
                        // today" when what happened is that billy sent no figure.
                        method.dailyLimitRemainder === null
                            ? 'text-(--text-placeholder)'
                            : 'text-(--text-body)',
                    )}
                    /*
                     * `auto`, not the `ltr` every other figure in this feature carries: this line is a
                     * **sentence with a figure in it**, so forcing LTR would lay the Arabic label out
                     * left-to-right. `auto` takes the direction from the first strong character — the
                     * label — and bidi keeps `4,200.50 VND` as one LTR run inside it. Checked against
                     * `ar` in the browser, which is the only way to see it.
                     */
                    dir="auto"
                >
                    {t('payout_method_daily_remaining', {
                        /*
                         * **No currency code**, which is legacy's own output
                         * (`formatCurrency(method?.daily_limit_remainder || 0)` — a plain number).
                         *
                         * It printed `… VND` for a while, on the reasonable assumption that a limit
                         * belongs to the method's settlement currency. Nothing states that: the field
                         * arrives as a bare decimal string with no unit beside it, and `daily_limit`
                         * on the method sits next to both `currency` and `exchange_rate`, so it could
                         * as easily be the TEVI figure the backend meters in. Labelling somebody's
                         * remaining limit `VND` when it is dollars is off by a factor of 25,000 — in
                         * the reassuring direction. **B89** asks; until it answers, the number stands
                         * unlabelled exactly as it does in production today.
                         */
                        value:
                            method.dailyLimitRemainder === null
                                ? '—'
                                : formatPlainAmount(method.dailyLimitRemainder, currentLanguage),
                    })}
                </span>
            </span>
        </button>
    )
}
