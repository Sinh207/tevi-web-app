import { describe, expect, it } from 'vitest'
import type { MiniAppConfig } from './app-config'
import {
    closeTab,
    EMPTY_TABS,
    MAX_TABS,
    openTab,
    patchTab,
    reloadTab,
    type TabsState,
} from './tabs'

const app = (url: string, name = url): MiniAppConfig => ({
    id: null,
    name,
    url,
    iconUrl: null,
    shareableUrl: null,
})

/** Open n apps, ids `t1…tn`. */
function withApps(...urls: string[]): TabsState {
    return urls.reduce<TabsState>(
        (state, url, index) => openTab(state, app(url), null, `t${index + 1}`),
        EMPTY_TABS,
    )
}

describe('openTab', () => {
    it('opens an app in a new tab and focuses it', () => {
        const state = openTab(EMPTY_TABS, app('https://a.example/'), '1.0', 't1')
        expect(state.tabs).toHaveLength(1)
        expect(state.activeTabId).toBe('t1')
        expect(state.tabs[0]).toMatchObject({ isLoading: true, frameVersion: '1.0', reloadKey: 0 })
    })

    it('switches to the running app instead of booting a second copy', () => {
        // Two frames of the same game are two sessions of it, and the second usually wins the
        // account's state.
        const state = withApps('https://a.example/', 'https://b.example/')
        const again = openTab(state, app('https://a.example/'), null, 't9')
        expect(again.tabs).toHaveLength(2)
        expect(again.activeTabId).toBe('t1')
    })

    it('dedupes across a hash route, so an app that routes on the fragment is one app', () => {
        const state = withApps('https://a.example/p#/lobby')
        const again = openTab(state, app('https://a.example/p#/match/12'), null, 't9')
        expect(again.tabs).toHaveLength(1)
    })

    it('adds a tab rather than replacing the active one', () => {
        // Legacy replaces the active tab's app, so opening a creator's game while playing another
        // silently destroys the first.
        const state = withApps('https://a.example/')
        const next = openTab(state, app('https://b.example/'), null, 't2')
        expect(next.tabs.map(tab => tab.config.url)).toEqual([
            'https://a.example/',
            'https://b.example/',
        ])
    })

    it('evicts the leftmost tab at the cap, which is the one a reader can see coming', () => {
        const full = withApps(
            ...Array.from({ length: MAX_TABS }, (_, i) => `https://a${i}.example/`),
        )
        expect(full.tabs).toHaveLength(MAX_TABS)
        const overflowed = openTab(full, app('https://new.example/'), null, 'tn')
        expect(overflowed.tabs).toHaveLength(MAX_TABS)
        expect(overflowed.tabs[0].config.url).toBe('https://a1.example/')
        expect(overflowed.activeTabId).toBe('tn')
    })

    it('never evicts the tab the reader is looking at', () => {
        /*
         * The commonest route to the cap: the Mini App Center is leftmost, the reader is in it, and
         * they tap a row — which opens an app through `executeLink`. Evicting the leftmost would
         * close the directory as a side effect of using it.
         */
        const full = {
            ...withApps(...Array.from({ length: MAX_TABS }, (_, i) => `https://a${i}.example/`)),
            activeTabId: 't1',
        }
        const overflowed = openTab(full, app('https://new.example/'), null, 'tn')
        expect(overflowed.tabs).toHaveLength(MAX_TABS)
        // `t1` survives; the next one along goes instead.
        expect(overflowed.tabs.map(tab => tab.id)).toEqual(['t1', 't3', 't4', 't5', 'tn'])
    })
})

describe('closeTab', () => {
    it('moves focus rightward, as every browser does', () => {
        const state = { ...withApps('a.example', 'b.example', 'c.example'), activeTabId: 't2' }
        const next = closeTab(state, 't2')
        expect(next.activeTabId).toBe('t3')
    })

    it('falls back to the new last tab when the closed one was last', () => {
        const state = { ...withApps('a.example', 'b.example'), activeTabId: 't2' }
        expect(closeTab(state, 't2').activeTabId).toBe('t1')
    })

    it('leaves focus alone when the closed tab was not active', () => {
        const state = { ...withApps('a.example', 'b.example'), activeTabId: 't1' }
        expect(closeTab(state, 't2').activeTabId).toBe('t1')
    })

    it('empties the player when the last tab goes', () => {
        expect(closeTab(withApps('a.example'), 't1')).toEqual(EMPTY_TABS)
    })

    it('ignores an id that is already gone', () => {
        const state = withApps('a.example')
        expect(closeTab(state, 'nope')).toBe(state)
    })
})

describe('patchTab', () => {
    it('is a no-op for a closed tab, so a late bridge message cannot resurrect it', () => {
        const state = withApps('a.example')
        expect(patchTab(state, 'gone', { isLoading: false })).toBe(state)
    })

    it('is a no-op when nothing changes, so a chatty app costs nothing', () => {
        // An app is free to send `showBackButton` on every frame of its own render loop, and
        // `onFrameLoad` fires again every time it navigates inside itself. `toBe` is the assertion
        // that matters: the same object means no re-render.
        const state = patchTab(withApps('a.example'), 't1', { showBackButton: true })
        expect(patchTab(state, 't1', { showBackButton: true })).toBe(state)
        expect(patchTab(state, 't1', { showBackButton: false })).not.toBe(state)
    })
})

describe('reloadTab', () => {
    it('bumps the key, re-arms the spinner and clears the chrome the old document asked for', () => {
        const state = patchTab(withApps('a.example'), 't1', {
            isLoading: false,
            showBackButton: true,
        })
        const next = reloadTab(state, 't1', '2.0')
        expect(next.tabs[0]).toMatchObject({
            reloadKey: 1,
            isLoading: true,
            showBackButton: false,
            frameVersion: '2.0',
        })
    })

    it('keeps the current version when none is given', () => {
        const state = openTab(EMPTY_TABS, app('https://a.example/'), '1.0', 't1')
        expect(reloadTab(state, 't1').tabs[0].frameVersion).toBe('1.0')
    })
})
