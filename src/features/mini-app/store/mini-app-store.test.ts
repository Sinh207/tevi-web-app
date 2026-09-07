import { beforeEach, describe, expect, it } from 'vitest'
import type { MiniAppConfig } from '../lib/app-config'
import { defaultRect } from '../lib/window-geometry'
import { getTabHandlers, registerTabHandlers, useMiniAppStore } from './mini-app-store'

const DESKTOP = { width: 1440, height: 900 }
const app = (url: string): MiniAppConfig => ({
    id: null,
    name: url,
    url,
    iconUrl: null,
    shareableUrl: null,
})

beforeEach(() => {
    useMiniAppStore.setState({
        tabs: [],
        activeTabId: null,
        rect: null,
        isMinimized: false,
        isMaximized: false,
        restoreRect: null,
    })
})

/**
 * The store is a shell over `lib/tabs.ts` and `lib/window-geometry.ts`, which are tested on their
 * own. What is tested here is the part only the shell decides: **when** those run, and the four
 * pieces of window behaviour a reader would notice if they were wrong.
 */
describe('opening', () => {
    it('un-minimises, because a reader who pressed Open asked for the app', () => {
        useMiniAppStore.getState().minimize()
        useMiniAppStore.getState().open(app('https://a.example/'), null)
        expect(useMiniAppStore.getState().isMinimized).toBe(false)
    })
})

describe('closing', () => {
    it('keeps the window arrangement, which is the reader’s and not the app’s', () => {
        const { syncViewport, open, closeAll } = useMiniAppStore.getState()
        syncViewport(DESKTOP)
        open(app('https://a.example/'), null)
        useMiniAppStore.getState().moveTo({ x: 10, y: 20 }, DESKTOP)
        const moved = useMiniAppStore.getState().rect
        closeAll()
        expect(useMiniAppStore.getState().tabs).toEqual([])
        expect(useMiniAppStore.getState().rect).toEqual(moved)
    })

    it('un-minimises, so a reopened player is not invisible', () => {
        const { open, minimize, closeAll } = useMiniAppStore.getState()
        open(app('https://a.example/'), null)
        minimize()
        closeAll()
        expect(useMiniAppStore.getState().isMinimized).toBe(false)
    })

    it('un-minimises when the last tab is closed one at a time as well', () => {
        useMiniAppStore.getState().open(app('https://a.example/'), null)
        const id = useMiniAppStore.getState().activeTabId!
        useMiniAppStore.getState().minimize()
        useMiniAppStore.getState().closeTab(id)
        expect(useMiniAppStore.getState().isMinimized).toBe(false)
    })
})

describe('the window', () => {
    it('measures itself on the first viewport sync rather than guessing before one', () => {
        expect(useMiniAppStore.getState().rect).toBeNull()
        useMiniAppStore.getState().syncViewport(DESKTOP)
        expect(useMiniAppStore.getState().rect).toEqual(defaultRect(DESKTOP))
    })

    it('brings an off-screen window back when the viewport shrinks', () => {
        const { syncViewport, moveTo } = useMiniAppStore.getState()
        syncViewport(DESKTOP)
        moveTo({ x: 1000, y: 100 }, DESKTOP)
        syncViewport({ width: 700, height: 600 })
        const rect = useMiniAppStore.getState().rect!
        expect(rect.x + rect.width).toBeLessThanOrEqual(700)
    })

    it('restores to where it was before it was maximised', () => {
        const { syncViewport, maximize, restore } = useMiniAppStore.getState()
        syncViewport(DESKTOP)
        const before = useMiniAppStore.getState().rect
        maximize(DESKTOP)
        expect(useMiniAppStore.getState().rect).toEqual({ x: 0, y: 0, ...DESKTOP })
        restore()
        expect(useMiniAppStore.getState().rect).toEqual(before)
        expect(useMiniAppStore.getState().isMaximized).toBe(false)
    })

    it('comes back maximised from a minimised-while-maximised state', () => {
        // One control does both, so `restore` has to answer the two in the right order.
        const { syncViewport, maximize, minimize, restore } = useMiniAppStore.getState()
        syncViewport(DESKTOP)
        maximize(DESKTOP)
        minimize()
        restore()
        expect(useMiniAppStore.getState().isMinimized).toBe(false)
        expect(useMiniAppStore.getState().isMaximized).toBe(true)
    })

    it('refuses to be dragged or resized while maximised', () => {
        const { syncViewport, maximize, moveTo } = useMiniAppStore.getState()
        syncViewport(DESKTOP)
        maximize(DESKTOP)
        moveTo({ x: 300, y: 300 }, DESKTOP)
        expect(useMiniAppStore.getState().rect).toEqual({ x: 0, y: 0, ...DESKTOP })
    })

    it('follows the viewport while maximised', () => {
        const { syncViewport, maximize } = useMiniAppStore.getState()
        syncViewport(DESKTOP)
        maximize(DESKTOP)
        syncViewport({ width: 1000, height: 700 })
        expect(useMiniAppStore.getState().rect).toEqual({ x: 0, y: 0, width: 1000, height: 700 })
    })
})

describe('the handler registry', () => {
    it('always answers, so a control pressed before its frame registered does nothing', () => {
        // The chrome is drawn from tab state and the frame registers in an effect, so there is one
        // paint where the button exists and its handler does not. A `TypeError` there is not an
        // acceptable outcome.
        expect(() => getTabHandlers('never-registered').reload()).not.toThrow()
        expect(() => getTabHandlers(null).back()).not.toThrow()
    })

    it('forgets a tab’s handlers when it closes', () => {
        useMiniAppStore.getState().open(app('https://a.example/'), null)
        const id = useMiniAppStore.getState().activeTabId!
        let called = 0
        registerTabHandlers(id, {
            back: () => {
                called += 1
            },
            close: () => undefined,
            reload: () => undefined,
            share: () => undefined,
            settings: () => undefined,
        })
        getTabHandlers(id).back()
        expect(called).toBe(1)
        useMiniAppStore.getState().closeTab(id)
        getTabHandlers(id).back()
        expect(called).toBe(1)
    })
})
