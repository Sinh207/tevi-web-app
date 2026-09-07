import { type MiniAppConfig, miniAppDedupKey } from './app-config'

/**
 * The tab list, as pure functions.
 *
 * Every rule a reader can *see* lives here — which tab opens, which one is dropped when the
 * strip is full, which one is focused after a close — so each is a test rather than a claim in
 * a comment. The store (`store/mini-app-store.ts`) is then a thin shell that owns *when* these
 * run; nothing about the list's behaviour requires React to state.
 */

export interface MiniAppTab {
    id: string
    /**
     * Always present. There is no blank tab.
     *
     * Legacy has one — a tab with no app, showing an "app picker" whose list is three hardcoded
     * fixtures and a `TODO: Replace with real app list from API`. There is no endpoint behind it,
     * so a blank tab here would be an empty screen with a search box over it. The **Mini App
     * Center is the picker**, and it is itself a mini app, so `+` opens it as an ordinary tab
     * (`lib/center.ts`) and the state has one less shape to be in.
     */
    config: MiniAppConfig
    /** The frame has not fired `load` yet. Drives the spinner, and nothing else. */
    isLoading: boolean
    /** The `v` in this tab's frame URL, frozen for the tab's life. See `app-version.ts`. */
    frameVersion: string | null
    /**
     * Bumped to force the frame to remount.
     *
     * It is part of the `iframe`'s React `key`, so a bump discards the element and builds a new
     * one — which is the only reliable reload for a **cross-origin** frame. Assigning
     * `iframe.src = iframe.src` (what legacy does) is a same-origin trick: it re-navigates a
     * frame the parent is allowed to touch. Here the parent may not read `contentWindow.location`
     * at all, and the assignment silently re-navigates to the *initial* src, losing whatever the
     * app had navigated to — or throws, depending on the browser.
     */
    reloadKey: number
    /** The app asked for a back chevron in the host's chrome (`showBackButton`). */
    showBackButton: boolean
    /** The app asked for a close glyph in the host's chrome (`showCloseButton`). */
    showCloseButton: boolean
}

export interface TabsState {
    tabs: MiniAppTab[]
    activeTabId: string | null
}

/**
 * Five, as legacy. Not a technical limit — each tab is a live third-party application with its
 * own sockets, timers and audio, and a sixth one on a phone is a browser that has stopped
 * responding rather than a browser with six tabs.
 */
export const MAX_TABS = 5

export const EMPTY_TABS: TabsState = { tabs: [], activeTabId: null }

export function activeTab(state: TabsState): MiniAppTab | null {
    return state.tabs.find(tab => tab.id === state.activeTabId) ?? null
}

function newTab(id: string, config: MiniAppConfig, frameVersion: string | null): MiniAppTab {
    return {
        id,
        config,
        isLoading: true,
        frameVersion,
        reloadKey: 0,
        showBackButton: false,
        showCloseButton: false,
    }
}

/**
 * Open an app: switch to it if it is already running, otherwise give it a tab.
 *
 * ## Dedup is the reason this is not `tabs.concat`
 *
 * Pressing "Open" on a space whose app is already in a tab must **switch**, not boot a second
 * copy — two frames of the same game are two sessions of it, and the second one usually wins
 * the account's state. The identity is `miniAppDedupKey` (origin + path + query), so an app
 * that routes on the hash is one app.
 *
 * ## Two divergences from legacy, both deliberate
 *
 * 1. **A new app gets a new tab.** Legacy replaces the *active* tab's app when any tab is open
 *    (`setTabApp(activeTabId, config)`), so opening a creator's game while playing another one
 *    silently destroys the first. With dedup and a cap already in place there is nothing to be
 *    bought by that.
 * 2. **The evicted tab is the leftmost — but never the active one.** Tab order is on screen, so
 *    "the one on the far left goes" is a rule a reader can see coming, where LRU is not. The
 *    exception matters more than it looks: the commonest way to reach the cap is opening an app
 *    *from* the Mini App Center (`executeLink` with `type: 'app'`), and if the Center happens to be
 *    leftmost, the plain rule closes the directory the reader is browsing as a side effect of using
 *    it. Legacy drops `slice(1)` unconditionally and has exactly that.
 */
export function openTab(
    state: TabsState,
    config: MiniAppConfig,
    frameVersion: string | null,
    id: string,
): TabsState {
    const key = miniAppDedupKey(config.url)
    const existing = key
        ? state.tabs.find(tab => miniAppDedupKey(tab.config.url) === key)
        : undefined
    if (existing) return { ...state, activeTabId: existing.id }

    const base = state.tabs.length >= MAX_TABS ? withoutEvicted(state) : state.tabs
    const tab = newTab(id, config, frameVersion)
    return { tabs: [...base, tab], activeTabId: tab.id }
}

/**
 * The list minus one tab: the first that is not active, or the first if the active one is the only
 * candidate (a one-tab list at the cap, which `MAX_TABS > 1` makes unreachable — the fallback is
 * there so this can never return a full list and quietly break the cap).
 */
function withoutEvicted(state: TabsState): MiniAppTab[] {
    const index = state.tabs.findIndex(tab => tab.id !== state.activeTabId)
    const evicted = index === -1 ? 0 : index
    return state.tabs.filter((_, position) => position !== evicted)
}

/**
 * Close one tab, and answer which is focused now.
 *
 * The neighbour that takes focus is the one at the **closed tab's index**, falling back to the
 * new last tab — i.e. closing a tab moves you rightward, which is what every browser does and
 * what keeps closing several in a row from jumping around the strip. Closing a tab that was not
 * active leaves focus exactly where it was.
 */
export function closeTab(state: TabsState, id: string): TabsState {
    const index = state.tabs.findIndex(tab => tab.id === id)
    if (index === -1) return state

    const tabs = state.tabs.filter(tab => tab.id !== id)
    if (state.activeTabId !== id)
        return { ...state, activeTabId: tabs.length ? state.activeTabId : null }
    if (tabs.length === 0) return EMPTY_TABS
    return { tabs, activeTabId: tabs[Math.min(index, tabs.length - 1)].id }
}

export function switchTab(state: TabsState, id: string): TabsState {
    return state.tabs.some(tab => tab.id === id) ? { ...state, activeTabId: id } : state
}

/**
 * Patch one tab.
 *
 * Two no-ops, and both matter because the callers are a **third party's** messages:
 *
 * - an id that is gone — a bridge message from a tab that has since been closed;
 * - a patch that changes nothing. An app is free to send `showBackButton` on every frame of its own
 *   render loop, and `onFrameLoad` fires again every time the app navigates inside itself. Without
 *   this, each of those replaces the `tabs` array and re-renders the window (and, before `memo` on
 *   `MiniAppFrame`, every other app in the strip with it). Returning the same object is what makes a
 *   chatty app cost nothing.
 */
export function patchTab(state: TabsState, id: string, patch: Partial<MiniAppTab>): TabsState {
    const current = state.tabs.find(tab => tab.id === id)
    if (!current) return state
    const keys = Object.keys(patch) as (keyof MiniAppTab)[]
    if (keys.every(key => current[key] === patch[key])) return state
    return { ...state, tabs: state.tabs.map(tab => (tab.id === id ? { ...tab, ...patch } : tab)) }
}

/**
 * Remount a tab's frame, optionally under a new version.
 *
 * `isLoading` goes back to `true` and the two chrome buttons are cleared: the reloaded document
 * has not asked for them yet, and leaving a back chevron pointing into an app that no longer has
 * a history is a control that does nothing.
 */
export function reloadTab(state: TabsState, id: string, frameVersion?: string | null): TabsState {
    const tab = state.tabs.find(candidate => candidate.id === id)
    if (!tab) return state
    return patchTab(state, id, {
        reloadKey: tab.reloadKey + 1,
        isLoading: true,
        showBackButton: false,
        showCloseButton: false,
        ...(frameVersion === undefined ? {} : { frameVersion }),
    })
}
