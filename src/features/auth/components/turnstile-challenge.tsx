'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { setTurnstileTokens } from '@shared/lib/api/request-context'
import { eventBus } from '@shared/lib/event-bus'
import Script from 'next/script'
import { useTheme } from 'next-themes'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The Cloudflare Turnstile challenge, shown in place of the sign-in form after a 406.
 *
 * The flow, end to end: a sign-in returns 406 → `AuthProvider` fetches
 * `/auth/v1/turnstile/`, pins `challenge_id` to the `X-Turnstile-Challenge` header and
 * parks the attempt → this renders the widget for the returned site key → the widget's
 * callback hands back a token, which goes on `X-Turnstile-Token` → `auth:turnstile-passed`
 * tells the provider to replay the parked call, this time with both headers attached.
 *
 * Same contract as the legacy app (`tevi-web-app`:
 * `components/auth/turnstile/{index,hook}.js`), minus its two habits: it rendered into a
 * hardcoded `#captcha-container` (so a second instance silently stole the first one's
 * widget) and hung `onloadTurnstileCallback` off `window` to know when the script was
 * ready. Here the container is a ref and `next/script`'s `onReady` is the signal, so two
 * of these on a page — a login route and a login dialog — cannot collide.
 *
 * ⚠ **Explicit rendering only.** The script is loaded with `render=explicit`; without it
 * Turnstile also auto-scans the document for `.cf-turnstile` elements and would draw a
 * second widget over this one.
 */

const SCRIPT_ID = 'cf-turnstile'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
    render: (
        el: HTMLElement,
        opts: {
            sitekey: string
            callback: (token: string) => void
            'error-callback'?: (code: string) => void
            'expired-callback'?: () => void
            theme?: 'light' | 'dark' | 'auto'
        },
    ) => string | undefined
    remove: (widgetId: string) => void
}

declare global {
    interface Window {
        turnstile?: TurnstileApi
    }
}

export function TurnstileChallenge({ siteKey }: { siteKey: string }) {
    const { t } = useTranslation()
    const { resolvedTheme } = useTheme()
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const [scriptReady, setScriptReady] = useState(false)
    const [failed, setFailed] = useState(false)

    // `next/script` fires `onReady` on every mount, including when the script was already
    // loaded by an earlier one — which is exactly the case this needs to cover.
    const onReady = useCallback(() => setScriptReady(true), [])

    useEffect(() => {
        const container = containerRef.current
        if (!scriptReady || !container || !window.turnstile) return

        setFailed(false)
        const id = window.turnstile.render(container, {
            sitekey: siteKey,
            // The token is single-use and short-lived, so it is handed straight to the
            // request context rather than held in state — the very next thing that
            // happens is the replay that spends it.
            callback: token => {
                setTurnstileTokens({ token })
                eventBus.emit('auth:turnstile-passed')
            },
            'error-callback': () => setFailed(true),
            'expired-callback': () => setFailed(true),
            // The widget paints its own chrome, so it has to be told which mode it is in
            // or it draws a light card on a dark page.
            theme: resolvedTheme === 'dark' ? 'dark' : 'light',
        })
        widgetIdRef.current = id ?? null

        return () => {
            // Leaving the iframe behind on unmount leaks it and, on a re-render with a
            // new theme, stacks a second widget under the first.
            if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current)
            widgetIdRef.current = null
        }
    }, [scriptReady, siteKey, resolvedTheme])

    return (
        <div className="flex flex-col items-center gap-4 text-center">
            <Script id={SCRIPT_ID} src={SCRIPT_SRC} strategy="afterInteractive" onReady={onReady} />

            <h2 className="type-body-strong text-(--text-title)">{t('auth_turnstile_title')}</h2>

            {/* Reserves the widget's own 65px so the form below does not jump when the
                iframe arrives. */}
            <div ref={containerRef} className="flex min-h-[65px] items-center justify-center">
                {!scriptReady && (
                    <span className="type-caption-meta text-(--text-subtitle)">
                        {t('common_loading')}
                    </span>
                )}
            </div>

            {failed && (
                <p role="alert" className="type-caption-meta text-(--text-error)">
                    {t('auth_turnstile_failed')}
                </p>
            )}

            <p className="type-caption-meta max-w-[320px] text-(--text-subtitle)">
                {t('auth_turnstile_hint')}
            </p>
        </div>
    )
}
