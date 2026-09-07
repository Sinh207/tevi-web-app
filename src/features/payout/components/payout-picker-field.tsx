'use client'

import { Menu as BaseMenu } from '@base-ui/react/menu'
import { FIELD_HEIGHT, FIELD_SURFACE, FieldShell } from '@shared/components/field'
import { PickerList, type PickerOption } from '@shared/components/picker-list'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { AppBar, AppBarTitle, AppBarTitleText } from '@shared/ui/app-bar'
import { Button } from '@shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'
import { MenuContent, MenuRadioItem } from '@shared/ui/menu'
import { SearchBar } from '@shared/ui/search-bar'
import { cloneElement, useId, useMemo, useState } from 'react'

/**
 * Pick one value out of a list — the control behind **every** choice on the two payout screens: the
 * billing country, a USDT network, a bank, and any `choices` field a method this client has never seen
 * arrives with.
 *
 * ## One control, two shapes, and the option count decides
 *
 * | rows | shape | why |
 * |---|---|---|
 * | under 8 | a **menu** anchored to the field | 2 USDT networks or 4 Indonesian wallets are a glance and one tap; dimming the whole screen for them is a modal asking permission to show three words |
 * | 8 and up | a **dialog** with a search field | 54 banks and ~250 countries cannot be *read*, they have to be searched — and a search field needs somewhere to live that a menu does not have |
 *
 * The threshold is `SEARCHABLE_FROM`, the same number that decides whether the dialog gets its field
 * at all: "long enough to need searching" and "too long for a menu" are the same question.
 *
 * ## Why not a native `<select>`
 *
 * It is the obvious answer and it fails on this data, three times over:
 *
 * - **`<option>` holds text and nothing else.** The Indonesian wallet list arrives with a logo per
 *   wallet (DANA, OVO, GoPay, ShopeePay) and the bank list with a mark per bank — a picker that drops
 *   them makes four wallets four indistinguishable words. There is no markup that puts an image in an
 *   `<option>`; every "select with icons" on the web is a custom control underneath.
 * - **54 rows in a native picker is a wheel.** On iOS a `<select>` is a spinning drum, on Android a
 *   full-screen list, and neither can be filtered — the type-ahead is first-letter only, so finding
 *   "Vietcombank" means spinning past 40 banks. The count is the whole reason legacy wrote its own
 *   bank modal.
 * - **It cannot be styled or themed.** The DS ships an `--input-*` ramp, dark mode and nine locales
 *   including RTL; a native select carries the OS's own chrome and ignores all of it.
 *
 * So the control is app-authored either way, and the only real choice is *which* app-authored shape —
 * which is the table above. Legacy makes the same split with three different implementations (a MUI
 * `Select` for networks, a `Select` with a search box wedged into its menu for countries, a bespoke
 * modal for banks); this is one component that behaves consistently in both.
 *
 * The dialog half is `CurrencyPicker`'s, over `PickerList` — a real `radiogroup` with arrow-key
 * navigation, which opens at the row already chosen.
 *
 * ## It is a field, not a menu
 *
 * The trigger wears the form's own surface (`FIELD_SURFACE`) and sits in a `FieldShell`, so it lines up
 * with the text fields above and below it and carries its label, its error and its `aria-invalid` the
 * same way they do. A `<button>` is a labelable element, so the shell's `<label htmlFor>` associates
 * with it exactly as it would with an input.
 */

/** Below this many options there is nothing to search — `CurrencyList`'s own threshold and reason. */
const SEARCHABLE_FROM = 8

/** Diacritic-insensitive, so `viet` finds `Việt Nam` — legacy's `normalizeText`, unchanged. */
function normalise(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
}

export function PayoutPickerField({
    label,
    dialogTitle,
    placeholder,
    value,
    options,
    onSelect,
    error,
    hint,
    disabled,
    fieldKey,
    testId,
}: {
    label: string
    /** The dialog's own heading — "Choose your location", "Select bank". */
    dialogTitle: string
    /** What the trigger says when nothing is chosen yet. */
    placeholder: string
    /** The chosen option's `value`, or `''`. */
    value: string
    options: readonly PickerOption[]
    onSelect: (value: string) => void
    error?: string | null
    hint?: string
    disabled?: boolean
    /**
     * The wire key this control fills in, published as `data-field-key`.
     *
     * For the payout setup form, where every field carries the same `data-testid` because the field
     * *list* comes from the backend — this is what a test addresses one of them by. Omitted by a
     * caller whose control is the only one of its kind on the screen (the billing country).
     */
    fieldKey?: string
    /** Base id: the trigger takes it, and `-field`, `-error`, `-search`, `-panel` derive. */
    testId?: string
}) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const fieldId = useId()
    const messageId = `${fieldId}-message`

    const selected = options.find(option => option.value === value)

    const filtered = useMemo(() => {
        const term = normalise(search)
        if (!term) return options
        return options.filter(option => {
            // The value is matched too, so `US` finds the United States — a country's code is what
            // half the world knows it by.
            const haystack = `${option.label} ${option.subtitle ?? ''} ${option.value}`
            return normalise(haystack).includes(term)
        })
    }, [options, search])

    /**
     * The field itself — one element for both shapes, so a network picker and a country picker are
     * visibly the same control and only their panel differs. In menu mode base-ui's `render` merges
     * its own `onClick`, `aria-haspopup`, `aria-expanded` and ref onto exactly this markup.
     */
    const trigger = (
        <button
            type="button"
            id={fieldId}
            data-testid={testId}
            data-field-key={fieldKey}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={messageId}
            className={cn(
                FIELD_SURFACE,
                FIELD_HEIGHT,
                'flex cursor-pointer items-center gap-2 text-start',
            )}
        >
            {selected?.mark ? <span className="flex-none">{selected.mark}</span> : null}
            <span
                className={cn(
                    'min-w-0 flex-auto truncate',
                    selected ? 'text-(--input-text)' : 'text-(--input-placeholder)',
                )}
            >
                {selected ? selected.label : placeholder}
            </span>
            <Icon
                name="angle-down"
                size={20}
                aria-hidden
                className="flex-none text-(--icon-default)"
            />
        </button>
    )

    /**
     * Short list ⇒ a menu anchored to the field. See the table in this file's header: the same number
     * that decides whether the dialog needs a search field decides that a list is too long to be one
     * of these.
     */
    if (options.length < SEARCHABLE_FROM) {
        return (
            <FieldShell
                id={fieldId}
                label={label}
                hint={hint}
                error={error}
                messageId={messageId}
                testId={testId}
            >
                <BaseMenu.Root>
                    <BaseMenu.Trigger render={trigger} />
                    {/*
                     * `align="start"` and the anchor's own width, so the panel reads as the field
                     * opening rather than as a menu that happens to be near it — a 264px popup under
                     * a 580px field looks like it belongs to something else. base-ui publishes the
                     * trigger's width as `--anchor-width` on the positioner.
                     */}
                    <MenuContent
                        align="start"
                        data-testid={subTestId(testId, 'panel')}
                        className="w-(--anchor-width) min-w-[200px]"
                    >
                        <BaseMenu.RadioGroup
                            data-testid={subTestId(testId, 'group')}
                            value={value}
                            onValueChange={next => {
                                if (typeof next === 'string') onSelect(next)
                            }}
                        >
                            {options.map(option => (
                                <MenuRadioItem
                                    key={option.value}
                                    data-testid={subTestId(testId, 'option')}
                                    data-option-value={option.value}
                                    value={option.value}
                                    subtitle={option.subtitle}
                                    // Picking dismisses it: this is a one-choice control, and base-ui
                                    // keeps radio menus open by default for multi-step ones.
                                    closeOnClick
                                >
                                    {/*
                                     * The mark travels with the label rather than into the DS row's
                                     * leading gutter — that slot is the tick's, and it is what keeps
                                     * every label on one vertical line (`MenuRadioItem` says so).
                                     */}
                                    <span className="flex min-w-0 items-center gap-2">
                                        {option.mark ? (
                                            <span className="flex-none">{option.mark}</span>
                                        ) : null}
                                        <span className="min-w-0 truncate">{option.label}</span>
                                    </span>
                                </MenuRadioItem>
                            ))}
                        </BaseMenu.RadioGroup>
                    </MenuContent>
                </BaseMenu.Root>
            </FieldShell>
        )
    }

    return (
        <FieldShell
            id={fieldId}
            label={label}
            hint={hint}
            error={error}
            messageId={messageId}
            testId={testId}
        >
            {/*
             * The same field, with the dialog's own opener: it resets the search term so a panel never
             * reopens filtered by a term nobody can see.
             */}
            {cloneElement(trigger, {
                onClick: () => {
                    setSearch('')
                    setOpen(true)
                },
            })}

            <Dialog open={open} onOpenChange={setOpen}>
                {/*
                 * The frame is `CurrencyPicker`'s, for the reason that file spells out: `p-0` so the
                 * scrolling body owns its edges, `overflow-hidden` so an opaque App Bar cannot paint
                 * over the popup's 24px radius, and Surface rather than Subtle so the rows sit on the
                 * same paper as everywhere else they appear.
                 */}
                <DialogContent
                    data-testid={subTestId(testId, 'panel')}
                    className="max-h-[min(90vh,600px)] gap-0 overflow-hidden bg-(--background-surface) p-0"
                >
                    <AppBar className="w-full flex-none border-b border-(--separator-default) bg-(--background-surface)">
                        <Button
                            data-testid={subTestId(testId, 'close')}
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
                             * `render`, so base-ui owns the node it labels the popup by — a second
                             * heading beside it would put two titles in the a11y tree.
                             */}
                            <DialogTitle render={<AppBarTitleText as="h2" size="large" />}>
                                {dialogTitle}
                            </DialogTitle>
                        </AppBarTitle>
                    </AppBar>
                    {/*
                     * No `gap` on this column: the spacing above the list is the sticky field's own
                     * `py-3`, because a flex gap only exists **at rest**. Scroll, and the rows travel
                     * through it — a 12px band of nothing between the field and the first row, with
                     * text sliding across it. `CurrencyList` states the same rule.
                     */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4">
                        {options.length >= SEARCHABLE_FROM && (
                            /*
                             * Sticky at 0, not at the bar's 60: the bar is a flex *sibling* of this
                             * scroll box, so this field's own offset is already the box's top edge —
                             * handing it 60 lowers it onto the first two rows. `CurrencyPicker` met
                             * this and its note is the reference.
                             *
                             * **Full-bleed and opaque, with a hairline.** `-mx-4` then `px-4` back:
                             * the rows are `-mx-4` too (`PickerList`'s flush variant), so a band at
                             * the column's inner width leaves 16px of row visible down each side of
                             * the field — measured at 336 against the list's 368. The Search Bar has
                             * no fill outside its own pill either, so the band has to carry one; and
                             * the hairline is what makes rows disappear *under a line* rather than be
                             * sliced by nothing.
                             */
                            <div className="sticky top-0 z-10 -mx-4 border-b border-(--separator-default) bg-(--background-surface) px-4 py-3">
                                <SearchBar
                                    data-testid={subTestId(testId, 'search')}
                                    value={search}
                                    onValueChange={setSearch}
                                    label={t('payout_setup_search_label')}
                                    clearLabel={t('payout_setup_search_clear')}
                                    placeholder={t('payout_setup_search_placeholder')}
                                />
                            </div>
                        )}
                        {filtered.length === 0 ? (
                            <p className="type-dense-default px-4 py-6 text-center text-(--text-subtitle)">
                                {t('payout_setup_no_matches')}
                            </p>
                        ) : (
                            <PickerList
                                /*
                                 * `active` is the dialog's own state: it is what makes the list open
                                 * *at* the chosen country rather than at the top of 250 rows. The
                                 * popup is unmounted while closed, so a mount effect would do — but
                                 * saying it out loud costs nothing and is what the drawer needs.
                                 */
                                active={open}
                                /*
                                 * `-list`, not the bare id: `PickerList` puts whatever it is given on
                                 * the **list**, and the trigger above already holds the bare one — the
                                 * convention `TextField` sets, where the bare id is the control you
                                 * type into. Passing the same string to both put one id on two
                                 * elements, so a locator returned whichever the DOM reached first.
                                 * Caught by `e2e/payout-setup.spec.ts`; `pnpm lint:testids` cannot see
                                 * it, because neither occurrence is a duplicate *literal*.
                                 */
                                testId={subTestId(testId, 'list')}
                                label={dialogTitle}
                                options={filtered}
                                value={value || undefined}
                                onSelect={next => {
                                    onSelect(next)
                                    // Closes on pick: the value it changes is on the form behind it.
                                    setOpen(false)
                                }}
                                // Flush rows — a bordered card inside a scroll box shows neither of
                                // its corners. `PickerList`'s own measurement.
                                flush
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </FieldShell>
    )
}
