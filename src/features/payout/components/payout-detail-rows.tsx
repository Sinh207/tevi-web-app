'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import { formatAmountWithCode } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { ReactNode } from 'react'
import type { PayoutRequestDetail } from '../api/types'
import {
    PAYOUT_CONFIG_COPYABLE,
    PAYOUT_CONFIG_ORDER,
    payoutConfigLabelKey,
} from '../lib/payout-config-labels'
import { payoutFeeLabel, payoutFeeLines, payoutSubReceive } from '../lib/payout-fees'
import { PayoutCopyValue } from './payout-copy-value'
import { PayoutFeeCharge } from './payout-fee-charge'
import { PayoutFeeHelp } from './payout-fee-help'

/**
 * `label` left, value right — the shape every row on the payout detail screen takes.
 *
 * Not `ListRow`: that part is a 48px-tall list *item* with a leading slot and a trailing accessory,
 * built for rows you can press. These are label/value pairs inside a folded section, which is a
 * different object — legacy uses a `Grid` 4/8 split and no list component either.
 */
export function PayoutDetailRow({
    label,
    value,
    /** The figure a reader is meant to leave with — the net, and the gross it came from. */
    strong,
    className,
    testId,
    rowKey,
}: {
    label: ReactNode
    value: ReactNode
    strong?: boolean
    className?: string
    /**
     * The element's own `data-testid`, plus its identity in a companion attribute. Passed as props
     * rather than spread: this component has a closed prop list, so a `data-testid` handed to it
     * would be dropped silently — see docs/TEST_IDS.md.
     */
    testId?: string
    rowKey?: string
}) {
    return (
        <div
            data-testid={testId}
            data-row-key={rowKey}
            className={cn('flex items-start justify-between gap-3 py-1.5', className)}
        >
            <span className="type-dense-default shrink-0 text-(--text-body)">{label}</span>
            <span
                // `dir="ltr"` for the reason `LedgerRow` gives: a figure in an RTL paragraph must
                // stay one LTR run or its parts reorder.
                dir="ltr"
                className={cn(
                    'min-w-0 break-words text-end',
                    strong
                        ? 'type-dense-strong text-(--text-title)'
                        : 'type-dense-emphasis text-(--text-title)',
                )}
            >
                {value}
            </span>
        </div>
    )
}

/**
 * The fee breakdown, gross to net.
 *
 * ## Every fee line, including one this client cannot name
 *
 * `payoutFeeLabel` returns `null` for an unknown fee type and the row then prints billy's own slug.
 * Legacy renders **nothing** for a fee it does not recognise, which hides a charge from the one
 * breakdown whose whole job is to account for the gap between what was requested and what arrived.
 *
 * ## A waived fee keeps its rate and says it is free
 *
 * The rate comes from `original` when the fee was discounted, so the row reads *"Withdraw fee: 1 USD +
 * 5%"* with **Free** beside it. Showing `0` instead would say the fee does not exist rather than that
 * it was waived — see `PayoutFee.isWaived`.
 *
 * ## A fee with no exchange rate shows its own unit
 *
 * `subtotal.amount` is quoted in `amountCurrency` (TEVI) while the rest of the screen is in the
 * settlement currency, so the charge is converted. Without a rate there is nothing to convert with,
 * and the row falls back to the raw figure **with its own code** rather than printing a TEVI number
 * next to VND figures — off by four orders of magnitude, and silent.
 */
export function PayoutFeeRows({ request }: { request: PayoutRequestDetail }) {
    const { t, currentLanguage } = useTranslation()
    const lines = payoutFeeLines(request)

    if (lines.length === 0) return null

    return (
        <>
            {lines.map(line => {
                const key = payoutFeeLabel(line.type)
                /*
                 * The rate, as legacy composes it: both parts, either part, or `---` when the fee
                 * states neither. The label is a key so the sentence stays in the locale files.
                 */
                const rate = line.hasNoRate
                    ? '---'
                    : [
                          line.flatAmount > 0
                              ? formatAmountWithCode(
                                    line.flatAmount,
                                    request.amountCurrency,
                                    currentLanguage,
                                )
                              : null,
                          line.percentRate > 0 ? `${line.percentRate}%` : null,
                      ]
                          .filter(Boolean)
                          .join(' + ')

                /*
                 * The charge, **negatively signed**, in the settlement currency — `-1,281,117.13 VND`.
                 * Legacy prints the minus and colours the row `#E41F37`; the sign is the whole point of
                 * the breakdown, which exists to show what came *off* the gross. Without a rate to
                 * convert with, the raw figure is shown with its own code rather than a converted-by-1
                 * number four orders of magnitude wrong.
                 */
                const charge =
                    line.convertedCharge !== null
                        ? formatAmountWithCode(
                              line.convertedCharge,
                              request.netAmountCurrency,
                              currentLanguage,
                          )
                        : line.rawCharge !== null
                          ? formatAmountWithCode(
                                line.rawCharge,
                                request.amountCurrency,
                                currentLanguage,
                            )
                          : null

                return (
                    <PayoutDetailRow
                        testId="payout-detail-line"
                        rowKey={line.type}
                        key={line.type}
                        label={
                            <span className="flex items-center gap-1">
                                {key ? t(key, { rate }) : `${line.type}: ${rate}`}
                                {/*
                                 * Legacy hangs a help control off these two labels, and the two answers
                                 * are genuinely different — one fee runs the platform, the other goes to
                                 * a payment processor. That distinction is why there are two lines.
                                 */}
                                {line.type === 'payout_fee' && <PayoutFeeHelp kind="withdraw" />}
                                {line.type === 'payout_transaction_fee' && (
                                    <PayoutFeeHelp kind="transaction" />
                                )}
                            </span>
                        }
                        // The three display states live in `PayoutFeeCharge`, shared with the
                        // request summary — see that file for why they had to stop being two copies.
                        value={<PayoutFeeCharge charge={charge} isWaived={line.isWaived} />}
                    />
                )
            })}
        </>
    )
}

/**
 * The withdraw-detail section: when it was asked for, which option, gross, fees, net.
 *
 * The order is legacy's, and it reads as a derivation top to bottom — the requested amount, what came
 * off it, what arrived. `Receive amount` is the row a reader opened the screen for, so it is the only
 * `strong` one here; the net also appears above the fold as the screen's headline figure.
 */
/**
 * The dashed rule legacy puts between groups of rows inside this fold — `borderStyle: 'dashed'` on
 * `#F4F4F4`. Not a hairline: it groups, where the solid bands between cards separate.
 */
function DashedRule() {
    return <div className="my-2 border-(--separator-default) border-t border-dashed" />
}

export function PayoutAmountRows({ request }: { request: PayoutRequestDetail }) {
    const { t, currentLanguage } = useTranslation()
    const subReceive = payoutSubReceive(request)

    return (
        <div className="flex flex-col">
            <PayoutDetailRow
                label={t('payout_detail_requested_time')}
                value={formatLedgerDateTime(request.createdAt, currentLanguage)}
            />
            {request.option && (
                <PayoutDetailRow
                    label={t('payout_detail_option')}
                    value={
                        <span className="flex items-center justify-end gap-1.5">
                            {/*
                             * Legacy draws an icon beside the option — `IconSaving` / `IconFast`. The
                             * two are a money bag and a lightning bolt, which the DS sprite has as
                             * `sack-dollar` and `bolt-lightning`.
                             */}
                            {(request.option === 'saving' || request.option === 'fast') && (
                                <Icon
                                    name={
                                        request.option === 'saving'
                                            ? 'sack-dollar'
                                            : 'bolt-lightning'
                                    }
                                    size={16}
                                    aria-hidden
                                    className="flex-none text-(--text-title)"
                                />
                            )}
                            {request.option === 'fast'
                                ? t('payout_option_fast')
                                : request.option === 'saving'
                                  ? t('payout_option_saving')
                                  : // billy's own word for an option this client does not know.
                                    request.option}
                        </span>
                    }
                />
            )}
            <DashedRule />
            <PayoutDetailRow
                strong
                label={t('payout_detail_withdraw_amount')}
                value={
                    request.amount === null
                        ? '—'
                        : formatAmountWithCode(
                              request.amount,
                              request.amountCurrency,
                              currentLanguage,
                          )
                }
            />
            {/*
             * `Sub-Receive amount` — the gross in the settlement currency, before fees. Legacy's row,
             * and one I had left out: without it the breakdown jumps from a figure in one currency to
             * two deductions in another, and the reader has nothing to subtract them from.
             */}
            {subReceive !== null && (
                <PayoutDetailRow
                    label={t('payout_detail_sub_receive_amount')}
                    value={formatAmountWithCode(
                        subReceive,
                        request.config?.methodCurrency || request.netAmountCurrency,
                        currentLanguage,
                    )}
                />
            )}
            <DashedRule />
            <PayoutFeeRows request={request} />
            <DashedRule />
            <PayoutDetailRow
                strong
                label={t('payout_detail_receive_amount')}
                value={
                    request.netAmount === null
                        ? '—'
                        : formatAmountWithCode(
                              request.netAmount,
                              request.netAmountCurrency,
                              currentLanguage,
                          )
                }
            />
        </div>
    )
}

/**
 * The account the money is going to — **flat, always visible, and not a fold**.
 *
 * Legacy puts this between the two accordions as a plain list (`payoutConfig/index.js` has no
 * `Accordion` at all), and the order on the screen is Status → **this** → the fee breakdown. Folding it
 * was my own idea and it was the wrong one: where the money is going is not *working*, it is the second
 * thing a creator checks after the amount.
 *
 * ## Only the keys legacy lists, and that is what avoids a duplicate
 *
 * `payout_detail` in the live payload carries **`bank` and `bank_name` with the same value**. The
 * allowlist in `lib/payout-config-labels.ts` is what keeps the bank from appearing twice — and it is
 * shared with the method-detail dialog on `/my-wallet/payout-method`, which prints the same bag. Read
 * that file before adding a key here: legacy labels and orders these two screens differently, and one
 * table is how they stopped disagreeing.
 */

export function PayoutConfigRows({ request }: { request: PayoutRequestDetail }) {
    const { t } = useTranslation()
    const config = request.config
    if (!config) return null

    return (
        <div className="flex flex-col">
            {config.methodName && (
                <PayoutDetailRow
                    label={t('payout_detail_withdraw_method')}
                    value={
                        <span className="flex items-center justify-end gap-2">
                            {/*
                             * The method's own mark, 24px — legacy's size. A backend-decided URL, which
                             * is the documented exception to "no remote images"
                             * (`docs/STATIC_ASSETS.md`): this is content, not static art, and
                             * `static.tevi.com` is already in `next.config.ts`'s allowlist.
                             *
                             * `alt=""` because the method's name is the text right beside it — an
                             * `alt` here would have a screen reader say "Bank Transfer 24/7" twice.
                             */}
                            {config.methodLogo && (
                                <Image
                                    src={config.methodLogo}
                                    alt=""
                                    width={24}
                                    height={24}
                                    className="h-6 w-6 flex-none rounded-sm object-contain"
                                />
                            )}
                            <span>
                                {config.methodName}
                                {/* `(VND)` after the name, as legacy prints it — the unit the method
                                    settles in, which is not always the account's country. */}
                                {config.methodCurrency ? ` (${config.methodCurrency})` : ''}
                            </span>
                        </span>
                    }
                />
            )}
            {PAYOUT_CONFIG_ORDER.filter(key => config.detail[key]).map(key => {
                const labelKey = payoutConfigLabelKey(key, config.methodSlug)
                if (!labelKey) return null
                return (
                    <PayoutDetailRow
                        key={key}
                        label={t(labelKey)}
                        value={
                            PAYOUT_CONFIG_COPYABLE.has(key) ? (
                                <PayoutCopyValue value={config.detail[key]} label={t(labelKey)} />
                            ) : (
                                config.detail[key]
                            )
                        }
                    />
                )
            })}
            {config.countryName && (
                <PayoutDetailRow label={t('payout_config_country')} value={config.countryName} />
            )}
            {/*
             * No `Processing time` row: legacy does not have one, and `processing_time_note` is
             * parsed but unused here. It belongs on the *request* screen, where somebody is choosing
             * a method — not on a receipt for a request already made.
             */}
        </div>
    )
}
