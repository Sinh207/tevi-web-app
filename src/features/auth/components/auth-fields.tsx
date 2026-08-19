'use client'

import {
    FIELD_HEIGHT,
    FIELD_SURFACE,
    FieldShell,
    TextField,
    type TextFieldProps,
} from '@shared/components/field'
import { useTranslation } from '@shared/i18n/use-translation'
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

export type PasswordFieldProps = Omit<AuthTextFieldProps, 'type'> & {
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
    ...props
}: PasswordFieldProps) {
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
        <FieldShell id={fieldId} label={label} hint={hint} error={error} messageId={messageId}>
            <div className="relative">
                <input
                    {...props}
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
                 * The DS has no `eye-slash`. It uses a `--slash` suffix elsewhere
                 * (`bell-slash`, `comment-slash`) but never drew one for the eye, and
                 * substituting another shape or hand-drawing a path is not allowed.
                 * `eye` does ship in two weights, so the two states are two real
                 * glyphs: solid while showing, outline while hidden. The words travel
                 * on `aria-label` — the icon is the affordance, not the announcement.
                 *
                 * `tabIndex={-1}` deliberately: tabbing out of a password field should
                 * reach the next field, not a decoration on the one just left. It stays
                 * a real button, so pointer and screen-reader users both have it.
                 */}
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setRevealed(v => !v)}
                    aria-pressed={revealed}
                    aria-controls={fieldId}
                    aria-label={revealed ? t('auth_password_hide') : t('auth_password_show')}
                    title={revealed ? t('auth_password_hide') : t('auth_password_show')}
                    className={cn(
                        'absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center',
                        'cursor-pointer rounded-md text-(--text-body) transition-colors',
                        'hover:bg-(--background-subtle) hover:text-(--text-title)',
                    )}
                >
                    <Icon name="eye" weight={revealed ? 'filled' : undefined} size={18} />
                </button>
            </div>

            {capsLock && (
                <p
                    id={capsId}
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
