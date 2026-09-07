'use client'

import { Popover } from '@base-ui/react/popover'
import { FIELD_HEIGHT, FIELD_SURFACE, FieldShell } from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { fromDateValue, toDateValue } from '@shared/lib/date-value'
import { subTestId } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { type ReactNode, useId, useState } from 'react'
import { LazyCalendar } from './calendar-lazy'

/**
 * One date — the app's own calendar in a popover, on the app's own field surface.
 *
 * ## It replaced `<input type="date">`, and what that trade actually is
 *
 * The native control was here first and its reasoning is worth restating, because it was not wrong:
 * it is free, localised, keyboard-complete, and on a phone it is the OS wheel. What it could not do
 * is **look like this app** — each browser draws its own indicator, its own `dd/mm/yyyy` in its own
 * grey and its own inner spacing, Firefox offers no way to hide its button at all, and the panel that
 * opens is a white Chrome dialog out of a dark Tevi form. A form of eight fields where one is visibly
 * from another application is the cost that finally outweighed the convenience.
 *
 * **What is lost: typing.** A native date input accepts `12/05/1990` from the keyboard, and this does
 * not — the year and month dropdowns in the caption are the fast path instead, which is what makes a
 * date of birth three presses rather than thirty. If typing turns out to matter on a field, the
 * honest fix is a text input beside this button with a per-locale parser, not a second picker.
 *
 * **What is gained**, besides looking like the app: one control on every platform, RTL (the calendar
 * mirrors and its navigation follows the writing direction), our tokens in dark mode, and a range
 * picker and a single picker that are visibly the same component (`date-range-dialog.tsx`).
 *
 * ## The value stays `YYYY-MM-DD`
 *
 * Deliberately the same shape the native input used, so every caller's validation is untouched —
 * `features/channel`'s `dateOfBirthError` and `maxDateOfBirth` still compare strings, and the API
 * still receives what it received. The conversion to and from a `Date` is `shared/lib/date-value.ts`,
 * which is where the two timezone traps that come with it are written down and tested.
 *
 * `min`/`max` are the same strings, and here they are **enforced** rather than hinted: the calendar
 * disables everything outside them, where the native attribute was advice a typist could ignore. The
 * callers' own checks stay — a client-side rule is never the rule — but the control can no longer
 * produce a value that breaks one.
 */

export type DateFieldProps = {
    label: string
    /** `YYYY-MM-DD`, or `''` for no date. */
    value: string
    /** Called with `YYYY-MM-DD`. Never called with an invalid date — see the header. */
    onValueChange: (value: string) => void
    hint?: ReactNode
    error?: string | null
    /** `YYYY-MM-DD`. Days outside the pair are not selectable. */
    min?: string
    max?: string
    disabled?: boolean
    id?: string
    /** Placeholder shown while there is no date. Defaults to the shared copy. */
    placeholder?: string
    /**
     * The first month the picker may navigate to. Defaults to 100 years back, which is what makes the
     * year dropdown usable for a date of birth; a report filter should pass something nearer.
     */
    startMonth?: Date
    /**
     * Base `data-testid`. The bare id lands on the `Popover.Trigger` — the thing a reader presses,
     * and the element `htmlFor` points at — with `-calendar` on the popup, plus `-field`, `-label`,
     * `-message`, `-error` and `-hint` from `FieldShell`.
     *
     * The day cells take no testid: react-day-picker already stamps `data-day="YYYY-MM-DD"` and its
     * state on each one, so a suite presses `[data-testid='…-calendar'] [data-day='1990-05-12']` —
     * see the note in `calendar.tsx`. The popup portals, so it is not a DOM descendant of the
     * trigger.
     */
    testId?: string
}

/** A hundred years back, so a year dropdown covers anybody's date of birth. */
function defaultStartMonth(): Date {
    const now = new Date()
    return new Date(now.getFullYear() - 100, 0, 1)
}

export function DateField({
    label,
    value,
    onValueChange,
    hint,
    error,
    min,
    max,
    disabled,
    id,
    placeholder,
    startMonth,
    testId,
}: DateFieldProps) {
    const { t, currentLanguage } = useTranslation()
    const generated = useId()
    const fieldId = id ?? generated
    const messageId = `${fieldId}-message`
    const [open, setOpen] = useState(false)

    const selected = fromDateValue(value)
    const minDate = min ? fromDateValue(min) : null
    const maxDate = max ? fromDateValue(max) : null

    const display = (() => {
        if (!selected) return placeholder ?? t('date_field_placeholder')
        const options: Intl.DateTimeFormatOptions = {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        }
        try {
            return new Intl.DateTimeFormat(currentLanguage, options).format(selected)
        } catch {
            return new Intl.DateTimeFormat('en', options).format(selected)
        }
    })()

    return (
        <FieldShell
            id={fieldId}
            label={label}
            hint={hint}
            error={error}
            messageId={messageId}
            testId={testId}
        >
            <Popover.Root open={open} onOpenChange={setOpen}>
                {/*
                 * A real `<button>` carrying the field surface, so the whole box is the target rather
                 * than a glyph in its corner — which is the split the native control forced and the
                 * one thing about it nobody liked. `htmlFor` on the label points here, so pressing
                 * the label opens the picker.
                 */}
                <Popover.Trigger
                    id={fieldId}
                    data-testid={testId}
                    disabled={disabled}
                    aria-describedby={messageId}
                    aria-invalid={error ? true : undefined}
                    /*
                     * The name carries the **label and the value**, which a plain `<button>` here does
                     * not: `FieldShell`'s `<label htmlFor>` names the trigger, and a labelled button's
                     * own content then stops being part of its accessible name — so a screen reader
                     * announced "Date of birth, button" and never the date that was in it. Naming it
                     * explicitly is the only version that says both.
                     */
                    aria-label={selected ? `${label}: ${display}` : label}
                    className={cn(
                        FIELD_SURFACE,
                        FIELD_HEIGHT,
                        'flex cursor-pointer items-center justify-between gap-2 text-start',
                        'data-[popup-open]:border-(--input-border-focus)',
                        selected ? 'text-(--input-text)' : 'text-(--input-placeholder)',
                    )}
                >
                    <span className="type-body-default min-w-0 truncate">{display}</span>
                    <Icon
                        name="calendar"
                        size={20}
                        aria-hidden
                        className="flex-none text-(--icon-secondary)"
                    />
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Positioner sideOffset={8} align="start" className="z-50 outline-none">
                        <Popover.Popup
                            className={cn(
                                'w-[320px] max-w-[calc(100vw-2rem)] p-3',
                                'rounded-lg bg-(--background-elevated) shadow-[var(--shadow-xl)]',
                                'origin-(--transform-origin) outline-none',
                                'transition-[opacity,transform] duration-[160ms] ease-out',
                                'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
                                'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
                            )}
                        >
                            <LazyCalendar
                                data-testid={subTestId(testId, 'calendar')}
                                mode="single"
                                selected={selected ?? undefined}
                                onSelect={date => {
                                    if (!date) return
                                    onValueChange(toDateValue(date))
                                    // A single date is chosen the moment it is pressed; leaving the
                                    // popover open would make the reader dismiss a panel that has
                                    // nothing left to say.
                                    setOpen(false)
                                }}
                                defaultMonth={selected ?? maxDate ?? undefined}
                                startMonth={startMonth ?? minDate ?? defaultStartMonth()}
                                endMonth={maxDate ?? undefined}
                                disabled={[
                                    ...(maxDate ? [{ after: maxDate }] : []),
                                    ...(minDate ? [{ before: minDate }] : []),
                                ]}
                                // Dropdowns, not chevrons alone: a date of birth is 30 years of
                                // "previous month" otherwise.
                                captionLayout="dropdown"
                                autoFocus
                            />
                        </Popover.Popup>
                    </Popover.Positioner>
                </Popover.Portal>
            </Popover.Root>
        </FieldShell>
    )
}
