'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { DEFAULT_CURRENCY, formatFiatAmount } from '@shared/lib/money'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import Image from 'next/image'
import type { PayoutConfigRow } from '../api/config-types'
import { payoutMethodSubtitle, payoutMethodTitle } from './payout-method-summary-row'

/**
 * *Select other method* — legacy's `selectOtherMethod/`, which I had left out entirely.
 *
 * Without it the screen could only ever offer the first method the server returned, and a creator with a
 * bank transfer *and* a USDT address had no way to choose between them here. That is not a missing
 * polish; it is the screen refusing to do the thing it exists for.
 *
 * ## The rows are the same object as the summary card
 *
 * `payoutMethodTitle` / `payoutMethodSubtitle` are shared with `PayoutMethodSummaryRow`, so the row a
 * reader picks and the card they then see are the same four lines. Legacy has two components building
 * them from two copies of the same `switch`, which is how they drift.
 *
 * ## Radios, not a list of buttons
 *
 * One is always chosen and choosing one un-chooses the rest — a radio group. Legacy's `MethodItem` is a
 * `ListItem` with an `onClick`, so a screen reader is told "clickable" per row with nothing to say which
 * is active. `aria-checked` on real radios says it.
 *
 * The dividers are legacy's (`borderBottom` on every row but the last).
 */
export function PayoutMethodPickerDialog({
    open,
    onClose,
    methods,
    selectedId,
    onSelect,
}: {
    open: boolean
    onClose: () => void
    methods: PayoutConfigRow[]
    selectedId: string | null
    onSelect: (id: string) => void
}) {
    const { t, currentLanguage } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={next => !next && onClose()}>
            <DialogContent
                data-testid="payout-request-method-dialog"
                className="max-h-[min(90vh,600px)] w-[512px] gap-0 overflow-hidden p-0"
            >
                {/*
                 * The DS **App Bar**, which is this repo's header for a picker dialog — `CurrencyPicker`
                 * and `NotificationFilterDialog` are both this shape. I had hand-built a row with the
                 * dismiss on the right and my own padding, which is why the header did not line up with
                 * the rest of the app: the bar has its own height, its own inset and a bottom rule, and
                 * a close button that lives on the **leading** side.
                 *
                 * `DialogTitle render={<AppBarTitleText …>}` so base-ui owns the title node — it labels
                 * the popup by id, and a second heading beside it (visible or `sr-only`) would put two
                 * titles in the a11y tree.
                 */}
                <AppBar className="w-full flex-none border-(--separator-default) border-b bg-(--background-surface)">
                    <Button
                        data-testid="payout-request-method-close"
                        variant="ghost"
                        size="large"
                        iconOnly
                        aria-label={t('common_close')}
                        onClick={onClose}
                        className="rounded-full"
                    >
                        <Icon name="xmark" size={20} />
                    </Button>
                    <AppBarTitle size="large">
                        <DialogTitle render={<AppBarTitleText as="h2" size="large" />}>
                            {t('payout_request_select_other_method')}
                        </DialogTitle>
                    </AppBarTitle>
                </AppBar>

                {/*
                 * `min-h-0` is what makes the list scroll rather than the page: a flex child's default
                 * `min-height: auto` refuses to shrink below its content, so without it the dialog grows
                 * past its own `max-h`. `CurrencyPicker` carries the same note.
                 */}
                <div
                    role="radiogroup"
                    aria-label={t('payout_request_select_other_method')}
                    className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
                >
                    {methods.map((config, index) => {
                        const isSelected = config.id === selectedId
                        const title = payoutMethodTitle(config)
                        const subtitle = payoutMethodSubtitle(config)
                        return (
                            <label
                                key={config.id}
                                data-testid="payout-request-method-option"
                                data-option-value={config.id}
                                className={cn(
                                    'flex cursor-pointer items-center gap-[10px] px-4 py-3',
                                    // Legacy's divider: every row but the last.
                                    index < methods.length - 1 &&
                                        'border-(--separator-default) border-b',
                                    'hover:bg-(--button-ghost-bg-hover)',
                                    'focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-(--focus-ring)',
                                )}
                            >
                                <input
                                    type="radio"
                                    name="payout-method"
                                    value={config.id}
                                    checked={isSelected}
                                    onChange={() => {
                                        onSelect(config.id)
                                        onClose()
                                    }}
                                    className="sr-only"
                                />
                                {config.methodLogo && (
                                    <Image
                                        src={config.methodLogo}
                                        alt=""
                                        aria-hidden
                                        width={36}
                                        height={36}
                                        className="flex-none rounded-full"
                                        unoptimized
                                    />
                                )}
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="type-caption-label truncate text-(--text-body)">
                                        {config.methodName}
                                    </span>
                                    {title && (
                                        <span className="type-dense-strong truncate text-(--text-title)">
                                            {title}
                                        </span>
                                    )}
                                    {subtitle && (
                                        <span className="type-caption-meta truncate text-(--text-body)">
                                            {subtitle}
                                        </span>
                                    )}
                                    <span className="type-caption-meta truncate text-(--text-body)">
                                        {t('payout_request_daily_remaining', {
                                            amount: formatFiatAmount(
                                                config.dailyLimitRemainder ?? 0,
                                                DEFAULT_CURRENCY,
                                                currentLanguage,
                                            ),
                                        })}
                                    </span>
                                </span>
                                {/*
                                 * The tick is CSS, for the reason `PayoutOptionCards` states: the sprite
                                 * has `check-circle` but no empty companion, and a two-state mark needs
                                 * both.
                                 */}
                                <span
                                    aria-hidden
                                    className={cn(
                                        'flex size-5 flex-none items-center justify-center rounded-full border-2',
                                        isSelected
                                            ? 'border-(--text-brand)'
                                            : 'border-(--icon-secondary)',
                                    )}
                                >
                                    {isSelected && (
                                        <span className="size-2.5 rounded-full bg-(--text-brand)" />
                                    )}
                                </span>
                            </label>
                        )
                    })}
                </div>
            </DialogContent>
        </Dialog>
    )
}
