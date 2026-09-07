'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '../providers/auth-provider'
import { AuthErrorMessage } from './auth-error-message'
import { AuthLayout } from './auth-layout'
import { AuthMethodButtons } from './auth-method-buttons'
import { AuthStepHeader } from './auth-step-header'
import { EmailSignInForm } from './email-sign-in-form'
import { ForgotPasswordFlow } from './forgot-password-flow'
import { QrSignInPanel } from './qr-sign-in-panel'
import { TurnstileChallenge } from './turnstile-challenge'

/**
 * `/login`, and `/signup` through `mode` — legacy ships two containers whose only real
 * difference is the wording (`containers/login` vs `containers/signup`); every provider
 * here creates an account on first use anyway, so two copies of this markup would drift
 * apart for nothing.
 *
 * The card is composed from whichever methods the mode actually offers, rather than a
 * fixed sequence with pieces switched off. That matters because the two modes do not
 * offer the same set:
 *
 * - **Sign in** has both. The email form leads and the providers sit under it as marks;
 *   legacy stacks all eight as identical full-width pills
 *   (`tevi-web-app/src/containers/login`), which gives the page no hierarchy at all.
 * - **Sign up** has *only* providers. There is no email registration to offer — no
 *   endpoint exists for it, and legacy's signup page is social-only for the same reason
 *   (`containers/signup`); an account is created implicitly on a first social sign-in.
 *   `setup-credentials` is a settings flow, behind a bearer.
 *
 * So on sign-up the marks are not the alternative to anything — they are the whole
 * content, and they get the weight to match. Rendering the sign-in form there was worse
 * than a layout problem: it offered a "Sign in" button and a password reset to someone
 * trying to create an account.
 *
 * Email is **a choice among the others, not a form sitting open below them**. Two live
 * text fields under seven buttons made the card the length of a phone screen and read as
 * the primary path, which is backwards — most people here sign in with a provider and
 * never touch it. Pressing it opens the fields as their own step, the way the reset flow
 * does: one thing on screen, and a way back.
 *
 * **QR is a step too**, for the same reason email is: it is one of the ways in, not a panel
 * that has to be on screen while somebody reads the others. Legacy opens it in a dialog
 * stacked on top of this card, which on `/login` is a modal over a page that is already
 * nothing but this card.
 *
 * The app-download QR panel legacy floats off the card's right edge is still absent — it
 * needs an asset we do not have, and a control that cannot do anything is worse than none.
 */
/** Which of the four things the card is showing. */
type Step = 'choose' | 'email' | 'forgot' | 'qr'

export function LoginScreen({
    mode = 'sign-in',
    webview = false,
}: {
    mode?: 'sign-in' | 'sign-up'
    /**
     * This is not a page — it is a screen inside the mobile app's `/app/*` WebView
     * (`app/app/privacy-settings/screen.tsx`, the only caller that sets it). Three things follow,
     * and they are one prop rather than three because a caller that got two of them right and
     * forgot the third would ship a working screen with a hole in it:
     *
     * 1. **Height comes from the parent** (`AuthLayout`'s `fill`): the webview shell already owns
     *    the viewport *and* the safe-area insets it reserves.
     * 2. **The legal links point at the `/app/*` twins.** `/terms` and `/privacy` are website
     *    URLs, so tapping one inside the app lands on the public site with the full web shell —
     *    navbar, tab bar, the session stack this subtree deliberately does not mount. `/app/terms`
     *    and `/app/privacy` are the same documents with no chrome, which is what the app wants.
     * 3. **The sign-up line is dropped.** It is the one link with no `/app/*` equivalent, and it
     *    costs nothing to lose: every provider above it creates an account on first use, which is
     *    exactly why `/signup` is social-only in the first place.
     */
    webview?: boolean
}) {
    const signUp = mode === 'sign-up'
    const { t } = useTranslation()
    const { turnstileSiteKey, turnstileNonce } = useAuth()
    const [step, setStep] = useState<Step>('choose')

    /**
     * A challenge outranks every step: it is raised by an attempt already in flight, and
     * that attempt is replayed the moment the widget resolves. Leaving the step it came
     * from on screen would invite a second submit that 406s again and resets the widget
     * the user is halfway through.
     */
    if (turnstileSiteKey) {
        return (
            <AuthLayout fill={webview}>
                {/* Keyed on the nonce: a second challenge must get a brand-new widget,
                    because the first one's token has already been spent. */}
                <TurnstileChallenge key={turnstileNonce} siteKey={turnstileSiteKey} />
            </AuthLayout>
        )
    }

    // Back from a reset lands on the email form, not on the provider list — that is where
    // it was opened from, and it is where the password that was just reset gets used.
    if (step === 'forgot') {
        return (
            <AuthLayout fill={webview}>
                <ForgotPasswordFlow onCancel={() => setStep('email')} />
            </AuthLayout>
        )
    }

    if (step === 'qr') {
        return (
            <AuthLayout fill={webview}>
                {/* The panel draws its own header — it owns a failure state the card cannot
                    see, and the way back from that is a retry rather than a heading. */}
                <QrSignInPanel onBack={() => setStep('choose')} />
            </AuthLayout>
        )
    }

    if (step === 'email') {
        return (
            <AuthLayout fill={webview}>
                <AuthStepHeader
                    title={t('auth_sign_in_with', { provider: t('auth_provider_email') })}
                    onBack={() => setStep('choose')}
                />
                <EmailSignInForm onForgotPassword={() => setStep('forgot')} />
            </AuthLayout>
        )
    }

    return (
        <AuthLayout fill={webview}>
            <div className="flex w-full flex-col gap-1">
                <h1 className="type-title-t1-bold text-text-title">
                    {t(signUp ? 'auth_sign_up_title' : 'auth_sign_in_title')}
                </h1>
                <p className="type-body-default text-pretty text-text-body">
                    {t(signUp ? 'auth_sign_up_subtitle' : 'auth_sign_in_subtitle')}
                </p>
            </div>

            {/* No "Sign in with" heading here — every button already begins with those
                words. The dialog keeps one, because its marks carry no words at all. */}
            <div className="flex w-full flex-col items-center gap-3">
                {/* One stack, email included, the way legacy lists them
                    (`containers/login`). There used to be an `or` divider above the email
                    row, which framed it as the alternative to the other seven — but it is
                    not an alternative to them, it is an eighth way in, and the divider
                    only made the card taller and the choice look like two decisions
                    instead of one.

                    Labelled rows, as legacy has them: on a page there is room for the
                    provider's name, and a name is read where a mark has to be recognised
                    first. The dialog uses the icon variant instead — see
                    `provider-button.tsx`. */}
                <AuthMethodButtons
                    mode={mode}
                    // Sign-up gets no email row: there is no registration endpoint behind
                    // it, so it would be a button that cannot work.
                    onEmail={signUp ? undefined : () => setStep('email')}
                    // Sign-up gets no QR row either, and for a stronger reason: the code is
                    // scanned by an app that is already signed in, so there is no account
                    // for it to create. See `AuthMethodButtons`.
                    onQrCode={signUp ? undefined : () => setStep('qr')}
                />
                {/* A rejected Apple or TikTok attempt reports here, next to the marks —
                    the email form carries its own copy of this for its own failures. */}
                <AuthErrorMessage forMethod="social" />
            </div>

            {/* The way to the *other* mode — and the one thing a webview drops rather than
                redirects, because `/signup` has no `/app/*` twin and needs none: every provider
                above creates an account on first use. See the `webview` prop. */}
            {!webview && (
                <p className="type-body-default text-text-body">
                    {t(signUp ? 'auth_already_have_account' : 'auth_no_account_yet')}{' '}
                    <Link
                        data-testid="auth-mode-switch"
                        href={signUp ? '/login' : '/signup'}
                        className="type-body-strong text-text-link underline underline-offset-2 hover:no-underline"
                    >
                        {t(signUp ? 'auth_sign_in' : 'auth_sign_up')}
                    </Link>
                </p>
            )}

            {/* Legacy builds this with `dangerouslySetInnerHTML` over a translated string.
                Interpolating two real <Link>s keeps the sentence translatable without
                turning a translation file into an HTML sink.

                Both destinations follow the surface: the same two documents live at `/app/terms`
                and `/app/privacy` without the website's chrome, which is the only version that
                makes sense inside the app's WebView. See the `webview` prop. */}
            <p className="type-caption-meta text-pretty text-center text-text-subtitle">
                {t('auth_legal_prefix')}{' '}
                <Link
                    data-testid="auth-terms"
                    href={webview ? '/app/terms' : '/terms'}
                    className="text-text-link underline hover:no-underline"
                >
                    {t('auth_legal_terms')}
                </Link>{' '}
                {t('auth_legal_and')}{' '}
                <Link
                    data-testid="auth-privacy"
                    href={webview ? '/app/privacy' : '/privacy'}
                    className="text-text-link underline hover:no-underline"
                >
                    {t('auth_legal_privacy')}
                </Link>
                .
            </p>
        </AuthLayout>
    )
}
