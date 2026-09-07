import { create } from 'zustand'
import type { MiniAppConfig } from '../lib/app-config'
import {
    closeTab as closeTabIn,
    EMPTY_TABS,
    type MiniAppTab,
    openTab,
    patchTab as patchTabIn,
    reloadTab as reloadTabIn,
    switchTab as switchTabIn,
    type TabsState,
} from '../lib/tabs'
import {
    clampPosition,
    clampRect,
    defaultRect,
    type Rect,
    type ResizeDirection,
    resizeRect,
    type Viewport,
} from '../lib/window-geometry'

/**
 * The player's state — **UI state only**, which is why it is a Zustand store and not a provider.
 *
 * Which apps are open, which tab is in front, where the window sits and whether it is minimised:
 * none of it is server state, none of it is cached from an endpoint, and none of it survives a
 * reload. That is exactly the boundary CLAUDE.md draws for Zustand, and the same one
 * `auth-store.ts` sits on.
 *
 * ## Why a store and not a context, given the feature has a mounted component anyway
 *
 * Two reasons, and the first is the one that decided it:
 *
 * 1. **The openers are everywhere and the renderer is one place.** A space's action row, the
 *    account drawer, a message, a post, an affiliate row — each needs `open(config)` and nothing
 *    else. With a context, every one of those surfaces re-renders whenever any tab's loading flag
 *    flips, because a context value cannot be subscribed to in part. With a store they subscribe
 *    to the action, which never changes identity.
 * 2. **The bridge is not a React event.** A `postMessage` handler has to mutate tab state from
 *    outside the tree, and `useMiniAppStore.getState()` is a first-class way to do that. Through a
 *    context it would be a ref chain.
 *
 * The counterpart is `MiniAppHost`, mounted once by `session-providers.tsx`. It renders the
 * window when there is something to render and reads the account, the balance and the locale —
 * which is why it is a component inside the session tree rather than more state in here.
 *
 * ## What is deliberately **not** here
 *
 * - **The app token, and any purchase.** Server state, so TanStack Query owns it
 *   (`api/mini-app-api.ts`). A token mirrored into this store would be a credential with no
 *   invalidation story.
 * - **The reader's balance.** `features/balance` owns it; the bridge asks that feature.
 * - **The per-tab imperative handlers**, which live in a module-scoped map below rather than in
 *   the state. They are functions belonging to a mounted frame, they change on every render of it,
 *   and putting them in the state would re-render every tab in the strip each time one of them
 *   re-created a callback. See `registerTabHandlers`.
 */

export interface MiniAppState extends TabsState {
    /**
     * The floating window's rect, or `null` before the first client measurement.
     *
     * `null` rather than a guessed default: the default is a function of the viewport, and this
     * store is constructed at import — which can happen during a server render of the component
     * that imports it. A rect invented without a viewport is the hydration mismatch this app has
     * already paid for once (`calendar-lazy.tsx`).
     */
    rect: Rect | null
    isMinimized: boolean
    isMaximized: boolean
    /** Where the window was before it was maximised, so Restore has somewhere to go. */
    restoreRect: Rect | null

    /** Open an app, or focus the tab already running it. See `lib/tabs.ts` for the rules. */
    open: (config: MiniAppConfig, frameVersion: string | null) => void
    /** Close the player: every tab, and the window with them. */
    closeAll: () => void
    closeTab: (id: string) => void
    switchTab: (id: string) => void
    patchTab: (id: string, patch: Partial<MiniAppTab>) => void
    reloadTab: (id: string, frameVersion?: string | null) => void

    minimize: () => void
    maximize: (viewport: Viewport) => void
    /** Un-minimise, or un-maximise. One control, because one button does both in the chrome. */
    restore: () => void
    moveTo: (position: { x: number; y: number }, viewport: Viewport) => void
    resizeFrom: (args: {
        direction: ResizeDirection
        start: Rect
        delta: { x: number; y: number }
        viewport: Viewport
    }) => void
    /**
     * Called on mount and on every viewport change: establishes the rect the first time and keeps
     * it on screen afterwards. A window left at `x: 1400` by a wide monitor must not be off the
     * edge when the same session continues in a narrow one.
     */
    syncViewport: (viewport: Viewport) => void
}

/**
 * Tab ids. A module counter, not a random id: it is only ever compared, never persisted or sent,
 * and `Math.random` in state would make the store's behaviour unreproducible in a test.
 */
let tabSequence = 0
const nextTabId = () => `mini-app-tab-${++tabSequence}`

export const useMiniAppStore = create<MiniAppState>()((set, get) => ({
    ...EMPTY_TABS,
    rect: null,
    isMinimized: false,
    isMaximized: false,
    restoreRect: null,

    open: (config, frameVersion) =>
        set(state => ({
            ...openTab(state, config, frameVersion, nextTabId()),
            /*
             * Opening an app un-minimises. It is the one place that is not obvious: a reader who
             * minimised the player and then pressed "Open" on a space has asked for the app, and
             * leaving it collapsed into a pill looks like the button did nothing.
             */
            isMinimized: false,
        })),

    closeAll: () => {
        clearTabHandlers()
        /*
         * The rect survives. Closing the player and opening another app should put the window back
         * where the reader left it — it is their arrangement of their screen, not state belonging
         * to the app that happened to be in it. `isMaximized` survives for the same reason;
         * `isMinimized` does not, because a closed-then-reopened player must be visible.
         */
        set(state => ({ ...EMPTY_TABS, isMinimized: false, restoreRect: state.restoreRect }))
    },

    closeTab: id => {
        forgetTabHandlers(id)
        set(state => {
            const next = closeTabIn(state, id)
            return next.tabs.length === 0 ? { ...next, isMinimized: false } : next
        })
    },

    switchTab: id => set(state => switchTabIn(state, id)),
    patchTab: (id, patch) => set(state => patchTabIn(state, id, patch)),
    reloadTab: (id, frameVersion) => set(state => reloadTabIn(state, id, frameVersion)),

    minimize: () => set({ isMinimized: true }),

    maximize: viewport =>
        set(state => ({
            restoreRect: state.rect,
            rect: { x: 0, y: 0, width: viewport.width, height: viewport.height },
            isMaximized: true,
            isMinimized: false,
        })),

    restore: () =>
        set(state => {
            // Minimised wins: the pill's only job is to bring the window back as it was, and a
            // window that was maximised *and* then minimised must come back maximised.
            if (state.isMinimized) return { isMinimized: false }
            if (!state.isMaximized) return {}
            return {
                rect: state.restoreRect ?? state.rect,
                restoreRect: null,
                isMaximized: false,
            }
        }),

    moveTo: (position, viewport) =>
        set(state => {
            if (!state.rect || state.isMaximized) return {}
            return { rect: clampPosition({ ...state.rect, ...position }, viewport) }
        }),

    resizeFrom: ({ direction, start, delta, viewport }) =>
        set(state => {
            if (state.isMaximized) return {}
            return { rect: resizeRect({ direction, start, delta, viewport }) }
        }),

    syncViewport: viewport => {
        const state = get()
        if (state.isMaximized) {
            set({ rect: { x: 0, y: 0, width: viewport.width, height: viewport.height } })
            return
        }
        set({ rect: state.rect ? clampRect(state.rect, viewport) : defaultRect(viewport) })
    },
}))

/**
 * What one mounted frame can be asked to do from the chrome around it.
 *
 * The tab strip's back chevron, close glyph, ⋯ Reload and ⋯ Share all act on the **active tab's
 * frame**, and only that frame knows how: back and close are `postMessage`s into it, reload is a
 * remount, share needs its config. So the frame registers these on mount and the chrome calls
 * them by id.
 *
 * A module-scoped `Map` rather than store state, deliberately: these are functions whose identity
 * changes whenever the frame re-renders, and state that changes on every render of a child is a
 * re-render of every sibling. Nothing renders from this map — it is only ever called from an event
 * handler — so it does not need to be reactive, and making it reactive would be strictly worse.
 */
export interface TabHandlers {
    back: () => void
    close: () => void
    reload: () => void
    share: () => void
    settings: () => void
}

const tabHandlers = new Map<string, TabHandlers>()

export function registerTabHandlers(id: string, handlers: TabHandlers) {
    tabHandlers.set(id, handlers)
}

export function forgetTabHandlers(id: string) {
    tabHandlers.delete(id)
}

function clearTabHandlers() {
    tabHandlers.clear()
}

/**
 * The handlers for a tab, or a no-op set.
 *
 * Never `undefined`: the chrome is drawn from tab state and the frame registers in an effect, so
 * there is one paint in which a button exists and its handler does not. A pressed control doing
 * nothing for that frame is the correct outcome; a thrown `TypeError` is not.
 */
export function getTabHandlers(id: string | null): TabHandlers {
    const handlers = id ? tabHandlers.get(id) : undefined
    return handlers ?? NO_HANDLERS
}

const noop = () => undefined
const NO_HANDLERS: TabHandlers = {
    back: noop,
    close: noop,
    reload: noop,
    share: noop,
    settings: noop,
}
