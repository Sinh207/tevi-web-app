'use client'

import { subTestId, type TestIdProps } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'
import { type ComponentPropsWithRef, type ReactNode, useId } from 'react'

/**
 * The form-field surface every screen in this app shares — label, control, one message line.
 *
 * ## Why this is `shared/components/` and not `shared/ui/`
 *
 * `shared/ui/` is the **ported** design system: a file there claims a Figma component exists and
 * that its geometry was read off the file. The DS's Text Field has only had its *label row*
 * ported (`shared/ui/field-label.tsx`); the input itself is drawn from the `--input-*` token
 * ramp and nothing else. Putting it in `shared/ui/` would assert a port that has not happened —
 * which is exactly the reasoning `features/auth/components/auth-fields.tsx` gave when it kept
 * these classes local.
 *
 * It stopped being able to stay local the moment a second feature needed the same surface. The
 * edit-profile form has seven controls on it, and a copy of the class string over there is how
 * the two drift a shade apart — which has already happened once in this codebase (auth's own
 * fields sat on `border-input bg-background` while everything else used the `--input-*` ramp).
 * So there is now one definition and `AUTH_FIELD_CLASS` is an alias of it.
 *
 * When the DS ships the real Text Field, this file becomes a thin wrapper over it and the class
 * below goes away.
 */

/** The DS text-field surface, from the `--input-*` ramp. */
export const FIELD_SURFACE = cn(
    'type-body-default w-full rounded-lg px-4',
    'border border-(--input-border) bg-(--input-bg) text-(--input-text)',
    'placeholder:text-(--input-placeholder)',
    'transition-colors hover:border-(--input-border-hover)',
    'focus:border-(--input-border-focus) focus:outline-none',
    'aria-[invalid=true]:border-(--input-border-error)',
    // A field that cannot be used has to look it — otherwise the only signal is that
    // typing does nothing.
    'disabled:cursor-not-allowed disabled:opacity-60',
)

/** Single-line height. Multi-line fields set their own and keep the padding. */
export const FIELD_HEIGHT = 'h-12'

export type FieldShellProps = {
    id: string
    label: ReactNode
    /** Standing help — shown whenever there is no error to show instead. */
    hint?: ReactNode
    /** A translated sentence. Present ⇒ the field is invalid and this replaces the hint. */
    error?: string | null
    /** `${id}-message`, wired to the control's `aria-describedby` by the caller. */
    messageId: string
    /** The right-hand side of the label row — a character count, a checking spinner. */
    labelData?: ReactNode
    children: ReactNode
    className?: string
    /**
     * Base `data-testid`. The **bare** id stays on the control (the caller puts it there); the
     * furniture derives — `-field` on the wrapper, `-label`, `-label-data`, `-message`, and
     * `-error` / `-hint` on whichever of the two is showing.
     *
     * The message line needs its own id rather than being reached through `aria-describedby`,
     * because `messageId` is `${id}-message` and `id` is `useId()` unless a caller supplied one —
     * a React-internal value that changes shape between versions and needs CSS escaping. So the
     * most common form assertion in a suite becomes `[data-testid='…-error']`: present means
     * invalid, and its text is the message. `role="alert"` stays, so it is assertable by role too.
     */
    testId?: string
}

/**
 * Label, control, and the one line underneath that is either help or the reason it is
 * wrong — never both, and never two lines where there was one.
 *
 * The message slot keeps its height reserved (`min-h-4`) so a field does not grow by a
 * line the moment it is judged: in a form of seven fields that reflow moves the submit
 * button out from under the pointer between the press and the release.
 */
export function FieldShell({
    id,
    label,
    hint,
    error,
    messageId,
    labelData,
    children,
    className,
    testId,
}: FieldShellProps) {
    return (
        <div
            className={cn('flex flex-col gap-1.5', className)}
            data-testid={subTestId(testId, 'field')}
        >
            <div className="flex items-baseline gap-2">
                <label
                    htmlFor={id}
                    data-testid={subTestId(testId, 'label')}
                    className="type-dense-strong min-w-0 flex-auto text-(--text-body)"
                >
                    {label}
                </label>
                {labelData !== undefined && (
                    <span
                        data-testid={subTestId(testId, 'label-data')}
                        className="type-caption-meta flex-none text-(--text-subtitle)"
                    >
                        {labelData}
                    </span>
                )}
            </div>
            {children}
            <div id={messageId} data-testid={subTestId(testId, 'message')} className="min-h-4">
                {error ? (
                    // `role="alert"` and not `aria-live`: this appears in response to
                    // something the user just did, and is worth interrupting for.
                    <p
                        role="alert"
                        data-testid={subTestId(testId, 'error')}
                        className="type-caption-meta text-(--text-error)"
                    >
                        {error}
                    </p>
                ) : hint ? (
                    <div
                        data-testid={subTestId(testId, 'hint')}
                        className="type-caption-meta text-(--text-subtitle)"
                    >
                        {hint}
                    </div>
                ) : null}
            </div>
        </div>
    )
}

/**
 * `prefix` is **omitted from the input's own props**, not merely added to them.
 *
 * `<input>` has a native `prefix` attribute typed `string`, so intersecting the two produced
 * `string & ReactNode` — which accepts `"@"` and rejects every element. The prop below is
 * documented as rendering a node inside the field, and it renders one; the collision was invisible
 * until the first caller passed something other than a character (the Star mark on the donate
 * dialog's amount field). Omitting the native attribute is what makes the declared type the real one.
 */
export type TextFieldProps = Omit<ComponentPropsWithRef<'input'>, 'className' | 'prefix'> & {
    label: ReactNode
    hint?: ReactNode
    error?: string | null
    labelData?: ReactNode
    /** Rendered inside the field at its leading edge — the `@` before a username. */
    prefix?: ReactNode
    /**
     * Rendered inside the field at its trailing edge — a clear button, a unit.
     *
     * Symmetric with `prefix` and sharing its wrapper: an adornment on either side means the
     * *wrapper* carries the field surface and the input is stripped bare, which is the only
     * arrangement where the two read as one value rather than as a control beside a box.
     *
     * Interactive content is allowed here (unlike `prefix`, which is a character in practice) and
     * has to keep itself out of the way: the reason is that the field's `<label htmlFor>` does not
     * cover it, so anything pressable in here needs its own accessible name.
     */
    suffix?: ReactNode
    /** Rendered between the control and its message — a rule checklist. */
    footer?: ReactNode
}

/**
 * A labelled single-line field.
 *
 * A `data-testid` passed here lands on the `<input>` in **both** layout arms, so a locator that
 * types into this field does not change the day a designer adds a suffix icon and the markup
 * switches arms. That property is the point of the whole layout. The furniture derives from the
 * same string — see `FieldShellProps.testId`.
 */
export function TextField({
    label,
    hint,
    error,
    labelData,
    prefix,
    suffix,
    footer,
    id,
    'data-testid': testId,
    ...props
}: TextFieldProps & TestIdProps) {
    const generated = useId()
    const fieldId = id ?? generated
    const messageId = `${fieldId}-message`

    return (
        <FieldShell
            id={fieldId}
            label={label}
            hint={hint}
            error={error}
            labelData={labelData}
            messageId={messageId}
            testId={testId}
        >
            {prefix || suffix ? (
                /*
                 * An adornment sits *inside* the border rather than beside the field, so the `@`
                 * and what follows it read as one value. That means the wrapper carries the
                 * surface and the input is stripped bare — and `focus-within` moves the focus
                 * ring onto the wrapper, because the input no longer has a border to colour.
                 *
                 * The trailing side keeps its own padding rather than the wrapper's: `pe-1.5` so a
                 * 32px icon button sits 6px off the border instead of 16, which is what puts its
                 * *glyph* where a 16px inset would have put a character.
                 */
                <div
                    className={cn(
                        FIELD_SURFACE,
                        FIELD_HEIGHT,
                        'flex items-center gap-1 focus-within:border-(--input-border-focus)',
                        suffix ? 'pe-1.5' : undefined,
                    )}
                    data-testid={subTestId(testId, 'affix')}
                    aria-invalid={error ? true : undefined}
                >
                    {prefix ? (
                        <span
                            data-testid={subTestId(testId, 'prefix')}
                            className="type-body-default flex-none text-(--text-subtitle)"
                        >
                            {prefix}
                        </span>
                    ) : null}
                    <input
                        {...props}
                        data-testid={testId}
                        id={fieldId}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={messageId}
                        className="type-body-default min-w-0 flex-auto bg-transparent text-(--input-text) placeholder:text-(--input-placeholder) focus:outline-none"
                    />
                    {suffix ? (
                        <span
                            data-testid={subTestId(testId, 'suffix')}
                            className="flex flex-none items-center"
                        >
                            {suffix}
                        </span>
                    ) : null}
                </div>
            ) : (
                <input
                    {...props}
                    data-testid={testId}
                    id={fieldId}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={messageId}
                    className={cn(FIELD_SURFACE, FIELD_HEIGHT)}
                />
            )}
            {footer}
        </FieldShell>
    )
}

export type TextAreaFieldProps = Omit<ComponentPropsWithRef<'textarea'>, 'className'> & {
    label: ReactNode
    hint?: ReactNode
    error?: string | null
    labelData?: ReactNode
}

/**
 * A labelled multi-line field.
 *
 * `resize-y` and a `min-h`, not an auto-growing textarea: growing on input moves everything
 * below it while someone is typing into it, and this form's Save button is below it.
 */
export function TextAreaField({
    label,
    hint,
    error,
    labelData,
    id,
    rows = 3,
    'data-testid': testId,
    ...props
}: TextAreaFieldProps & TestIdProps) {
    const generated = useId()
    const fieldId = id ?? generated
    const messageId = `${fieldId}-message`

    return (
        <FieldShell
            id={fieldId}
            label={label}
            hint={hint}
            error={error}
            labelData={labelData}
            messageId={messageId}
            testId={testId}
        >
            <textarea
                {...props}
                data-testid={testId}
                id={fieldId}
                rows={rows}
                aria-invalid={error ? true : undefined}
                aria-describedby={messageId}
                className={cn(FIELD_SURFACE, 'min-h-24 resize-y py-3')}
            />
        </FieldShell>
    )
}
