'use client'

import { useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useCallback, useMemo } from 'react'
import { type MiniAppConfigInput, normalizeMiniAppConfig } from '../lib/app-config'
import { frameVersionFor } from '../lib/app-version'
import { miniAppCenterConfig } from '../lib/center'
import { useMiniAppStore } from '../store/mini-app-store'

/**
 * **The feature's front door.** Everything outside `features/mini-app` opens an app through this.
 *
 * ```tsx
 * const { open } = useMiniApp()
 * <Button onClick={() => open({ url: channel.mini_app_url, id: channel.mini_app_id, … })}>Open</Button>
 * ```
 *
 * ## What it takes care of, so no call site has to
 *
 * 1. **Sign-in.** A mini app is opened for an account: it is handed a token minted for that
 *    account, and its purchases spend that account's Star. So `open` composes `useRequireAuth` —
 *    pressing it while signed out raises the sign-in dialog and opens nothing, and whatever the
 *    reader was looking at stays on screen. Gate the **action**, never the route
 *    (`docs/DEFINITION_OF_DONE.md` §3).
 * 2. **Vetting the URL.** It takes the *loose* shape each surface happens to hold and runs it
 *    through `normalizeMiniAppConfig`, so an unvetted `javascript:` URL cannot reach an `iframe`
 *    `src` even if a caller passes one straight from an API response. That is why this accepts an
 *    input rather than a `MiniAppConfig`: making the vetted type constructible only in here means
 *    a call site cannot skip the vetting by assembling one itself.
 * 3. **The name.** Every entry point would otherwise need its own "Mini app" fallback string, in
 *    nine locales.
 * 4. **The cache-bust version**, read from device storage for this app id (`lib/app-version.ts`).
 *
 * `open` returns nothing on purpose. A caller cannot act on "it did not open": either the reader
 * is being asked to sign in, or the space's URL is unusable — and in the second case the button
 * should not have been rendered. Ask `Boolean(miniAppFromChannel(channel, …))` to decide *whether*
 * to render a control; this hook is for the press.
 */
export function useMiniApp() {
    const { t } = useTranslation()
    const requireAuth = useRequireAuth()
    const openInStore = useMiniAppStore(state => state.open)
    const closeAll = useMiniAppStore(state => state.closeAll)
    /**
     * Subscribed as a **count**, not as the array. A space's Open button re-rendering every time
     * a frame finishes loading is what a context would have cost here; a number changes when a tab
     * opens or closes and not otherwise.
     */
    const tabCount = useMiniAppStore(state => state.tabs.length)

    const open = useMemo(
        () =>
            requireAuth((input: MiniAppConfigInput) => {
                const config = normalizeMiniAppConfig(input, t('miniapp_fallback_name'))
                if (!config) return
                openInStore(config, frameVersionFor(config.id, Date.now()))
            }),
        [requireAuth, openInStore, t],
    )

    /**
     * The Mini App Center — the directory, which is itself a mini app.
     *
     * Behind the same sign-in gate as any other app: it lists apps *for an account*, and its own
     * bridge calls `getInfo` on load.
     */
    const openCenter = useMemo(
        () =>
            requireAuth(() => {
                const config = miniAppCenterConfig(t('miniapp_center'))
                openInStore(config, frameVersionFor(config.id, Date.now()))
            }),
        [requireAuth, openInStore, t],
    )

    const close = useCallback(() => closeAll(), [closeAll])

    return {
        open,
        openCenter,
        close,
        /** Something is open — whether or not the window is currently minimised. */
        isOpen: tabCount > 0,
        tabCount,
    }
}

/**
 * **Is a mini app currently covering the screen?**
 *
 * Exported for the app shell, and it exists to settle a z-index conflict that has no other honest
 * answer. The mobile tab bar is `fixed bottom-0 z-50`; the player is `z-40` so that every dialog it
 * can raise — sign-in, the Star purchase sheet, its own top-up confirmation, all `z-50` — draws
 * *above* it. Both constraints are right and they cannot both be satisfied by a number: above the
 * bar means over 50, below the dialogs means under 50.
 *
 * So the bar yields. A full-screen mini app is a whole application, and the host's own navigation
 * over the top of it is exactly what the native hosts do not do either — there is nothing to
 * navigate to without leaving the app, and the player's own close control is how you leave it.
 *
 * ## Why the viewport is not part of the answer
 *
 * It looks like it should be — "is the player *full-screen*" — but the tab bar is `md:hidden`, so
 * the only widths where it exists are the widths where the player is always full-screen
 * (`COMPACT_VIEWPORT_WIDTH` is the same `md`). Reading a viewport here would add a measurement that
 * cannot change the outcome, and one more thing for the two breakpoints to disagree about.
 *
 * A minimised player does not cover anything, so the bar comes back with the pill.
 */
export function useMiniAppCoversScreen(): boolean {
    return useMiniAppStore(state => state.tabs.length > 0 && !state.isMinimized)
}
