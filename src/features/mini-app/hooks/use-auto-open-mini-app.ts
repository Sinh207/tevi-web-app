'use client'

import { useAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { useEffect, useRef } from 'react'
import { type MiniAppChannelLike, miniAppDedupKey, miniAppFromChannel } from '../lib/app-config'
import { frameVersionFor } from '../lib/app-version'
import { autoOpenDecision } from '../lib/auto-open'
import { useMiniAppStore } from '../store/mini-app-store'

/**
 * **Entering a space whose whole point is its mini app opens the app.**
 *
 * Ported from legacy, where the same effect lives in the channel viewer's content — a space with
 * `has_mini_app` is a game or a service, not a profile to browse, so making the reader find a
 * button to reach the thing they navigated to is a step for nothing.
 *
 * ```tsx
 * useAutoOpenMiniApp(channel)   // in ChannelViewerActions, beside the Open button
 * ```
 *
 * ## Where it is called from is the whole gate
 *
 * It has **no visibility conditions of its own**, and that is deliberate. It is called by
 * `ChannelViewerActions`, which `channel-view.tsx` renders only when the space's actions are
 * offered at all — so a suspended space, a blocked account, a protected space the reader has not
 * been let into, a sensitive space they have not agreed to see, and the beat before ownership
 * resolves all withhold it for free, because they withhold the row. Re-deriving those five
 * conditions here would be a second copy of a rule that is already hard to get right, and the two
 * would drift.
 *
 * The same placement decides the **owner** case: the owner of a space gets `ChannelOwnerActions`
 * instead, so their own mini app does not open by itself and they have no Open button either. That
 * is consistent rather than complete — if creators should get their own app on entry, the change is
 * an `OpenMiniAppButton` in the owner row *and* this hook beside it, which is a product decision
 * and not one to make by leaving a side effect somewhere broader.
 *
 * ## Not `useMiniApp().open`
 *
 * That one composes `useRequireAuth`, which is right for a press and wrong here: a guest would be
 * shown a sign-in dialog for navigating to a page. `autoOpenDecision` skips a guest instead, and the
 * Open button is still on screen to ask them properly. The store is called directly for that one
 * reason.
 */
export function useAutoOpenMiniApp(channel: MiniAppChannelLike | null | undefined) {
    const { t } = useTranslation()
    const { isAuthenticated } = useAuth()
    const open = useMiniAppStore(state => state.open)

    const config = miniAppFromChannel(channel, t('miniapp_fallback_name'))
    const key = miniAppDedupKey(config?.url)

    /**
     * Which app this surface has already opened by itself — **not** a "have I opened one" boolean.
     * `lib/auto-open.ts` has the full reasoning; the short version is that a boolean loses the
     * second mini-app space a reader walks into, which is the bug legacy ships.
     */
    const openedFor = useRef<string | null>(null)

    /**
     * The config, re-pointed each render.
     *
     * It is derived from props, so a fresh object every time — as a dependency it would re-run the
     * effect on every render of the space header. `key` is its *identity* and is what the effect
     * actually watches; the ref is how the effect reaches the value that identity stands for, which
     * keeps the dependency list complete rather than suppressed.
     */
    const latest = useRef(config)
    latest.current = config

    useEffect(() => {
        const target = latest.current
        if (!target || !key) return
        if (
            autoOpenDecision({ key, isAuthenticated, alreadyOpenedFor: openedFor.current }) ===
            'skip'
        ) {
            return
        }
        openedFor.current = key
        open(target, frameVersionFor(target.id, Date.now()))
    }, [key, isAuthenticated, open])
}
