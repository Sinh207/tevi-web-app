'use client'

import type { Currency } from '@shared/lib/money'
import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger } from '@shared/ui/menu'
import { CurrencyChip } from './total-balance-card'

/**
 * The currency switcher on `/my-wallet` — the chip on the balance card opens a radio menu of codes.
 *
 * ## Code as the label, name as the subtitle
 *
 * Legacy's list puts `currency.code` first with `currency.name` beneath, and that ordering is right for this
 * control: the reader is picking the unit their money is *labelled* with, so `VND` is the thing they are
 * looking for and "Vietnamese Dong" is the confirmation. The reverse would make a list of 150 currencies
 * scannable only by reading.
 *
 * Not built on `shared/components/filter-menu` despite the resemblance: that one's trigger is an icon button
 * and its rows are single-line. This trigger is a chip on a dark card and its rows are two lines. Sharing
 * them would mean a prop for each difference.
 *
 * ## The trigger wraps the chip rather than being it
 *
 * `CurrencyChip` renders no handler of its own (see its doc), so the button lives here. That keeps the chip
 * usable without a menu — `/dev/my-wallet` draws it bare — and avoids a button nested in a button.
 *
 * `aria-label` on the trigger rather than relying on the chip's text: "VND" alone does not say what pressing
 * it does.
 */
export function CurrencyPicker({
    currencies,
    selected,
    onSelect,
    triggerLabel,
}: {
    currencies: Currency[]
    selected: Currency
    onSelect: (code: string) => void
    /** e.g. "Change currency" — the trigger is otherwise announced as just a code. */
    triggerLabel: string
}) {
    return (
        <Menu>
            <MenuTrigger
                aria-label={triggerLabel}
                className="flex cursor-pointer items-center border-0 bg-transparent p-0 outline-none focus-visible:rounded-[4px] focus-visible:outline-2 focus-visible:outline-(--focus-ring)"
            >
                <CurrencyChip code={selected.code} />
            </MenuTrigger>
            <MenuContent>
                <MenuRadioGroup
                    value={selected.code}
                    onValueChange={next => {
                        if (typeof next === 'string') onSelect(next)
                    }}
                >
                    {currencies.map(currency => (
                        <MenuRadioItem
                            key={currency.code}
                            value={currency.code}
                            closeOnClick
                            /*
                             * Dropped when it would just repeat the code — which is exactly the synthetic
                             * record `useCurrency` builds for a persisted code the exchange service no
                             * longer lists (`name` is set to the code there). Printing `VND / VND` would
                             * look like a bug rather than a fallback.
                             */
                            subtitle={currency.name === currency.code ? undefined : currency.name}
                        >
                            {currency.code}
                        </MenuRadioItem>
                    ))}
                </MenuRadioGroup>
            </MenuContent>
        </Menu>
    )
}
