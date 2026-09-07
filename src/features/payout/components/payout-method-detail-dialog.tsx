'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { formatLedgerDateTime } from '@shared/lib/ledger-time'
import { AppBar, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { ConfirmDialog } from '@shared/ui/confirm-dialog'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import { useState } from 'react'
import type { PayoutConfigRow } from '../api/config-types'
import {
    PAYOUT_CONFIG_COPYABLE,
    PAYOUT_CONFIG_ORDER,
    payoutConfigLabelKey,
} from '../lib/payout-config-labels'
import { PayoutCopyValue } from './payout-copy-value'
import { PayoutDetailRow } from './payout-detail-rows'

/**
 * One saved payout method in full, and the only place it can be removed.
 *
 * ## Why removal lives in here and not on the row
 *
 * A destructive action on a list row is one mis-tap from deleting the account's only way to be paid.
 * Legacy makes the same call — the row opens a modal, and Remove is at the bottom of it behind a
 * second confirm — and it is the right one: opening the dialog is *also* how you check the details,
 * so the reader is looking at what they are about to delete.
 *
 * ## The rows are the request detail's, verbatim
 *
 * Same component (`PayoutDetailRow`), same table (`lib/payout-config-labels.ts`), same order. Legacy
 * has two separate lists with two different orders and two different labels for `wallet_address`, so
 * the same USDT wallet reads differently depending on which screen you opened. One table is what fixed
 * that — read its note before adding a key.
 */
export function PayoutMethodDetailDialog({
    method,
    open,
    onOpenChange,
    onRemove,
    isRemoving,
}: {
    /** `null` while nothing is open — the dialog keeps its own mount and renders nothing. */
    method: PayoutConfigRow | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onRemove: (method: PayoutConfigRow) => void
    isRemoving: boolean
}) {
    const { t, currentLanguage } = useTranslation()
    const [confirming, setConfirming] = useState(false)

    if (!method) return null

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                {/*
                 * The frame `CurrencyPicker` established for this app's list-in-a-dialog: `p-0` so the
                 * scrolling body owns its edges, `overflow-hidden` so the opaque App Bar cannot paint
                 * over the popup's radius, Surface so the rows sit on the usual paper.
                 */}
                <DialogContent
                    data-testid="payout-method-detail"
                    className="max-h-[min(90vh,600px)] gap-0 overflow-hidden bg-(--background-surface) p-0"
                >
                    <AppBar className="w-full flex-none border-b border-(--separator-default) bg-(--background-surface)">
                        <Button
                            data-testid="payout-method-detail-close"
                            variant="ghost"
                            size="large"
                            iconOnly
                            aria-label={t('common_close')}
                            onClick={() => onOpenChange(false)}
                            className="rounded-full"
                        >
                            <Icon name="xmark" size={20} />
                        </Button>
                        <AppBarTitle size="large">
                            <DialogTitle render={<AppBarTitleText as="h2" size="large" />}>
                                {t('payout_method_detail_title')}
                            </DialogTitle>
                        </AppBarTitle>
                    </AppBar>

                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-2">
                        <PayoutDetailRow
                            label={t('payout_detail_withdraw_method')}
                            value={
                                <span className="flex items-center justify-end gap-2">
                                    {method.methodLogo && (
                                        <Image
                                            src={method.methodLogo}
                                            alt=""
                                            width={24}
                                            height={24}
                                            className="size-6 flex-none rounded-sm object-contain"
                                        />
                                    )}
                                    <span>
                                        {method.methodName}
                                        {method.methodCurrency ? ` (${method.methodCurrency})` : ''}
                                    </span>
                                </span>
                            }
                        />
                        {PAYOUT_CONFIG_ORDER.filter(key => method.detail[key]).map(key => {
                            const labelKey = payoutConfigLabelKey(key, method.methodSlug)
                            if (!labelKey) return null
                            return (
                                <PayoutDetailRow
                                    key={key}
                                    testId="payout-method-detail-row"
                                    rowKey={key}
                                    label={t(labelKey)}
                                    value={
                                        PAYOUT_CONFIG_COPYABLE.has(key) ? (
                                            <PayoutCopyValue
                                                value={method.detail[key]}
                                                label={t(labelKey)}
                                            />
                                        ) : (
                                            method.detail[key]
                                        )
                                    }
                                />
                            )
                        })}
                        {method.countryName && (
                            <PayoutDetailRow
                                label={t('payout_config_country')}
                                value={method.countryName}
                            />
                        )}
                        {method.contactName && (
                            <PayoutDetailRow
                                label={t('payout_form_contact_name')}
                                value={method.contactName}
                            />
                        )}
                        {method.contactEmail && (
                            <PayoutDetailRow
                                label={t('payout_form_contact_email')}
                                value={method.contactEmail}
                            />
                        )}
                        {method.createdAt > 0 && (
                            <PayoutDetailRow
                                label={t('payout_method_date_added')}
                                /*
                                 * The shared date formatter, not legacy's `dd MMMM yyyy`: every other
                                 * dated row in this feature (the tracking list, the request detail)
                                 * goes through it, and two date formats on one screen's worth of
                                 * screens reads as two different products.
                                 */
                                value={formatLedgerDateTime(method.createdAt, currentLanguage)}
                            />
                        )}
                    </div>

                    <div className="flex-none border-t border-(--separator-default) p-4">
                        <Button
                            data-testid="payout-method-remove"
                            variant="destructive"
                            size="large"
                            disabled={isRemoving}
                            onClick={() => setConfirming(true)}
                            className="w-full"
                        >
                            {t('payout_method_remove')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                testId="payout-method-remove-confirm"
                open={confirming}
                onOpenChange={setConfirming}
                title={t('payout_method_remove_title')}
                description={t('payout_method_remove_body')}
                confirmLabel={t('payout_method_remove_confirm')}
                cancelLabel={t('common_close')}
                destructive
                pending={isRemoving}
                onConfirm={() => {
                    onRemove(method)
                    /*
                     * Both dialogs close on press rather than on the response. The removal is not
                     * optimistic — the row leaves when the server agrees — but *this* dialog has
                     * nothing left to show: leaving it open over a method that is being deleted only
                     * offers the button again. A failure comes back as a toast, and the row is still
                     * there.
                     */
                    setConfirming(false)
                    onOpenChange(false)
                }}
            />
        </>
    )
}
