'use client'

import {
    FIELD_HEIGHT,
    FIELD_SURFACE,
    FieldShell,
    TextField,
    type TextFieldProps,
} from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId, type TestIdProps } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import { type ReactNode, useId, useState } from 'react'

/**
 * The text inputs every auth and credential form shares.
 *
 * The surface used to be re-declared in each form — the same nine classes copied into the
 * sign-in form and the reset flow, and a third, different set (`border-input bg-background`)
 * before that, which is why the fields once sat a shade off every other control on the page.
 *
 * It now lives in **`shared/components/field.tsx`**, and it moved for the same reason it was
 * consolidated in the first place: the edit-profile form needs the identical surface, and a
 * second copy of the class string is how two screens end up a shade apart. `AUTH_FIELD_CLASS`
 * stays as the name this feature's other files already import.
 *
 * These are still **not** `shared/ui` components — see the note in `shared/components/field.tsx`
 * for why claiming a DS port here would be a lie.
 */

/** The DS text-field surface, from the `--input-*` ramp. One definition, over there. */
export const AUTH_FIELD_CLASS = cn(FIELD_SURFACE, FIELD_HEIGHT)

/**
 * A labelled single-line field — the email input on the connect step.
 *
 * The same component as `shared/components/field.tsx`'s, kept under this name because the
 * auth forms import it by it. Not re-implemented here: two identical fields is the drift
 * this file's own history is about.
 */
export type AuthTextFieldProps = TextFieldProps
export const AuthTextField = TextField

/**
 * `prefix` is omitted alongside `type`: this field draws its own trailing reveal toggle and has no
 * leading adornment, so the prop had nowhere to render — it fell through into the `<input>` spread,
 * where `ReactNode` is not what the native attribute accepts.
 */
export type PasswordFieldProps = Omit<AuthTextFieldProps, 'type' | 'prefix'> & {
    /** Rendered between the field and its message — the requirements checklist. */
    footer?: ReactNode
}

/**
 * A password input with a reveal toggle and a Caps Lock warning.
 *
 * **Caps Lock is the point of the warning.** It is the single most common reason a
 * correctly-remembered password is rejected, and the field is masked, so it is also the one
 * mistake the user cannot see themselves making. `getModifierState` is read on every key
 * event rather than tracked as a toggle: the key can be pressed while another window has
 * focus, so counting presses drifts out of step with the actual state.
 *
 * The reveal control sits **inside** the field at its trailing edge. Beside the label it
 * reads as a separate control rather than as part of the input.
 */
export function PasswordField({
    label,
    hint,
    error,
    footer,
    id,
    onKeyDown,
    onKeyUp,
    onBlur,
    'data-testid': testId,
    ...props
}: PasswordFieldProps & TestIdProps) {
    const { t } = useTranslation()
    const generated = useId()
    const fieldId = id ?? generated
    const messageId = `${fieldId}-message`
    const capsId = `${fieldId}-caps`
    const [revealed, setRevealed] = useState(false)
    const [capsLock, setCapsLock] = useState(false)

    const readCaps = (event: React.KeyboardEvent<HTMLInputElement>) => {
        // `getModifierState` is absent on synthetic events in some test environments and on
        // very old engines; a missing warning is the correct degradation.
        setCapsLock(event.getModifierState?.('CapsLock') ?? false)
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
            <div className="relative">
                <input
                    {...props}
                    data-testid={testId}
                    id={fieldId}
                    type={revealed ? 'text' : 'password'}
                    aria-invalid={error ? true : undefined}
                    // Both, so a screen reader gets the requirements *and* the caps
                    // warning without either replacing the other.
                    aria-describedby={capsLock ? `${capsId} ${messageId}` : messageId}
                    onKeyDown={event => {
                        readCaps(event)
                        onKeyDown?.(event)
                    }}
                    onKeyUp={event => {
                        readCaps(event)
                        onKeyUp?.(event)
                    }}
                    onBlur={event => {
                        // The warning is about *this* field; leaving it makes the
                        // warning stale rather than wrong-but-current.
                        setCapsLock(false)
                        onBlur?.(event)
                    }}
                    // `pe-12` keeps a long password from running under the toggle.
                    // `cn` is tailwind-merge, so this replaces only the end side of
                    // `px-4` rather than fighting it.
                    className={cn(AUTH_FIELD_CLASS, 'pe-12')}
                />
                {/*
                 * `end-2` and `pe-12`, not `right`/`pr`: these flip with the document
                 * direction, and `pnpm lint:rtl` fails the physical properties.
                 *
                 * **Two glyphs, because one weight cannot carry a state here.** This used
                 * to be `<Icon name="eye" weight={revealed ? 'filled' : undefined} />` on
                 * the belief that `eye` ships outline-and-solid. It does not: the Figma
                 * library drew it filled only (`icons.md`: `eye *(filled only)*`), and in
                 * the sprite the bare id is an alias —
                 * `<symbol id="eye"><use href="#eye--filled"/></symbol>` — so both states
                 * resolved to the same paths. No error, no blank box, just a toggle that
                 * never changed, worst on `settings/password` where the field starts empty
                 * so the masked dots were not there to change either.
                 *
                 * `eye-slash` is the pair: from the Figma library since the 2026-10-08 import
                 * (from the upstream-Zappicon overlay before that), aliased onto `--filled`
                 * like `eye`, so the two weights agree.
                 *
                 * The words travel on `aria-label`; `aria-pressed` states it again for a
                 * screen reader. `tabIndex={-1}` deliberately: tabbing out of a password
                 * field should reach the next field, not a decoration on the one just
                 * left. It stays a real button, so pointer and screen-reader users both
                 * have it.
                 */}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setRevealed(v => !v)}
                    aria-pressed={revealed}
                    aria-controls={fieldId}
                    aria-label={revealed ? t('auth_password_hide') : t('auth_password_show')}
                    data-testid={subTestId(testId, 'reveal')}
                    title={revealed ? t('auth_password_hide') : t('auth_password_show')}
                    className={cn(
                        'absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center',
                        'cursor-pointer rounded-md text-(--text-body) transition-colors',
                        'hover:bg-(--background-subtle) hover:text-(--text-title)',
                    )}
                >
                    <Icon name={revealed ? 'eye' : 'eye-slash'} size={18} />
                </button>
            </div>

            {capsLock && (
                <p
                    id={capsId}
                    data-testid={subTestId(testId, 'caps')}
                    className="type-caption-meta flex items-center gap-1 text-(--text-warning)"
                >
                    <Icon
                        name="exclamation-triangle"
                        weight="filled"
                        size={16}
                        aria-hidden
                        className="shrink-0"
                    />
                    {t('password_caps_lock')}
                </p>
            )}

            {footer}
        </FieldShell>
    )
}
