'use client'

import { useQueryClient } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { miniAppKeys } from '../api/mini-app-api'
import { useMiniAppStore } from '../store/mini-app-store'

/**
 * The player's mount point — one per document, a sibling of the dialogs in
 * `app/session-providers.tsx`.
 *
 * ## Why this is a component and not a provider
 *
 * There is no context. The state is a Zustand store (`store/mini-app-store.ts` says why), so this
 * has nothing to provide: it exists purely to *render*, and it renders nothing at all until
 * somebody opens an app.
 *
 * That subscription is the whole file. It reads **one number** — how many tabs there are — so a
 * page that never opens a mini app re-renders exactly never, no matter what the player's state does
 * afterwards.
 *
 * ## Why the window is dynamically imported
 *
 * The player is the tab strip, the drag and resize gestures, the bridge, the ⋯ menu and a dialog. A
 * guest reading a space must not download any of it to be told there is nothing to open — the same
 * rule CLAUDE.md states for the socket transport ("a guest must never download 40KB to be told
 * nothing"). `ssr: false` because every part of it measures the viewport.
 *
 * ## Why it is mounted in the session tree
 *
 * The bridge reads the account, its balance, its own channel slug and the query cache — a mini app
 * is opened *for* an account, mints a token for it and spends its Star. So it belongs below
 * `AuthProvider` / `BalanceProvider` / `MyChannelProvider`, which is what `session-providers.tsx`
 * is. A `/app/*` webview mounts no session and therefore no player, which is correct: the native
 * app hosts mini apps itself, through the very bridge this feature implements.
 */
const MiniAppWindow = dynamic(
    () => import('./mini-app-window').then(module => ({ default: module.MiniAppWindow })),
    { ssr: false },
)

export function MiniAppHost() {
    const hasTabs = useMiniAppStore(state => state.tabs.length > 0)
    const queryClient = useQueryClient()

    /**
     * Drop the per-app tokens when the player closes.
     *
     * `getInfo` mints a credential **scoped to one mini app** and it is cached for 30 seconds so two
     * calls in flight together collapse into one request (`use-mini-app-bridge.ts`). That window is
     * the whole point of the cache, and once every app is closed there is nothing left that could
     * benefit from it — so what remains is a third party's credential sitting in memory for no
     * reason. Reopening the app asks for a fresh one, which is what should happen anyway.
     *
     * `removeQueries`, not `invalidateQueries`: invalidating marks it stale and **keeps the value**,
     * which is the opposite of the point here.
     *
     * The effect is here rather than in the store's `closeAll` because the store must not reach into
     * the query cache — that is the boundary CLAUDE.md draws for Zustand, and closing the last tab
     * one at a time has to behave the same as pressing Close, which watching the flag gives for
     * free.
     */
    useEffect(() => {
        if (hasTabs) return
        queryClient.removeQueries({ queryKey: miniAppKeys.all })
    }, [hasTabs, queryClient])

    if (!hasTabs) return null
    return <MiniAppWindow />
}
