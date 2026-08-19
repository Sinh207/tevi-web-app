'use client'

import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import Script from 'next/script'
import { useCallback, useState } from 'react'
import { useAuth } from '../providers/auth-provider'
import {
    type AuthMode,
    PROVIDER_ROW_MAX_WIDTH,
    ProviderIcon,
    ProviderRowInner,
    providerLabelKey,
    providerShellClass,
} from './provider-button'

interface GoogleCredentialResponse {
    credential: string
    clientId?: string
}

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (cfg: {
                        client_id: string
                        callback: (r: GoogleCredentialResponse) => void
                        ux_mode?: string
                    }) => void
                    renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
                }
            }
        }
    }
}

/**
 * Google, wearing the same chip as every other provider, with Google's own button laid
 * invisibly on top of it.
 *
 * This is legacy's approach (`tevi-web-app/src/components/auth/btnGoogle`): the SDK's
 * button is rendered into an absolutely-positioned layer at `opacity: 0.001`, so it still
 * receives the click, the keyboard and the accessibility tree while what you *see* is a
 * chip identical to Apple, Telegram and the rest. Google's own markup cannot be restyled,
 * so rendering it plainly leaves one control that looks nothing like its neighbours.
 *
 * ⚠ Worth knowing: Google's branding terms expect their button to be shown as issued.
 * This matches the shipped legacy app rather than those terms.
 *
 * Two details that are load-bearing rather than cosmetic:
 * - `opacity: 0.001`, not `0` or `visibility: hidden` — anything that removes the element
 *   from the rendering also removes it from hit-testing, and then nothing is clickable.
 * - the visible layer is a `<div>`, not a `<button>`. The real control is Google's, and
 *   nesting one interactive element inside another breaks keyboard order (legacy does
 *   exactly that by putting the iframe inside a MUI `Button`).
 */
export function GoogleSignInButton({
    mode = 'sign-in',
    disabled,
}: {
    mode?: AuthMode
    /** Some other method is in flight. Google's own attempt is `pending` below. */
    disabled?: boolean
}) {
    const { signInWithProvider, isSigningIn, loginMethod } = useAuth()
    const { t, currentLanguage } = useTranslation()
    const [gsiReady, setGsiReady] = useState(false)
    /**
     * Google's control owns the click, so there is no local handler to hang this on — the
     * row said nothing between the credential coming back and the session existing.
     * `runSignIn` sets both of these for exactly that window.
     */
    const pending = isSigningIn && loginMethod === 'google'

    const onCredential = useCallback(
        async (res: GoogleCredentialResponse) => {
            try {
                await signInWithProvider('google', {
                    // `credential` is the GSI ID token; `clientId` is this app's OAuth
                    // client id rather than a token. Exact parity with legacy
                    // (`providers/authentication/index.js` → connectWithGoogle), which
                    // the backend accepts today — see B3 in docs before changing it.
                    access_token: res.credential,
                    id_token: res.clientId,
                })
            } catch {
                // The provider already recorded why, in a form this locale can render.
            }
        },
        [signInWithProvider],
    )

    /**
     * A callback ref rather than an effect over a `useRef`: the button has to be
     * re-rendered both when the script becomes ready and when the container remounts —
     * and it remounts every time a Turnstile challenge takes the form's place and gives
     * it back. An effect keyed on `gsiReady` only ever fires for the first of those, so
     * after one challenge the Google button was gone until a full reload.
     */
    const mount = useCallback(
        (node: HTMLDivElement | null) => {
            const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
            if (!node || !gsiReady || !clientId || !window.google) return
            window.google.accounts.id.initialize({
                client_id: clientId,
                callback: onCredential,
                ux_mode: 'popup',
            })
            window.google.accounts.id.renderButton(node, {
                // Shaped like the shell it hides behind. Google is always a labelled row —
                // it is one of the primaries and its name is the point.
                type: 'standard',
                shape: 'rectangular',
                width: PROVIDER_ROW_MAX_WIDTH,
                theme: 'outline',
                size: 'large',
                // The SDK's own wording, kept in step with the label painted underneath
                // it. The visible chip and Google's invisible control are one button as
                // far as anyone is concerned — but a screen reader reads *Google's*, so
                // leaving this at its default had it announce "Sign in with Google" on
                // the page headed "Sign up".
                text: mode === 'sign-up' ? 'signup_with' : 'signin_with',
                // The button's language is a `renderButton` option. Neither `?hl=` on the
                // script (that is the One Tap prompt) nor anything on `initialize` moves
                // it — without this Google falls back to geolocating by IP, so an English
                // page in Vietnam rendered one Vietnamese button among six English ones.
                // It still matters while the button is invisible: it is what a screen
                // reader announces.
                locale: currentLanguage,
            })
        },
        [currentLanguage, gsiReady, mode, onCredential],
    )

    if (!env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null

    return (
        <>
            {/* `onReady`, not `onLoad`: this unmounts whenever a challenge takes its
                place, and `onLoad` only fires on the mount that actually inserts the tag —
                so the second mount never learned the script was there. The `id` is what
                lets next/script dedupe across those mounts. */}
            <Script
                id="google-gsi"
                src="https://accounts.google.com/gsi/client"
                strategy="afterInteractive"
                onReady={() => setGsiReady(true)}
            />
            <div
                className={cn(
                    providerShellClass('row'),
                    'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--input-border-focus)',
                    // Google's control is an iframe, so this row cannot carry `disabled`
                    // like its neighbours — without this it stayed fully lit while every
                    // other method dimmed, reading as the only one still available. The
                    // row running the sign-in stays lit; it has the spinner.
                    disabled &&
                        !pending &&
                        'pointer-events-none bg-(--button-secondary-bg-disabled) text-(--button-secondary-text-disabled)',
                )}
            >
                <ProviderRowInner
                    mark={<ProviderIcon name="google" />}
                    label={t(providerLabelKey(mode), { provider: t('auth_provider_google') })}
                    pending={pending}
                />
                <div
                    ref={mount}
                    // `[&_iframe]` overrides the size and centring margin the SDK writes
                    // inline, so its control fills the circle. `overflow-hidden` matters:
                    // Google's iframe resolves percentages against its own wrapper, not
                    // this box, and has been seen to balloon well past it — unclipped that
                    // would swallow clicks meant for the providers either side.
                    className="absolute inset-0 overflow-hidden rounded-lg opacity-[0.001] [&_iframe]:!m-0 [&_iframe]:!size-full"
                />
            </div>
        </>
    )
}
