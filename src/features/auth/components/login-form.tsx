'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { DialogHeader, DialogTitle } from '@shared/ui/dialog'
import { Logo } from '@shared/ui/logo'
import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '../providers/auth-provider'
import { AuthErrorMessage } from './auth-error-message'
import { AuthMethodButtons } from './auth-method-buttons'
import { AuthStepHeader } from './auth-step-header'
import { EmailSignInForm } from './email-sign-in-form'
import { ForgotPasswordFlow } from './forgot-password-flow'
import { QrSignInPanel } from './qr-sign-in-panel'
import { TurnstileChallenge } from './turnstile-challenge'

/**
 * The compact sign-in inside `LoginDialog`.
 *
 * Carries **every** provider, not just Google. It used to show Google alone, which meant
 * anyone who had signed up with Apple or TikTok — most people, going by the traffic —
 * could not get back in from the dialog at all. A modal that offers a subset of the ways
 * in is a dead end for whoever is outside that subset.
 *
 * `/login` renders the same three steps at page scale — see `LoginScreen`, which has the
 * same shape wrapped in a page instead of a dialog.
 *
 * **All three stay in the dialog, including the password reset.** That last one used to
 * close the dialog and `router.push('/login')`, on the theory that three steps and a back
 * button were more than a dialog should hold. Measured, the reset step is the *shortest*
 * screen here — 267px against 374 for the email form and 526 for the method list — so the
 * premise was simply wrong. The cost was not: this dialog exists because
 * `useRequireAuth` gates the **action** and never the route, precisely so that whatever
 * someone was reading stays behind it. Navigating them to `/login` for a password reset
 * threw away the page the dialog was protecting.
 */
export function LoginForm() {
    const { t } = useTranslation()
    const { turnstileSiteKey, turnstileNonce } = useAuth()
    const [step, setStep] = useState<'choose' | 'email' | 'forgot' | 'qr'>('choose')
    const emailTitle = t('auth_sign_in_with', { provider: t('auth_provider_email') })

    /**
     * Cloudflare interrupted the attempt: the challenge takes the whole form's place
     * rather than sitting under it. Leaving the fields live invites a second submit that
     * would 406 again and reset the widget the user is halfway through, and the parked
     * attempt is replayed automatically the moment the widget resolves — so there is
     * nothing left for them to press.
     */
    if (turnstileSiteKey) {
        return (
            <div className="flex w-full max-w-sm flex-col gap-5">
                {/* Every branch has to name the dialog: base-ui labels the popup from a
                    `Dialog.Title`, and this one had none, so a Cloudflare challenge left the
                    dialog with no accessible name at all. */}
                <DialogTitle className="sr-only">{t('auth_turnstile_title')}</DialogTitle>
                {/* Keyed on the nonce: a second challenge must get a brand-new widget,
                    because the first one's token has already been spent. */}
                <TurnstileChallenge key={turnstileNonce} siteKey={turnstileSiteKey} />
            </div>
        )
    }

    // Back from a reset lands on the email form, not on the method list — that is where it
    // was opened from, and where the password just set gets used.
    if (step === 'forgot') {
        return (
            <div className="flex w-full max-w-sm flex-col gap-4">
                {/* The step draws its own heading, so the dialog's name only has to exist
                    for the accessibility tree — base-ui labels the popup from it. Rendering
                    it visibly here would print the same words twice. */}
                <DialogTitle className="sr-only">{t('auth_forgot_title')}</DialogTitle>
                <ForgotPasswordFlow onCancel={() => setStep('email')} />
            </div>
        )
    }

    // Same step as `/login`, at dialog scale. Legacy stacks a *second* dialog on top of this
    // one for it; a modal over a modal is two backdrops and two Escape targets for what is one
    // more way in.
    if (step === 'qr') {
        return (
            <div className="flex w-full max-w-sm flex-col gap-4">
                {/* The panel draws its own visible heading, so the dialog's name only has to
                    exist for the accessibility tree — base-ui labels the popup from it. */}
                <DialogTitle className="sr-only">{t('auth_qr_title')}</DialogTitle>
                <QrSignInPanel onBack={() => setStep('choose')} />
            </div>
        )
    }

    // The fields open in the dialog the same way they do on `/login` — see `LoginScreen`.
    if (step === 'email') {
        return (
            <div className="flex w-full max-w-sm flex-col gap-4">
                <DialogTitle className="sr-only">{emailTitle}</DialogTitle>
                <AuthStepHeader title={emailTitle} onBack={() => setStep('choose')} />
                <EmailSignInForm onForgotPassword={() => setStep('forgot')} />
            </div>
        )
    }

    return (
        <div className="flex w-full max-w-sm flex-col gap-5">
            <DialogHeader>
                <Logo size={40} title={null} />
                {/* One line, not a title plus a description restating it. This used to read
                    "Sign in" over "Sign in to continue" above four buttons each beginning
                    "Sign in with" — seven of the same two words in a 370px box. */}
                <DialogTitle className="type-title-t2-semibold">
                    {t('auth_sign_in_to_continue')}
                </DialogTitle>
            </DialogHeader>

            {/* Filtered by which method failed, exactly as `/login` does. A raw read of
                `signInErrorKey` showed an email failure here too, on a step whose only
                controls are the providers. */}
            <AuthErrorMessage forMethod="social" />

            {/* The same split as `/login`, at the same size. The dialog used to show seven
                unlabelled circles to save height; four labelled rows plus a tile row costs
                about the same and does not ask anyone to recognise a mark first. */}
            <AuthMethodButtons onEmail={() => setStep('email')} onQrCode={() => setStep('qr')} />

            {/* The same consent the page states, on the step where an account can actually
                be created. Not on the reset step, where it would be describing something
                that is not happening. */}
            <p className="type-caption-meta text-pretty text-center text-text-subtitle">
                {t('auth_legal_prefix')}{' '}
                {/* New tab, unlike the page's copy of this line. Following a link in place
                    would unmount the page this dialog exists to keep on screen — the same
                    mistake the password reset used to make by pushing `/login`. */}
                <Link
                    data-testid="auth-dialog-terms"
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-link underline hover:no-underline"
                >
                    {t('auth_legal_terms')}
                </Link>{' '}
                {t('auth_legal_and')}{' '}
                <Link
                    data-testid="auth-dialog-privacy"
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-link underline hover:no-underline"
                >
                    {t('auth_legal_privacy')}
                </Link>
                .
            </p>
        </div>
    )
}
