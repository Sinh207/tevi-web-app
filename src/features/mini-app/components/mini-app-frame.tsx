'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { memo, useEffect, useState } from 'react'
import { useMiniAppBridge } from '../hooks/use-mini-app-bridge'
import { MINI_APP_FRAME_ALLOW, miniAppFrameSandbox } from '../lib/frame-url'
import type { MiniAppTab } from '../lib/tabs'
import { MiniAppSplash } from './mini-app-splash'
import { TopupConfirmDialog } from './topup-confirm-dialog'

/**
 * One tab's frame: the `iframe`, its spinner, and the one dialog a mini app can raise.
 *
 * ## Every tab's frame stays mounted
 *
 * Inactive tabs are hidden with `display: none`, not unmounted. A mini app is a running
 * application — a game mid-round, a socket, a video — and unmounting the frame to switch tabs and
 * remounting it to switch back would reload it from scratch each time. `display: none` keeps the
 * document alive; the browser throttles its timers and stops painting it, which is exactly right.
 *
 * That is also why the bridge is per frame and not per window: each mounted frame has its own
 * listener, its own pending top-up and its own envelope memory, and a message is matched to the
 * frame that sent it by `contentWindow` identity (see `use-mini-app-bridge.ts`).
 *
 * ## `memo`, and what it is actually for
 *
 * Not micro-optimisation. `patchTab` replaces **one** tab object, but the `tabs` array is new — so
 * the window re-renders, and without this every frame's component re-renders with it: five
 * third-party applications' worth of subtree, every time any one of them flips a loading flag or
 * asks for a back button. The `iframe` element itself would survive (same `key`, same `src`), but
 * the work around it is real and repeated. With `memo`, a patch re-renders the frame it belongs to.
 *
 * ## `key` belongs to the caller
 *
 * The tab strip renders this with `key={`${tab.id}:${tab.reloadKey}`}`, so a reload discards the
 * element and everything hanging off it — the frame, the bridge, a half-finished top-up. That is
 * the only sound way to reload a cross-origin frame, and it is stated on `MiniAppTab.reloadKey`.
 */
export const MiniAppFrame = memo(function MiniAppFrame({
    tab,
    isActive,
}: {
    tab: MiniAppTab
    isActive: boolean
}) {
    const { t } = useTranslation()
    const bridge = useMiniAppBridge({ tab })

    /**
     * The splash outlives `isLoading` by the length of its fade.
     *
     * A component cannot unmount itself and animate on the way out, so the frame holds it: the
     * moment the app paints, `leaving` flips and this keeps the element in the tree for the 200ms
     * the fade takes. Under `prefers-reduced-motion` there is no fade, so it goes immediately.
     *
     * A timer rather than `onTransitionEnd`, which never fires when there is no transition to end —
     * and reduced motion is exactly that case, so the overlay would sit over the app forever.
     */
    const [splashMounted, setSplashMounted] = useState(true)
    useEffect(() => {
        if (tab.isLoading) {
            setSplashMounted(true)
            return
        }
        if (prefersReducedMotion()) {
            setSplashMounted(false)
            return
        }
        const timer = setTimeout(() => setSplashMounted(false), SPLASH_FADE_MS)
        return () => clearTimeout(timer)
    }, [tab.isLoading])

    const hostOrigin = typeof window === 'undefined' ? null : window.location.origin

    return (
        <div
            className={cn(
                'relative h-full w-full flex-col bg-(--background-listing)',
                isActive ? 'flex' : 'hidden',
            )}
            /*
             * `inert` on the hidden ones, belt to `display: none`'s braces. A `display: none`
             * subtree is already out of the tab order, but the account drawer taught this app that
             * an unscoped `getByRole` still finds parked UI (`e2e/README.md`), and a mini app is a
             * whole application's worth of controls to find.
             */
            inert={!isActive}
            aria-hidden={!isActive}
        >
            {bridge.frameUrl ? (
                <iframe
                    ref={bridge.iframeRef}
                    src={bridge.frameUrl}
                    title={tab.config.name}
                    onLoad={bridge.onFrameLoad}
                    /*
                     * The two attributes that decide what the frame may do. Both are computed —
                     * `sandbox` drops `allow-same-origin` for an app served from this origin, and
                     * `allow` delegates one permission and not camera or microphone. `frame-url.ts`
                     * has the full reasoning for each token; it is not a list to extend casually.
                     */
                    sandbox={miniAppFrameSandbox(bridge.frameUrl, hostOrigin)}
                    allow={MINI_APP_FRAME_ALLOW}
                    /*
                     * **`origin`, not `no-referrer`** — the origin without the path.
                     *
                     * The concern is the path: a full `Referer` hands a third party the exact Tevi
                     * page the reader was on, including a private space they can only see because
                     * they were followed into it. `origin` withholds that.
                     *
                     * `no-referrer` was the first choice and is the wrong one, because mini apps
                     * legitimately read the referrer to identify their host — legacy's own SDK does
                     * (`parentOrigin = new URL(document.referrer).origin`), and an app that checks
                     * it for security would refuse to run against a host that sends nothing. Legacy
                     * sends the default policy, so this narrows what leaks without changing what an
                     * app can establish.
                     */
                    referrerPolicy="origin"
                    className="h-full w-full border-0 bg-(--background-listing)"
                />
            ) : bridge.isPreparing ? (
                /*
                 * Waiting on the account before the URL can be built — see `frameUrl` in the bridge.
                 * Nothing is wrong here, so this must not be the error state: it is the same splash
                 * the frame shows for its own first paint, and from the reader's side the two are
                 * one continuous wait.
                 */
                <MiniAppSplash config={tab.config} />
            ) : (
                /*
                 * The URL could not be framed. It is not reachable through `useMiniApp().open`,
                 * which vets first — only a config assembled by hand gets here — but the frame
                 * must say something rather than render an empty black rectangle.
                 */
                <p className="type-body-default m-auto p-6 text-center text-(--text-body)">
                    {t('miniapp_unavailable')}
                </p>
            )}

            {splashMounted && bridge.frameUrl && (
                <MiniAppSplash config={tab.config} leaving={!tab.isLoading} />
            )}

            {/*
             * Rendered inside the frame's own container so it is scoped to *this* tab: with three
             * apps open, only the one that asked gets a confirmation, and switching tabs hides it
             * along with the frame that raised it rather than leaving it over somebody else's app.
             */}
            <TopupConfirmDialog
                amount={bridge.pendingTopup?.amount ?? null}
                pending={bridge.isDepositing}
                onConfirm={bridge.confirmTopup}
                onCancel={bridge.cancelTopup}
            />
        </div>
    )
})

/** Kept in step with the splash's own `duration-200`. */
const SPLASH_FADE_MS = 200

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
