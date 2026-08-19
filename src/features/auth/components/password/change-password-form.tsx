'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Loader } from '@shared/ui/loader'
import { type FormEvent, useRef, useState } from 'react'
import { authApi } from '../../api/auth-api'
import { toChangePasswordErrorKey } from '../../lib/auth-error'
import {
    checkPassword,
    confirmationErrorKey,
    isPasswordValid,
    PASSWORD_MAX_LENGTH,
} from '../../lib/password-policy'
import { PasswordField } from '../auth-fields'
import { PasswordChecklist } from './password-checklist'
import { PasswordStepHeader } from './password-step-header'

/**
 * Replacing a password the account already has: current, new, confirm.
 *
 * Ported from legacy's `containers/settingPassword/components/changePassword` and its
 * `useChangePassword` hook. Same three fields, same rules, same endpoint. What is different:
 *
 * - **A failed attempt says why, and only ever in our own words.** Legacy toasts
 *   `res.response.data.message` — the backend's untranslated string, on screen in every
 *   locale. Here it is a key (`toChangePasswordErrorKey`), and the one failure a user can
 *   act on ("that is not your current password") is named rather than folded into
 *   "something went wrong".
 * - **The wrong current password clears that field and takes focus back to it.** Legacy
 *   leaves all three filled and the caret wherever it was, so the retry starts by hunting
 *   for the field that was wrong.
 * - **Success is a screen, not a toast.** Legacy blanks the form and flashes a green
 *   message, which is indistinguishable from a form that reset itself.
 *
 * No `sid`, no OTP: possession of the current password is what authorises the change.
 */
export function ChangePasswordForm({
    /** The address this account signs in with — shown, and given to password managers. */
    email,
    onChanged,
}: {
    email?: string
    onChanged: () => void
}) {
    const { t } = useTranslation()

    const [current, setCurrent] = useState('')
    const [password, setPassword] = useState('')
    const [confirmation, setConfirmation] = useState('')
    const [errorKey, setErrorKey] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const currentRef = useRef<HTMLInputElement>(null)
    /** See `PasswordSetupFlow` — `setBusy` lands next render, a ref lands now. */
    const inFlight = useRef(false)

    const checks = checkPassword(password)
    const mismatchKey = confirmationErrorKey(password, confirmation)
    /**
     * Reported on the *new* field, and only once it is otherwise acceptable: telling someone
     * their password matches the current one while they are three characters into typing it
     * is both premature and a nudge that they got the current one right.
     */
    const reusedKey =
        password && password === current && isPasswordValid(password)
            ? 'password_error_same_as_current'
            : null

    const canSubmit =
        Boolean(current) && isPasswordValid(password) && confirmation === password && !reusedKey

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (!canSubmit || inFlight.current) return

        inFlight.current = true
        setBusy(true)
        setErrorKey(null)

        authApi
            .changePassword({ current_password: current, new_password: password })
            .then(onChanged)
            .catch((error: unknown) => {
                const key = toChangePasswordErrorKey(error)
                setErrorKey(key)
                if (key === 'password_error_current_incorrect') {
                    // Clear it and put the caret back, so the retry starts in the field
                    // that was wrong. The element is not remounted by the re-render, so
                    // focusing it here holds.
                    setCurrent('')
                    currentRef.current?.focus()
                }
            })
            .finally(() => {
                inFlight.current = false
                setBusy(false)
            })
    }

    return (
        <form onSubmit={submit} className="flex w-full flex-col gap-6">
            <PasswordStepHeader
                icon={{ name: 'lock-simple', weight: 'filled' }}
                title={t('password_change_title')}
                description={t('password_change_description')}
                email={email}
            />

            <div className={cn('flex flex-col gap-4', RISE)} style={riseDelay(2)}>
                {/* For password managers, not for people — a change form with no username
                    field is saved against the wrong site or not offered at all. */}
                <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    value={email ?? ''}
                    readOnly
                    tabIndex={-1}
                    aria-hidden
                    className="sr-only"
                />

                <PasswordField
                    ref={currentRef}
                    label={t('password_current_label')}
                    autoComplete="current-password"
                    // The form's first control, on a page whose only purpose is this
                    // form — reached by an explicit navigation, never unasked.
                    autoFocus
                    value={current}
                    onChange={e => setCurrent(e.target.value)}
                    // The field is only marked wrong by the server's verdict — nothing on
                    // the client can know whether it is right.
                    error={
                        errorKey === 'password_error_current_incorrect'
                            ? t('password_error_current_incorrect')
                            : undefined
                    }
                />

                <PasswordField
                    label={t('password_new_label')}
                    autoComplete="new-password"
                    maxLength={PASSWORD_MAX_LENGTH}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    error={reusedKey ? t(reusedKey) : undefined}
                    footer={<PasswordChecklist checks={checks} className="pt-1" />}
                />

                <PasswordField
                    label={t('password_confirm_label')}
                    autoComplete="new-password"
                    maxLength={PASSWORD_MAX_LENGTH}
                    value={confirmation}
                    onChange={e => setConfirmation(e.target.value)}
                    error={mismatchKey ? t(mismatchKey) : undefined}
                />

                {/* The current-password case is reported on the field itself, which is where
                    the fix is; everything else has no field to belong to. */}
                {errorKey && errorKey !== 'password_error_current_incorrect' && (
                    <p
                        role="alert"
                        className={cn(
                            'type-dense-default w-full rounded-lg px-4 py-3',
                            'bg-(--accents-error-bg-active) text-(--text-error)',
                            RISE,
                        )}
                    >
                        {t(errorKey)}
                    </p>
                )}

                <Button
                    type="submit"
                    variant="accent"
                    size="large"
                    fullWidth
                    disabled={busy || !canSubmit}
                    aria-busy={busy || undefined}
                    className="active:not-disabled:scale-[0.99]"
                >
                    {t('password_change_cta')}
                    {busy ? <Loader className="size-5 [&>span]:bg-current" /> : null}
                </Button>
            </div>
        </form>
    )
}
