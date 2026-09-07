'use client'

import { Splash } from '@shared/components/splash'
import { useSplashState } from '../hooks/use-splash'

/**
 * Mounts the splash cover for the length of the session bootstrap.
 *
 * Everything about *when* is in `useSplashState`; everything about *what it looks like* is in
 * `shared/components/splash.tsx`. This file is only the join, plus the one thing neither of them
 * can own: what happens when the JavaScript that would take the cover down never arrives.
 *
 * `app/session-providers.tsx` mounts it, which is also what decides whether it is mounted at all:
 * only the website carries a session stack, so it never reaches a `/app/*` webview, where the
 * native app is already showing its own splash. Legacy's covered the webviews too, which is why
 * the mobile app flashes a white Tevi screen inside a dark session.
 */
export function SplashGate() {
    const state = useSplashState()

    if (state === 'gone') return null

    return (
        <>
            {/*
             * The readiness signal QC's suite waits on: present for the whole session bootstrap,
             * gone when the app is interactive. It is the single highest-value testid in the app —
             * one `invisibility_of` in a base class removes a whole class of flake — which is why
             * it is here rather than waiting for the shell sweep. `data-splash` stays: `<noscript>`
             * and `e2e/splash.spec.ts` already query it. See docs/TEST_IDS.md §8.
             */}
            <Splash data-testid="auth-splash" leaving={state === 'leaving'} />
            {/* Without scripting the cover has nothing to remove it, so it would be the entire
                page — a fixed layer over content that is present, rendered, and unreachable. The
                rule hides it before it ever paints. `style-src` carries `'unsafe-inline'`
                (`shared/config/csp.ts`), so this needs no nonce; and it is set through
                `dangerouslySetInnerHTML` because React hoists a real `<style>` element out to
                `<head>`, which would take it out of the `<noscript>` and apply it always. */}
            <noscript
                // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant literal, no input reaches it — and it is the only way to put markup inside <noscript>, whose children a scripting browser parses as text
                dangerouslySetInnerHTML={{ __html: '<style>[data-splash]{display:none}</style>' }}
            />
        </>
    )
}
