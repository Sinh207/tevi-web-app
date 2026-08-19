'use client'

import { FIELD_SURFACE, FieldShell } from '@shared/components/field'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { type ComponentPropsWithRef, useId, useRef } from 'react'

/**
 * A date field — the browser's own picker, wearing this form's clothes.
 *
 * ## What was actually wrong with `<input type="date">`
 *
 * Not the picker. The **chrome around it**: a browser draws its own calendar button, its own
 * `dd/mm/yyyy` placeholder in its own grey, and its own inner spacing, none of which match the
 * fields above it and none of which are the same on two machines. Dropped into a bordered box it
 * reads as a control from a different form.
 *
 * All three are addressable, and none of them require replacing the picker:
 *
 * - **The browser's own button is removed** (`::-webkit-calendar-picker-indicator`, `display: none`)
 *   and replaced by a real `<button>` carrying the DS's `calendar` glyph, which calls
 *   `showPicker()`. One shape on every platform, at the DS's size and colour, and a control a
 *   screen reader can name.
 * - **The text stays clickable.** The first attempt stretched the invisible native indicator over
 *   the whole field so that a click anywhere opened the calendar — and that swallowed every click,
 *   so the field could no longer be focused or typed into at all. Measured, not reasoned about:
 *   clicking the left edge left `document.activeElement` on the body and the keystrokes went
 *   nowhere. Clicking the text now places the caret, clicking the button opens the picker, which
 *   is the split every date field the reader has used already has.
 * - **The text is ours**: `type-body-default`, `--input-text` when there is a value and
 *   `--input-placeholder` when there is not, so an empty date reads like every other empty field
 *   rather than like a filled one saying `dd/mm/yyyy`.
 *
 * `showPicker()` throws when the browser has no picker for the type, or when the call is not
 * user-activated. Both are caught and both are fine: the field still accepts typing, which is the
 * fallback the native control provides for free.
 *
 * ⚠ **Firefox draws its own indicator and offers no way to hide it** — `::-webkit-*` is not its
 * pseudo-element, and it has no equivalent. So on Firefox the two icons sit in the same corner.
 * Known, and not worth a user-agent branch: the alternative is dropping our glyph for everyone so
 * that one browser looks tidy.
 *
 * ## Why not a calendar of our own
 *
 * `docs/DESIGN_SYSTEM.md` names the date picker as one of the five families Figma has **not**
 * drawn, so a custom one would be an invented component — and it would have to earn its keep
 * against a native control that is already localised, keyboard-complete, screen-reader-complete
 * and, on a phone, a full-screen wheel.
 */
export type ProfileDateFieldProps = Omit<ComponentPropsWithRef<'input'>, 'className' | 'type'> & {
    label: string
    hint?: string
    error?: string | null
}

export function ProfileDateField({
    label,
    hint,
    error,
    id,
    value,
    ...props
}: ProfileDateFieldProps) {
    const generated = useId()
    const fieldId = id ?? generated
    const messageId = `${fieldId}-message`
    const inputRef = useRef<HTMLInputElement>(null)

    return (
        <FieldShell id={fieldId} label={label} hint={hint} error={error} messageId={messageId}>
            <div
                className={cn(FIELD_SURFACE, 'relative flex h-12 items-center px-0')}
                aria-invalid={error ? true : undefined}
            >
                <input
                    {...props}
                    ref={inputRef}
                    id={fieldId}
                    type="date"
                    value={value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={messageId}
                    className={cn(
                        'type-body-default h-full w-full bg-transparent ps-4 pe-11 focus:outline-none',
                        // Safari otherwise gives the control its own inset shadow and rounding.
                        'appearance-none',
                        // The browser's own button, gone — ours is next to it and does the job.
                        '[&::-webkit-calendar-picker-indicator]:hidden',
                        value ? 'text-(--input-text)' : 'text-(--input-placeholder)',
                    )}
                />
                <button
                    type="button"
                    disabled={props.disabled}
                    aria-label={label}
                    onClick={() => {
                        try {
                            inputRef.current?.showPicker?.()
                        } catch {
                            // No picker on this browser, or the call was not user-activated. The
                            // field still types, which is the native fallback.
                        }
                    }}
                    className={cn(
                        'absolute end-2 flex size-8 items-center justify-center rounded-md',
                        'cursor-pointer text-(--text-placeholder) transition-colors',
                        'hover:bg-(--background-segment) hover:text-(--text-body)',
                        'disabled:cursor-not-allowed disabled:opacity-60',
                    )}
                >
                    <Icon name="calendar" size={20} aria-hidden />
                </button>
            </div>
        </FieldShell>
    )
}
