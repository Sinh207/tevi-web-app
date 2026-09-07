'use client'

import { env } from '@shared/config/env'
import { useTranslation } from '@shared/i18n/use-translation'
import { useCallback, useEffect, useState } from 'react'
import { loadScript } from '../lib/load-script'
import {
    beginOAuthRedirect,
    clearOAuthParamsFromUrl,
    readOAuthCallback,
} from '../lib/oauth-redirect'
import { useAuth } from '../providers/auth-provider'
import type { SocialProvider } from '../store/auth-store'
import { GoogleSignInButton } from './google-sign-in-button'
import {
    type AuthMode,
    EmailProviderButton,
    ProviderButton,
    type ProviderVariant,
    providerLabelKey,
    QrProviderButton,
} from './provider-button'

/** Where every provider sends the browser back to. Inlined at build time. */
const REDIRECT_URI = env.NEXT_PUBLIC_AUTH_REDIRECT_URL

/**
 * Every way in, in one ordered list.
 *
 * One file rather than the legacy app's seven near-identical components: everything they
 * shared is `ProviderButton`, and what genuinely differs is a handful of lines of SDK
 * glue per provider. Google keeps its own file — it has to wear the same row while
 * Google's SDK keeps the actual control — but it is *placed* from here, along with email,
 * because the order is a single decision and it cannot be one if the list is assembled in
 * three different components.
 *
 * A provider whose client id is not configured **does not render**. A sign-in button that
 * cannot sign anyone in is worse than an absent one, and it is how a missing deploy
 * variable would otherwise reach production looking fine.
 */

// ── Popup SDKs ─────────────────────────────────────────────────────────────

const APPLE_SDK =
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js'
const FACEBOOK_SDK = 'https://connect.facebook.net/en_US/sdk.js'
const TELEGRAM_SDK = 'https://telegram.org/js/telegram-widget.js'

declare global {
    interface Window {
        AppleID?: {
            auth: {
                init: (cfg: Record<string, unknown>) => void
                signIn: () => Promise<{
                    authorization: { code: string; id_token: string }
                }>
            }
        }
        FB?: {
            init: (cfg: Record<string, unknown>) => void
            login: (
                cb: (r: { authResponse?: { accessToken: string; signedRequest: string } }) => void,
                opts: { scope: string },
            ) => void
        }
        Telegram?: {
            Login?: {
                auth: (
                    cfg: { bot_id: string; request_access: boolean },
                    cb: (user: Record<string, unknown> | null) => void,
                ) => void
            }
        }
    }
}

/** Every provider's handler ends the same way; only the credential differs. */
function useConnect() {
    const { signInWithProvider } = useAuth()
    return useCallback(
        async (provider: SocialProvider, payload: Record<string, unknown>) => {
            try {
                await signInWithProvider(provider, payload)
            } catch {
                // `signInErrorKey` is the surface — see `runSignIn`.
            }
        },
        [signInWithProvider],
    )
}

// ── OAuth redirect providers ───────────────────────────────────────────────

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize'
const LINE_AUTH_URL = 'https://access.line.me/oauth2/v2.1/authorize'

/**
 * Finish a redirect the moment the page comes back with `?code=`.
 *
 * Runs for both redirect providers on every `/login` mount; `readOAuthCallback` returns
 * null unless *this* tab started the flow, so at most one of them ever fires.
 */
function useOAuthCallbacks() {
    const connect = useConnect()

    useEffect(() => {
        if (!REDIRECT_URI) return
        const search = new URLSearchParams(window.location.search)
        for (const provider of ['tiktok', 'line'] as const) {
            const result = readOAuthCallback(provider, search, REDIRECT_URI)
            if (!result) continue
            clearOAuthParamsFromUrl()
            if (result.callback) void connect(provider, { ...result.callback })
            break
        }
    }, [connect])
}

// ── The row ────────────────────────────────────────────────────────────────

/**
 * The eight ways in, split by how many people use them.
 *
 * The order is the native app's — the one people arriving from it already know — not the
 * legacy web order (`containers/login`: QR, email, Apple, Google, Telegram, TikTok,
 * Facebook, LINE, X) and not alphabetical.
 *
 * QR is in neither group and sits **above** both, which is legacy's placement and the right
 * one: it is not a ninth identity provider competing with the eight, it is the shortcut for
 * somebody already signed in on their phone, and it is the only row here that cannot fail on
 * the wrong account. It is also the only row that is not always offered — see `onQrCode`.
 *
 * **The split is the ranking, so it lives here and nowhere else.** Eight identical labelled
 * rows rank nothing — the eye has to read all eight, and the one most people want is in the
 * first two. The primaries keep their names; the rest become tiles that say "these exist
 * too" without asking to be read.
 *
 * ⚠ The membership of each group is a **guess from the app's screen order**, not from
 * sign-in data. Demoting a provider to an unlabelled tile costs conversions among the
 * people who use it, so if a market signs in mostly with Telegram or LINE, that provider
 * belongs in `PRIMARY`. This is the line to change when the numbers arrive.
 *
 * Email can only ever be primary: its mark is one we drew (the design system has no
 * envelope), so unlabelled it would be the single button nobody recognises.
 */
const PRIMARY = ['apple', 'email', 'google', 'facebook'] as const
const SECONDARY = ['telegram', 'twitter', 'tiktok', 'line'] as const

export function AuthMethodButtons({
    mode = 'sign-in',
    onEmail,
    onQrCode,
}: {
    mode?: AuthMode
    /**
     * Omit to leave email out entirely — which is what `/signup` does, there being no
     * registration endpoint behind it.
     */
    onEmail?: () => void
    /**
     * Omit to leave QR out — `/signup` does, for a stronger reason than email's. A QR is
     * scanned by an app that is **already signed in**; there is no account for it to create,
     * so on a registration page it is a button that cannot do the thing the page is for.
     * Legacy gates it on exactly the same condition (`!isSignUp`).
     */
    onQrCode?: () => void
}) {
    const { t } = useTranslation()
    const { isSigningIn } = useAuth()
    const connect = useConnect()
    useOAuthCallbacks()

    /**
     * Which mark was pressed. `isSigningIn` alone dims all seven, which says "something
     * is happening" without saying where — and an SDK popup can take seconds to appear.
     * Set before the script even loads, because that wait is part of what needs
     * reporting; cleared when the handler settles, which covers the user closing the
     * popup without signing in (a case `isSigningIn` never sees, since the request is
     * never made).
     */
    const [pending, setPending] = useState<SocialProvider | null>(null)
    const press = useCallback(
        (key: SocialProvider, run: () => void | Promise<void>) => async () => {
            setPending(key)
            try {
                await run()
            } finally {
                setPending(null)
            }
        },
        [],
    )

    const onApple = useCallback(async () => {
        await loadScript(APPLE_SDK)
        if (!window.AppleID || !env.NEXT_PUBLIC_APPLE_CLIENT_ID || !REDIRECT_URI) return
        window.AppleID.auth.init({
            clientId: env.NEXT_PUBLIC_APPLE_CLIENT_ID,
            scope: 'email name',
            redirectURI: REDIRECT_URI,
            usePopup: true,
        })
        try {
            const res = await window.AppleID.auth.signIn()
            await connect('apple', {
                access_token: res.authorization.code,
                id_token: res.authorization.id_token,
            })
        } catch {
            // The user closed the popup. Not an error worth reporting.
        }
    }, [connect])

    const onFacebook = useCallback(async () => {
        await loadScript(FACEBOOK_SDK)
        if (!window.FB || !env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID) return
        window.FB.init({
            appId: env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID,
            cookie: true,
            xfbml: false,
            version: 'v18.0',
        })
        window.FB.login(
            res => {
                if (!res.authResponse) return
                void connect('facebook', {
                    access_token: res.authResponse.accessToken,
                    id_token: res.authResponse.signedRequest,
                })
            },
            { scope: 'public_profile,email' },
        )
    }, [connect])

    const onTelegram = useCallback(async () => {
        await loadScript(TELEGRAM_SDK)
        const botId = env.NEXT_PUBLIC_TELEGRAM_BOT_ID
        if (!window.Telegram?.Login || !botId) return
        window.Telegram.Login.auth({ bot_id: botId, request_access: true }, user => {
            if (user) void connect('telegram', user)
        })
    }, [connect])

    /**
     * Twitter goes through Firebase rather than its own SDK — X has no browser sign-in
     * JS, and the backend wants the OAuth 1.0a pair (`access_token` + `token_secret`)
     * that only the popup flow produces.
     */
    const onTwitter = useCallback(async () => {
        const { getFirebaseAuth } = await import('@shared/lib/firebase')
        const [auth, firebase] = await Promise.all([getFirebaseAuth(), import('firebase/auth')])
        const provider = new firebase.TwitterAuthProvider()
        provider.addScope('email')
        try {
            const result = await firebase.signInWithPopup(auth, provider)
            const credential = firebase.TwitterAuthProvider.credentialFromResult(result)
            if (!credential?.accessToken || !credential.secret) return
            await connect('twitter', {
                access_token: credential.accessToken,
                token_secret: credential.secret,
            })
        } catch {
            // Popup closed or blocked.
        }
    }, [connect])

    const onTiktok = useCallback(() => {
        if (!env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || !REDIRECT_URI) return
        beginOAuthRedirect({
            provider: 'tiktok',
            authorizeUrl: TIKTOK_AUTH_URL,
            redirectUri: REDIRECT_URI,
            params: {
                client_key: env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY,
                response_type: 'code',
                scope: 'user.info.basic,user.info.profile',
            },
        })
    }, [])

    const onLine = useCallback(() => {
        if (!env.NEXT_PUBLIC_LINE_CHANNEL_ID || !REDIRECT_URI) return
        beginOAuthRedirect({
            provider: 'line',
            authorizeUrl: LINE_AUTH_URL,
            redirectUri: REDIRECT_URI,
            params: {
                client_id: env.NEXT_PUBLIC_LINE_CHANNEL_ID,
                response_type: 'code',
                scope: 'profile openid email',
            },
        })
    }, [])

    const byProvider: Record<
        Exclude<SocialProvider, 'google'>,
        { label: string; onClick: () => void; configured: boolean }
    > = {
        apple: {
            label: t('auth_provider_apple'),
            onClick: onApple,
            configured: Boolean(env.NEXT_PUBLIC_APPLE_CLIENT_ID),
        },
        facebook: {
            label: t('auth_provider_facebook'),
            onClick: onFacebook,
            configured: Boolean(env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID),
        },
        tiktok: {
            label: t('auth_provider_tiktok'),
            onClick: onTiktok,
            configured: Boolean(env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY),
        },
        telegram: {
            label: t('auth_provider_telegram'),
            onClick: onTelegram,
            configured: Boolean(env.NEXT_PUBLIC_TELEGRAM_BOT_ID),
        },
        line: {
            label: t('auth_provider_line'),
            onClick: onLine,
            configured: Boolean(env.NEXT_PUBLIC_LINE_CHANNEL_ID),
        },
        // Firebase, which is always configured.
        twitter: {
            label: t('auth_provider_twitter'),
            onClick: onTwitter,
            configured: true,
        },
    }

    /**
     * Anything in flight, from either source: the SDK phase before a request exists
     * (`pending`, local) and the exchange with our own backend (`isSigningIn`, in the
     * store). Both have to disable the other methods, and only `ProviderButton` was ever
     * given both — email had no `disabled` prop at all, so it stayed pressable while an
     * Apple popup was open.
     */
    const busy = isSigningIn || pending !== null

    /** One entry of either group. `null` when it has nothing to render. */
    const button = (key: (typeof PRIMARY | typeof SECONDARY)[number], variant: ProviderVariant) => {
        if (key === 'email') {
            return onEmail ? (
                <EmailProviderButton
                    key={key}
                    testId="auth-provider"
                    providerKey={key}
                    label={t(providerLabelKey(mode), { provider: t('auth_provider_email') })}
                    onClick={onEmail}
                    disabled={busy}
                />
            ) : null
        }
        // Renders nothing of its own when the client id is missing, so it drops out of the
        // group the same way an unconfigured provider does.
        if (key === 'google') return <GoogleSignInButton key={key} mode={mode} disabled={busy} />

        const provider = byProvider[key]
        if (!provider.configured) return null
        return (
            <ProviderButton
                key={key}
                testId="auth-provider"
                providerKey={key}
                variant={variant}
                mark={key}
                label={
                    variant === 'row'
                        ? t(providerLabelKey(mode), { provider: provider.label })
                        : provider.label
                }
                onClick={press(key, provider.onClick)}
                disabled={busy}
                pending={pending === key}
            />
        )
    }

    const tiles = SECONDARY.map(key => button(key, 'tile')).filter(Boolean)

    return (
        <div className="flex w-full flex-col gap-2">
            {/*
             * `hidden sm:flex` — and this is the one control on the card that is viewport
             * conditional, so it is worth saying why. The code has to be read by a *second*
             * device; on a phone there is no second device, and pointing a phone at its own
             * screen is the one instruction that cannot be followed. A row that leads to a
             * dead end is worse than an absent one, which is the same rule that hides an
             * unconfigured provider two lines below.
             *
             * CSS rather than a media-query hook: this is the first paint of a sign-in card,
             * and a hook would render the row on the server and take it away on hydration.
             */}
            {onQrCode && (
                <QrProviderButton
                    testId="auth-provider"
                    providerKey="qr"
                    className="hidden sm:flex"
                    // Not `providerLabelKey(mode)`: this row exists only on sign-in (see
                    // `onQrCode`), so a "Sign up with" wording is unreachable, and offering
                    // it would describe something QR cannot do.
                    label={t('auth_sign_in_with', { provider: t('auth_provider_qr') })}
                    onClick={onQrCode}
                    disabled={busy}
                />
            )}
            {PRIMARY.map(key => button(key, 'row'))}
            {/* One row, however many survive. `flex-1` on each tile divides the width, so
                three configured providers give three wider tiles rather than three narrow
                ones and a gap — the layout does not encode how many there are meant to be.
                Rendered only when something is left: an empty flex row is 0px tall but
                still takes the gap above it. */}
            {tiles.length > 0 && (
                // `mt-1` on top of the stack's own gap: four extra pixels are enough to
                // read as a tier boundary without opening a hole in the middle of a list
                // that is still one list.
                <div className="mt-1 flex w-full items-center gap-2">{tiles}</div>
            )}
        </div>
    )
}
