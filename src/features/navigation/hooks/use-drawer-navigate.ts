'use client'

import { useRequireAuth } from '@features/auth'
import { useRouter } from 'next/navigation'
import { type MouseEvent, useCallback } from 'react'
import { useMenu } from '../providers/menu-state'

/**
 * Turning a drawer row's plain click into a client-side navigation, without taking anything
 * else a link does away from the browser.
 *
 * A row with an `href` renders as a real `<a>` (see `LeftBarRow`), so middle-click,
 * cmd-click, "copy link address" and being *announced* as a link all keep working. What
 * these handlers intercept is only the plain primary click, because letting that be a full
 * document load would re-run the entire shell — providers, auth bootstrap and all — to move
 * between two screens of the same app.
 *
 * **Modified clicks are left alone deliberately.** Swallowing cmd-click is the single thing
 * that makes an in-app menu feel like a walled garden, and it is invisible in review because
 * the plain click still works.
 *
 * This lives in a hook because two screens need it: the drawer's root list and its
 * Privacy-and-security sub-screen. It was the drawer's private closure until the second
 * caller appeared, and copying it would have meant two places to keep the modifier list and
 * the close-then-push order in step.
 */

/**
 * A click the app may take over: primary button, no modifier held.
 *
 * `event.button !== 0` is not redundant with the modifier checks — a middle click arrives
 * here as a `click` event in some browsers, and it is the one that opens a tab.
 */
function isPlainClick(event: MouseEvent<HTMLElement>): boolean {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
    return event.button === 0
}

export function useDrawerNavigate() {
    const { close } = useMenu()
    const router = useRouter()
    const requireAuth = useRequireAuth()

    /** Close the drawer, then go. The order matters: see `handleSwitchAccount`. */
    const navigate = useCallback(
        (href: string) => (event: MouseEvent<HTMLElement>) => {
            if (!isPlainClick(event)) return
            event.preventDefault()
            close()
            router.push(href)
        },
        [close, router],
    )

    /**
     * The same, for a destination whose only action needs a real session — Identification,
     * Space visibility.
     *
     * Gated on the *action*, never the route: pressing it signed out raises the sign-in
     * dialog rather than navigating away, so whatever the visitor was reading stays where it
     * is (`CLAUDE.md`). The row is still a real `<a>`, so a modified click opens the URL
     * anyway and the page there handles a guest on its own — both of those pages do. What
     * this stops is the plain click that would drop someone signed out onto a screen whose
     * first move is to ask them to sign in.
     */
    const navigateGated = useCallback(
        (href: string) => (event: MouseEvent<HTMLElement>) => {
            if (!isPlainClick(event)) return
            event.preventDefault()
            close()
            requireAuth(() => router.push(href))()
        },
        [close, router, requireAuth],
    )

    return { navigate, navigateGated }
}
