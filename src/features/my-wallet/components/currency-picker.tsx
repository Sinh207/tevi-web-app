'use client'

import { CurrencyList } from '@shared/components/currency-list'
import { useTranslation } from '@shared/i18n/use-translation'
import type { Currency } from '@shared/lib/money'
import { AppBar, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { useState } from 'react'
import { CurrencyChip } from './total-balance-card'

/**
 * The currency switcher on `/my-wallet` — the chip on the balance card opens the same list the account
 * drawer pushes.
 *
 * ## A dialog, where this was a dropdown menu
 *
 * The first cut was a `Menu` with one radio item per currency, and at the real length of that list —
 * ~150 rows off the exchange service — it was the wrong container in every way that matters: no search,
 * so finding `VND` meant scrolling a popup; a check mark on the *start* edge, because that is where a
 * menu radio puts it; and two-line items with no rule between them, so "Bosnia-Herzegovina Convertible
 * Mark" wrapped into the row underneath it. Legacy uses a modal here, and so does this now.
 *
 * The **contents** are `shared/components/currency-list.tsx`, which is also what the drawer's
 * Change-currency screen renders. That is the point: two switchers over one list, so the search, the
 * ranking, the skeleton and the keyboard cannot drift into two behaviours — and the screen the reader
 * meets from the wallet card looks like the one they meet from the account menu.
 *
 * ## The frame is the drawer's, deliberately
 *
 * The DS `Dialog` shell with three overrides, each of them chasing that same consistency:
 *
 * - **`--background-surface`**, not the shell's `--background-subtle` — the drawer paints its panel and
 *   its lists on Surface, so a Subtle popup would put the identical list on a different paper, and the
 *   sticky search field (which must be opaque, or rows scroll through it) would draw a visible band of
 *   the wrong colour across the top.
 * - **`p-0` with the padding moved inside**, so the scrolling body's edges are the dialog's own and the
 *   field can go full-bleed the way it does in the drawer.
 * - **`overflow-hidden`**, which the DS shell does not set because its own children never reach the
 *   edge: with `p-0` they do. The App Bar is opaque and square, so it painted its own corners over the
 *   popup's 24px radius — measured, `border-radius: 24px` on a popup whose `overflow` was `visible` and
 *   whose header's was `0px`, i.e. a dialog with two square top corners. The same would have happened
 *   at the bottom the first time a *checked* row (the one row with a fill) came to rest there. Clipping
 *   once on the popup fixes both, and keeps the radius a property of the dialog rather than something
 *   every child has to repeat.
 * - **the App Bar header**, rather than the DS's centred `DialogHeader` text: it is the same 60px bar,
 *   the same Title T1 centred, and the same ghost icon button on the start edge that the drawer's
 *   sub-screens wear. `xmark` rather than `arrow-left` because this closes rather than pops — the one
 *   place the two intentionally differ.
 */
export function CurrencyPicker({
    currencies,
    selected,
    isLoading,
    onSelect,
    triggerLabel,
}: {
    currencies: Currency[]
    selected: Currency
    /** The currency list is still in flight, so `currencies` is the one-row stand-in. */
    isLoading: boolean
    onSelect: (code: string) => void
    /** e.g. "Change currency" — the trigger is otherwise announced as just a code. */
    triggerLabel: string
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {/*
             * `CurrencyChip` renders no handler of its own (see its doc), so the button is here. That
             * keeps the chip usable without a dialog around it — `/dev/my-wallet` draws it bare — and
             * avoids a button nested in a button.
             *
             * `aria-label` rather than relying on the chip's text: "VND" alone does not say what
             * pressing it does.
             */}
            <DialogTrigger
                aria-label={triggerLabel}
                className="flex cursor-pointer items-center border-0 bg-transparent p-0 outline-none focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
            >
                <CurrencyChip code={selected.code} />
            </DialogTrigger>
            <DialogContent className="max-h-[min(90vh,600px)] gap-0 overflow-hidden bg-(--background-surface) p-0">
                {/*
                 * Outside the scroll box below, not sticky inside it — which is the one place this
                 * frame is not the drawer's. There a pushed screen is a single scroll container with
                 * the App Bar sticky at its top, so the search field has to clear it (`top-[60px]`);
                 * here the bar is a flex sibling of the scrolling body, so the field sticks at 0.
                 * Handing it 60 in this frame does not raise the field, it *lowers* it: its natural
                 * offset is already 0, so `top: 60px` sticks it 60 below the box's edge and it sits on
                 * top of the first two rows — caught by a click on `SGD` landing on the input instead.
                 *
                 * ## The hairline is the bar's, not the DS's
                 *
                 * The DS App Bar draws no divider (`bg-none`, no border) because on a screen it sits on
                 * content that scrolls *away* from it. Here it is the top of a 600px popup with 150 rows
                 * moving underneath: without a line the rows are cut off by nothing, which is what the
                 * search field's own divider hides — right up until there is no field, and the list is
                 * short enough or still loading that there is not. So the bar carries its own.
                 *
                 * Not added to `DrawerSubScreen`, whose bar is the same component: there the field's
                 * divider sits 12px under it and the screens behind it (Appearance, Language, Data,
                 * Privacy) are cards with their own edges, so a second line would be a DS deviation on
                 * four screens to fix a boundary that is already drawn.
                 */}
                <AppBar className="w-full flex-none border-b border-(--separator-default) bg-(--background-surface)">
                    <Button
                        data-testid="my-wallet-currency-close"
                        variant="ghost"
                        size="large"
                        iconOnly
                        aria-label={t('common_close')}
                        onClick={() => setOpen(false)}
                        className="rounded-full"
                    >
                        <Icon name="xmark" size={20} />
                    </Button>
                    <AppBarTitle size="large">
                        {/*
                         * `render`, so the dialog's own title element *is* the App Bar's text: base-ui
                         * needs to own the node (it labels the popup by id), and a second heading
                         * beside it — visible or `sr-only` — would put two titles in the a11y tree.
                         */}
                        <DialogTitle render={<AppBarTitleText as="h2" size="large" />}>
                            {t('balance_change_currency')}
                        </DialogTitle>
                    </AppBarTitle>
                </AppBar>
                {/*
                 * `min-h-0` is what makes the scroll happen: a flex child's default `min-height: auto`
                 * refuses to shrink below its content, so without it the dialog grows past its own
                 * `max-h` and the page scrolls instead of the list. Stated the same way on
                 * `NotificationFilterDialog`, which met it first.
                 */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4">
                    <CurrencyList
                        testId="my-wallet-currency"
                        active={open}
                        currencies={currencies}
                        selected={selected}
                        isLoading={isLoading}
                        onSelect={code => {
                            onSelect(code)
                            // Closes on pick, as legacy's modal does and as the drawer's screen pops:
                            // the figure this changes is on the card behind the dialog.
                            setOpen(false)
                        }}
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
}
