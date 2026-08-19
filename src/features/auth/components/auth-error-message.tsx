'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { useAuth } from '../providers/auth-provider'

/**
 * The reason the last sign-in failed, shown beside the control that caused it.
 *
 * There is one error in the store but two places it can come from, and they now sit at
 * opposite ends of the card: the provider marks at the top, the email form at the bottom.
 * A single message pinned to the top of the card meant a wrong password was reported
 * most of a screen away from the button that had just been pressed. `forMethod` is what
 * decides which block owns it.
 */
export function AuthErrorMessage({ forMethod }: { forMethod: 'email' | 'social' }) {
    const { t } = useTranslation()
    const { signInErrorKey, signInErrorText, loginMethod } = useAuth()

    if (!signInErrorKey) return null
    const isEmail = loginMethod === 'email'
    if ((forMethod === 'email') !== isEmail) return null

    return (
        <p
            role="alert"
            className="type-dense-default w-full rounded-lg bg-(--accents-error-bg-active) px-4 py-3 text-text-error"
        >
            {/* A provider's own sentence when it sent one, because no key of ours can say
                "use a different Google account" — see `providerSignInErrorText`. It is
                already prose, so it is not passed through `t()`; it is also the only text
                on this screen the API writes, and only ever English. Every email failure
                and every provider failure without a usable body keeps the key. */}
            {signInErrorText ?? t(signInErrorKey)}
            {/*
             * The credentials case gets a nudge towards the providers.
             *
             * A social-only account — someone who signed up with Google and never set a
             * password — cannot be told apart here, and deliberately so: the only way to
             * know would be for the server to confirm the address exists, which is the
             * account enumeration that `toSignInErrorKey` maps 400 and 401 together to
             * prevent. (`GET v1/user-login/` answers this, but only for an already
             * authenticated user — it is a settings endpoint, not a login one.)
             *
             * So the hint is phrased as a possibility rather than a fact. It helps the
             * person it applies to and tells an attacker nothing.
             */}
            {/* Suppressed when the API's own sentence is on screen: the hint answers the
                credentials message, and a 400 from a provider carries that same key while
                saying something else entirely. */}
            {!signInErrorText && signInErrorKey === 'auth_invalid_credentials' && (
                <>
                    {' '}
                    <span className="text-text-body">{t('auth_maybe_used_provider')}</span>
                </>
            )}
        </p>
    )
}
