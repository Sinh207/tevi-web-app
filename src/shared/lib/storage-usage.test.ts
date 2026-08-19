// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatBytes, measureLocalData, readStorageUsage } from './storage-usage'

describe('formatBytes', () => {
    it('keeps small counts in whole bytes', () => {
        expect(formatBytes(0)).toBe('0 byte')
        expect(formatBytes(512)).toBe('512 byte')
    })

    it('steps up at 1000, decimal to match the SI unit names', () => {
        expect(formatBytes(999)).toBe('999 byte')
        expect(formatBytes(1000)).toBe('1 kB')
        expect(formatBytes(1_500_000)).toBe('1.5 MB')
        expect(formatBytes(2_400_000_000)).toBe('2.4 GB')
    })

    it('stops at the largest unit rather than inventing one', () => {
        expect(formatBytes(5e15)).toBe('5,000 TB')
    })

    it('treats a nonsense figure as zero instead of rendering NaN', () => {
        expect(formatBytes(Number.NaN)).toBe('0 byte')
        expect(formatBytes(-1)).toBe('0 byte')
    })

    it('formats in the caller’s locale', () => {
        // Vietnamese groups and decimalises the other way round.
        expect(formatBytes(1_500_000, 'vi')).toBe('1,5 MB')
    })

    it('falls back rather than throwing on a locale the engine rejects', () => {
        expect(formatBytes(1000, 'not a tag')).toBe('1 kB')
    })
})

describe('measureLocalData', () => {
    beforeEach(() => {
        window.localStorage.clear()
    })

    it('is zero with nothing stored', () => {
        expect(measureLocalData()).toBe(0)
    })

    it('counts key and value as UTF-16', () => {
        window.localStorage.setItem('tevi.a', 'bc')
        // 'tevi.a' (6) + 'bc' (2) = 8 code units
        expect(measureLocalData()).toBe(16)
    })

    it('ignores keys that are not ours', () => {
        window.localStorage.setItem('tevi.a', 'bc')
        window.localStorage.setItem('someone-else', 'x'.repeat(1000))
        // A key that merely starts with the word is not in our namespace either.
        window.localStorage.setItem('teviXYZ', 'x'.repeat(1000))
        expect(measureLocalData()).toBe(16)
    })

    it('reports zero when storage is denied outright', () => {
        // Private mode and lockdown profiles do not hand back an empty store — reading
        // `localStorage` at all throws.
        const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('denied')
            },
        })
        expect(measureLocalData()).toBe(0)
        if (original) Object.defineProperty(window, 'localStorage', original)
        else Reflect.deleteProperty(window, 'localStorage')
    })
})

describe('readStorageUsage', () => {
    it('degrades to null where the browser has no estimate to give', async () => {
        // jsdom ships neither `navigator.storage` nor IndexedDB.
        const usage = await readStorageUsage()
        expect(usage.siteBytes).toBeNull()
        expect(usage.cachedResponses).toBe(0)
    })

    it('reads the estimate when the browser has one', async () => {
        vi.stubGlobal('navigator', {
            ...navigator,
            storage: { estimate: async () => ({ usage: 4096, quota: 1e9 }) },
        })
        await expect(readStorageUsage()).resolves.toMatchObject({ siteBytes: 4096 })
        vi.unstubAllGlobals()
    })

    it('survives an estimate that rejects', async () => {
        vi.stubGlobal('navigator', {
            ...navigator,
            storage: {
                estimate: async () => {
                    throw new Error('nope')
                },
            },
        })
        await expect(readStorageUsage()).resolves.toMatchObject({ siteBytes: null })
        vi.unstubAllGlobals()
    })
})
