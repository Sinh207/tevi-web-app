'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Loader } from '@shared/ui/loader'
import type { SnsWebSdk } from '@sumsub/websdk'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

/**
 * The Sumsub WebSDK, mounted into the page.
 *
 * It is an iframe served from `in.sumsub.com` that the SDK creates itself, with
 * `allow="camera; microphone; …"` already on it — which is why the flow can take a selfie
 * from our origin at all, and why `frame-src` in `shared/config/csp.ts` has to name that
 * host. Nothing here draws any of the verification UI: Sumsub owns everything inside the
 * frame, including its own error and status screens.
 *
 * ## Why the SDK is imported inside the effect
 *
 * `@sumsub/websdk` is ~12KB of ESM that only matters to the people who press "Continue",
 * and it touches `window` on import. A static import would put it in the bundle of a page
 * most visitors never start the flow on, and in the server bundle of a page that is
 * otherwise renderable. `import()` inside the effect means it is fetched when the flow
 * actually starts — the same reason Firebase is lazy in `features/auth`. The weight that
 * matters is not the wrapper anyway: it is Sumsub's own app, and that lives in the iframe.
 *
 * ## One launch per token
 *
 * The effect depends on `accessToken` only. Language and theme changes go through the
 * SDK's own `setLanguage` / `setTheme`, because re-running the effect would tear down a
 * half-finished verification — someone who has photographed one side of their ID and then
 * flips the app to dark mode would start again from the first step.
 *
 * The callbacks live in a ref for the same reason: they are re-created every render by the
 * parent, and depending on them would relaunch the flow on any unrelated state change.
 */
export function SumsubCheckout({
    accessToken,
    onExpired,
    onApproved,
    onPending,
    onLaunchFailed,
}: {
    /** From `useSumsubSession().start()`. A new token relaunches the flow. */
    accessToken: string
    /** Must resolve to a *fresh* token — the SDK re-initialises with whatever it gets. */
    onExpired: () => Promise<string>
    /** Sumsub answered GREEN: the applicant passed. */
    onApproved: () => void
    /** Sumsub answered YELLOW: submitted, awaiting a human. */
    onPending: () => void
    /**
     * The SDK never got as far as rendering — its chunk failed to load. Errors *inside*
     * the flow are not reported here: Sumsub draws its own error and retry UI in the
     * frame, and pulling the person out of it would hide both.
     */
    onLaunchFailed: () => void
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const { resolvedTheme } = useTheme()
    const { t, currentLanguage } = useTranslation()
    /** Sumsub has painted its first screen (`idCheck.onReady`). */
    const [ready, setReady] = useState(false)

    const handlers = useRef({ onExpired, onApproved, onPending, onLaunchFailed })
    handlers.current = { onExpired, onApproved, onPending, onLaunchFailed }

    /**
     * The live instance, so the language and theme effects below can talk to it. A ref
     * rather than state: nothing renders from it, and setting state here would be a second
     * render per launch for no visible difference.
     */
    const sdkRef = useRef<SnsWebSdk | null>(null)

    /*
     * The values the SDK is *built* with, read once at launch. They are refs so that
     * changing either does not re-run the launch effect — see the note above — while the
     * launch still starts in the right language and theme.
     */
    const initial = useRef({ lang: currentLanguage, theme: resolvedTheme })
    initial.current = { lang: currentLanguage, theme: resolvedTheme }

    useEffect(() => {
        const container = containerRef.current
        if (!accessToken || !container) return

        let cancelled = false
        // A relaunch (a new token) is a new frame, so the loader comes back with it.
        setReady(false)

        import('@sumsub/websdk')
            .then(({ default: snsWebSdk }) => {
                // The effect was cleaned up while the chunk was in flight — React's
                // StrictMode does exactly this on every mount in development. Building the
                // SDK now would leave an orphaned iframe nothing can destroy.
                if (cancelled) return

                const sdk = snsWebSdk
                    .init(accessToken, () => handlers.current.onExpired())
                    .withConf({
                        // Passed through as-is, as legacy does: Sumsub falls back to
                        // English on a code it does not publish a translation for, which is
                        // a better failure than us mapping `fil` onto the wrong language.
                        lang: initial.current.lang,
                        // The app's *resolved* theme, so "System" follows the OS. Sumsub
                        // knows `light` and `dark`; legacy pinned `light` and the frame was
                        // a white rectangle in the middle of a dark app.
                        theme: initial.current.theme === 'dark' ? 'dark' : 'light',
                    })
                    // Legacy also passes `country: countryCode`, which pre-selects the
                    // document country from its general-config endpoint. That config does not
                    // exist in this app yet, so the field is omitted rather than guessed —
                    // Sumsub then asks, which is one extra step and never a wrong answer.
                    //
                    // `addViewportTag: false` — the SDK would otherwise write its own
                    // `<meta name="viewport">` over the app's. `adaptIframeHeight` lets the
                    // frame grow with its content instead of scrolling inside itself.
                    .withOptions({ addViewportTag: false, adaptIframeHeight: true })
                    // The frame has painted. Everything before this is our blank box plus the
                    // SDK chunk and Sumsub's own app loading inside it — a second or two on a
                    // phone, which is why the box is not left empty (see the render below).
                    .on('idCheck.onReady', () => setReady(true))
                    .on('idCheck.onApplicantStatusChanged', payload => {
                        // GREEN passed, YELLOW is submitted and awaiting a human, RED is a
                        // rejection Sumsub explains inside its own frame — so RED is not
                        // handled here on purpose: taking the person out of the flow would
                        // hide the reason and the retry.
                        switch (payload?.reviewResult?.reviewAnswer) {
                            case 'GREEN':
                                handlers.current.onApproved()
                                break
                            case 'YELLOW':
                                handlers.current.onPending()
                                break
                            default:
                                break
                        }
                    })
                    .build()

                sdkRef.current = sdk
                sdk.launch(container)
            })
            .catch(() => {
                if (!cancelled) handlers.current.onLaunchFailed()
            })

        return () => {
            cancelled = true
            // Removes the iframe and its message listener. Without it, navigating away
            // mid-verification leaves a `postMessage` listener bound to a dead React tree.
            sdkRef.current?.destroy()
            sdkRef.current = null
        }
    }, [accessToken])

    // Live updates rather than relaunches. Both are no-ops before the SDK has built.
    useEffect(() => {
        sdkRef.current?.setLanguage(currentLanguage)
    }, [currentLanguage])

    useEffect(() => {
        sdkRef.current?.setTheme(resolvedTheme === 'dark' ? 'dark' : 'light')
    }, [resolvedTheme])

    /*
     * A floor, not a fixed height: `adaptIframeHeight` resizes the frame to its content, and
     * the floor is what keeps the page from collapsing to nothing between mount and the first
     * message from the frame.
     *
     * That gap used to be a **blank 560px box** — the wait covers a dynamic import, Sumsub's
     * own app booting inside the iframe, and on a phone that is a second or two of nothing
     * after a press. So the DS loader sits in the middle of the box until `idCheck.onReady`,
     * and the frame fades in over it. The loader is not unmounted on ready: it is behind the
     * frame by then, and keeping it mounted means no layout change at the moment the iframe
     * appears.
     */
    return (
        <div className="relative min-h-[560px] w-full">
            <div className="absolute inset-0 flex items-center justify-center">
                <Loader label={t('common_loading')} />
            </div>
            <div
                ref={containerRef}
                data-slot="sumsub-container"
                className={cn(
                    'relative w-full overflow-hidden rounded-xl [&_iframe]:w-full',
                    // 240ms, the app's own screen-change duration — the frame arriving is a
                    // screen change, it just happens to be someone else's screen.
                    'transition-opacity duration-[240ms] ease-out motion-reduce:transition-none',
                    ready ? 'opacity-100' : 'opacity-0',
                )}
            />
        </div>
    )
}
