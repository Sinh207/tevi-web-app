'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from '@shared/i18n/use-translation'
import { Button } from '@shared/ui/button'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../providers/auth-provider'
import { AuthErrorMessage } from './auth-error-message'
import { AuthTextField, PasswordField } from './auth-fields'

const emailSchema = z.object({
    email: z.string().email('auth_email_invalid'),
    password: z.string().min(6, 'auth_password_min'),
})
type EmailValues = z.infer<typeof emailSchema>

/**
 * Email + password.
 *
 * The two fields are the shared ones from `auth-fields.tsx`. They used to be declared here:
 * the input surface, the label, the error span and the whole reveal-toggle button, all
 * copied again into the credential screens when those landed. Three copies of a text field
 * is three places for the `--input-*` ramp to drift, which is exactly how these fields once
 * ended up a shade off every other control on the page.
 *
 * Two things came back with the shared component and are worth naming, because they are
 * changes to this form rather than a like-for-like move:
 *
 * - **the message row keeps its height** whether or not there is an error, so a rejected
 *   password no longer grows the card by a line and shifts the button out from under the
 *   pointer between press and release;
 * - **a Caps Lock warning**, which matters more here than anywhere — this is the one masked
 *   field people type from memory, and the mistake is invisible by design.
 */
export function EmailSignInForm({ onForgotPassword }: { onForgotPassword?: () => void }) {
    const { t } = useTranslation()
    const { signInWithEmail, isSigningIn } = useAuth()

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<EmailValues>({ resolver: zodResolver(emailSchema) })

    const onSubmit = handleSubmit(async values => {
        try {
            await signInWithEmail(values)
            // Nothing to do on success. Whatever is hosting this form reacts to
            // `auth:signed-in` on the bus — see `LoginDialog`. A callback here would have
            // to distinguish a real sign-in from `'challenge'` (Cloudflare parked the
            // attempt, nobody is signed in yet), and the event already does.
        } catch {
            // `signInErrorKey` is the surface, not a toast of the backend's own words.
        }
    })

    const busy = isSubmitting || isSigningIn

    return (
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-3">
            <AuthTextField
                {...register('email')}
                label={t('auth_email')}
                type="email"
                placeholder={t('auth_email_placeholder')}
                autoComplete="email"
                // Both ways in are now an explicit "Continue with email" press, so the
                // caret belongs in the first field — the step exists for nothing else.
                // It would be wrong if this form were ever on screen unasked, which is
                // the state the step model removed.
                autoFocus
                error={errors.email ? t(errors.email.message ?? '') : undefined}
            />

            <PasswordField
                {...register('password')}
                label={t('auth_password')}
                placeholder={t('auth_password_placeholder')}
                autoComplete="current-password"
                error={errors.password ? t(errors.password.message ?? '') : undefined}
            />

            {onForgotPassword && (
                <button
                    type="button"
                    onClick={onForgotPassword}
                    className="type-caption-meta cursor-pointer self-start text-text-link underline underline-offset-2 hover:no-underline"
                >
                    {t('auth_forgot_password')}
                </button>
            )}

            {/* Directly above the button that produced it. Reported at the top of the
                card — where it used to sit — a wrong password landed most of a screen
                away from where the user was looking. */}
            <AuthErrorMessage forMethod="email" />

            <Button type="submit" variant="accent" size="large" fullWidth disabled={busy}>
                {busy ? t('auth_signing_in') : t('auth_sign_in')}
            </Button>
        </form>
    )
}
