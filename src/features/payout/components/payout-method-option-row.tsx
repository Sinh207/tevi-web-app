'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import {
    ListRow,
    ListRowAccessory,
    ListRowContent,
    ListRowLeading,
    ListRowRule,
    ListRowSubtitle,
    ListRowText,
    ListRowTitle,
    ListRowTitleRow,
    ListRowTrailing,
} from '@shared/ui/list'
import { Radio } from '@shared/ui/radio'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'
import type { PayoutMethodOption } from '../api/config-types'

/**
 * One method on `/my-wallet/setup-payouts` — the row, its radio, and the form it opens.
 *
 * ## A disclosure, not an accordion component
 *
 * Legacy uses MUI's `Accordion` with a `Radio` as its expand icon, which puts a radio *inside* a
 * button and leaves the row announced as a collapsed panel that also claims to be a radio. Here the
 * row is one `<button>` with `aria-expanded` / `aria-controls`, and the radio is the DS control
 * rendered `as="span"` — painted state, not a second input. That is the arrangement `Radio`'s own doc
 * describes for the case where the row is the label.
 *
 * `type="radio"`'s native behaviour is not what this row wants either: arrow keys moving the selection
 * would open and close forms as focus passes over them, and the selection has a side effect here (it
 * mounts a form and resets its values).
 *
 * ## It scrolls itself into view, and 300ms is not a guess
 *
 * Opening the last row in a list of eight puts its form below the fold, so the row scrolls to the top
 * of the scroll area — legacy does the same with a `setTimeout(300)`. The wait is because the form is
 * what changes the page's height: scrolling before it lays out aims at the old geometry. `useEffect`
 * after the mount is where that is known, so no timer is needed.
 *
 * `scroll-margin-top` clears the sticky bar (60px), or the row lands underneath it.
 */
export function PayoutMethodOptionRow({
    method,
    selected,
    onSelect,
    rule,
    children,
}: {
    method: PayoutMethodOption
    selected: boolean
    /** Called with `false` when the open row is pressed again — pressing it closes the form. */
    onSelect: (next: boolean) => void
    /** The hairline above this row — every row but the first. */
    rule?: boolean
    /** The form. Mounted only while `selected`, which is what resets it on every open. */
    children?: ReactNode
}) {
    const { t } = useTranslation()
    const panelId = useId()
    const rowRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!selected) return
        /*
         * `block: 'nearest'` rather than `'start'`: the row is already in view most of the time, and
         * `'start'` scrolls anyway — so pressing the *first* row of the list jumps the page for no
         * reason. Only a row whose form would open off-screen moves.
         */
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, [selected])

    return (
        <div ref={rowRef} className="flex scroll-mt-[60px] flex-col">
            <ListRow
                as="button"
                data-testid="payout-setup-method"
                data-option-value={method.id}
                aria-expanded={selected}
                aria-controls={selected ? panelId : undefined}
                onClick={() => onSelect(!selected)}
                rightAction
                className="cursor-pointer text-start hover:bg-(--button-ghost-bg-hover)"
            >
                <ListRowLeading className="w-[40px]">
                    {method.logo ? (
                        /*
                         * The method's own mark, backend-served — the documented exception to the
                         * no-remote-images rule (`docs/STATIC_ASSETS.md`): content, not static art,
                         * and `static.tevi.com` is already allowlisted in `next.config.ts`.
                         *
                         * `alt=""` — the name is the text right beside it.
                         */
                        <Image
                            src={method.logo}
                            alt=""
                            width={28}
                            height={28}
                            className="size-7 flex-none rounded-sm object-contain"
                        />
                    ) : (
                        // A method with no mark still needs the column filled, or its title starts
                        // 28px left of every other row's.
                        <span className="flex size-7 flex-none items-center justify-center rounded-sm bg-(--background-segment) text-(--icon-secondary)">
                            <Icon name="bank" size={16} aria-hidden />
                        </span>
                    )}
                </ListRowLeading>
                <ListRowContent>
                    {rule && <ListRowRule />}
                    <ListRowAccessory rightAction>
                        <ListRowText rightAction>
                            <ListRowTitleRow>
                                <ListRowTitle className="truncate">
                                    {/* `(VND)` after the name, as legacy prints it — the unit the
                                        method settles in. */}
                                    {method.currency
                                        ? `${method.name} (${method.currency})`
                                        : method.name}
                                </ListRowTitle>
                            </ListRowTitleRow>
                            {method.slug === 'stripe' ? (
                                <ListRowSubtitle>
                                    {t('payout_setup_powered_by_stripe')}
                                </ListRowSubtitle>
                            ) : method.processingTimeNote ? (
                                /*
                                 * The backend's own words for how long this method takes — legacy
                                 * fetches the field and never shows it, and "when will I get it" is
                                 * the question the *Learn more* link exists to answer generically.
                                 * Here it is per method, which is where the answer actually differs.
                                 */
                                /*
                                 * `dir="auto"` because this string is the **backend's**, in whatever
                                 * language the backoffice typed it (B84's second question). Under `ar`
                                 * an English "1 business day" inherits the RTL paragraph and renders
                                 * as "business day 1"; `auto` reads its first strong character and lays
                                 * it out in its own direction.
                                 */
                                <ListRowSubtitle dir="auto">
                                    {method.processingTimeNote}
                                </ListRowSubtitle>
                            ) : null}
                        </ListRowText>
                        <ListRowTrailing>
                            {/*
                             * `as="span"`: the row is the control, so this is the painted state of it
                             * rather than a second focusable input. `aria-hidden` because the row
                             * already publishes its own state through `aria-expanded`.
                             */}
                            <Radio
                                as="span"
                                checked={selected}
                                readOnly
                                aria-hidden
                                tabIndex={-1}
                            />
                        </ListRowTrailing>
                    </ListRowAccessory>
                </ListRowContent>
            </ListRow>
            {selected && children ? (
                <div id={panelId} className={cn('border-t border-(--separator-default)')}>
                    {children}
                </div>
            ) : null}
        </div>
    )
}
