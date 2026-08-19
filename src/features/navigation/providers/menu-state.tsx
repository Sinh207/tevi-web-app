'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * The sub-screens the account drawer pushes. Other settings, Appearance, Language, Data
 * and storage and Privacy and Security have one; the pattern generalises to the rest of
 * the rows as their content arrives.
 */
export type DrawerView =
    | 'root'
    | 'other-settings'
    | 'appearance'
    | 'language'
    | 'data-storage'
    | 'privacy-security'

/**
 * Whether the account drawer is open, and which of its screens is showing.
 *
 * Two different controls open it — the rail's Menu entry on desktop, the top bar's on
 * mobile — and the drawer is a sibling of both, so the state cannot live in either.
 * Context rather than a Zustand store: it is UI state scoped to this route group, and it
 * dies with the layout.
 *
 * `view` is here rather than inside `MenuDrawer` because the drawer's *frame* depends on
 * it: on mobile a pushed screen goes full-bleed while the root stays a 342 panel, and the
 * box that sizes and slides is `AppSide`'s, not the drawer's own (see `app-side.tsx`).
 */
interface MenuState {
    open: boolean
    toggle: () => void
    close: () => void
    view: DrawerView
    push: (view: DrawerView) => void
    /** Back to the root screen — the pushed screens' only up-navigation. */
    pop: () => void
    /** Open straight onto one of the drawer's screens, from a control outside it. */
    openAt: (view: DrawerView) => void
}

const MenuContext = createContext<MenuState | null>(null)

export function MenuProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false)
    const [view, setView] = useState<DrawerView>('root')

    /**
     * Opening resets to the root screen — reopening into a screen you left behind reads
     * as a bug. It happens on the way *in*, not on the way out, and that is deliberate:
     * closing from a pushed screen leaves it standing for the 240ms it takes to slide
     * away, so the content does not swap and (on mobile) the panel does not shrink from
     * full-bleed back to 342 in front of you.
     */
    const toggle = useCallback(() => {
        if (!open) setView('root')
        setOpen(o => !o)
    }, [open])

    const close = useCallback(() => setOpen(false), [])
    const push = useCallback((next: DrawerView) => setView(next), [])
    const pop = useCallback(() => setView('root'), [])

    /**
     * A shortcut from outside the drawer to a screen the drawer already has — the rail's
     * Language entry, rather than a second switcher that would duplicate it.
     *
     * Deliberately not `toggle` + `push`: `toggle` resets to root on the way in, so the
     * two together would open at root and then animate a push you did not ask for. This
     * sets the screen and the open flag in one batch, so a closed drawer slides in already
     * showing it, and an open one pushes to it from wherever it was.
     */
    const openAt = useCallback((next: DrawerView) => {
        setView(next)
        setOpen(true)
    }, [])

    const value = useMemo(
        () => ({ open, toggle, close, view, push, pop, openAt }),
        [open, toggle, close, view, push, pop, openAt],
    )
    return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>
}

export function useMenu() {
    const ctx = useContext(MenuContext)
    if (!ctx) throw new Error('useMenu must be used inside MenuProvider')
    return ctx
}
