// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clearPreviewQuota,
    isPreviewExhausted,
    PREVIEW_LIMIT,
    previewsLeft,
    spendPreview,
} from './preview-quota'
import { STORAGE_KEYS } from './storage'

/**
 * **The counter that makes the free preview an advertisement.**
 *
 * Every claim below is one where the wrong answer is invisible: the reader either quietly loses
 * previews they never saw, or quietly gets unlimited ones. Neither throws, neither logs, and the
 * backend's own count is what finally disagrees — a round trip later.
 */
beforeEach(() => {
    window.localStorage.clear()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('spending previews', () => {
    it('starts at the full limit and counts down', () => {
        expect(previewsLeft('evt-1')).toBe(PREVIEW_LIMIT)
        expect(spendPreview('evt-1')).toBe(2)
        expect(spendPreview('evt-1')).toBe(1)
        expect(spendPreview('evt-1')).toBe(0)
        expect(isPreviewExhausted('evt-1')).toBe(true)
    })

    /*
     * A caller that skips `isPreviewExhausted` must not be able to drive the count past the limit.
     * The two entry points cannot be allowed to disagree — one of them is a guard and the other is
     * the thing being guarded.
     */
    it('refuses to go past the limit, and writes nothing when it does', () => {
        for (let i = 0; i < PREVIEW_LIMIT; i++) spendPreview('evt-1')
        const before = window.localStorage.getItem(STORAGE_KEYS.previewQuota)
        expect(spendPreview('evt-1')).toBe(0)
        expect(window.localStorage.getItem(STORAGE_KEYS.previewQuota)).toBe(before)
    })

    /** Per **event**: a creator's next stream starts fresh. */
    it('counts each event separately', () => {
        spendPreview('evt-1')
        spendPreview('evt-1')
        expect(previewsLeft('evt-1')).toBe(1)
        expect(previewsLeft('evt-2')).toBe(PREVIEW_LIMIT)
    })

    it('answers safely for a missing event code', () => {
        expect(previewsLeft('')).toBe(0)
        expect(spendPreview('')).toBe(0)
    })
})

describe('expiry', () => {
    /*
     * The TTL measures **inactivity**, not age — `at` is refreshed on every spend. A reader who
     * comes back to the same stream an hour later has not had their counter reset behind them.
     */
    it('keeps counting within the window', () => {
        vi.useFakeTimers()
        vi.setSystemTime(Date.parse('2026-09-01T00:00:00Z'))
        spendPreview('evt-1')

        vi.setSystemTime(Date.parse('2026-09-20T00:00:00Z'))
        expect(previewsLeft('evt-1')).toBe(2)
    })

    it('forgets an event nobody has opened in a month', () => {
        vi.useFakeTimers()
        vi.setSystemTime(Date.parse('2026-09-01T00:00:00Z'))
        spendPreview('evt-1')
        spendPreview('evt-1')
        spendPreview('evt-1')
        expect(isPreviewExhausted('evt-1')).toBe(true)

        vi.setSystemTime(Date.parse('2026-10-15T00:00:00Z'))
        expect(previewsLeft('evt-1')).toBe(PREVIEW_LIMIT)
    })
})

describe('a corrupt record', () => {
    /**
     * Fails **open**, and that direction is deliberate.
     *
     * The counter is advisory — the backend enforces the real limit — so refusing somebody their
     * free preview because our own JSON is malformed is punishing a reader for our bug. The cost
     * of the other direction is one wasted round trip.
     */
    it('is dropped rather than read as exhausted', () => {
        window.localStorage.setItem(
            STORAGE_KEYS.previewQuota,
            JSON.stringify({ 'evt-1': { spent: 'lots', at: 'yesterday' } }),
        )
        expect(previewsLeft('evt-1')).toBe(PREVIEW_LIMIT)
    })

    it('survives a value that is not an object at all', () => {
        window.localStorage.setItem(STORAGE_KEYS.previewQuota, '"nope"')
        expect(previewsLeft('evt-1')).toBe(PREVIEW_LIMIT)
        expect(spendPreview('evt-1')).toBe(2)
    })

    /* A negative `spent` would otherwise hand the reader *more* than the limit. */
    it('drops a negative count instead of granting extra previews', () => {
        window.localStorage.setItem(
            STORAGE_KEYS.previewQuota,
            JSON.stringify({ 'evt-1': { spent: -5, at: Date.now() } }),
        )
        expect(previewsLeft('evt-1')).toBe(PREVIEW_LIMIT)
    })
})

describe('the row cap', () => {
    /*
     * `storage.setJSON` swallows a quota error rather than throwing, so an unbounded map does not
     * fail loudly — it silently stops being written, which would hand every later event unlimited
     * previews. The cap is what keeps that from being reachable.
     */
    it('evicts the oldest events past the cap, keeping the newest', () => {
        vi.useFakeTimers()
        for (let i = 0; i < 120; i++) {
            vi.setSystemTime(Date.parse('2026-09-01T00:00:00Z') + i * 1000)
            spendPreview(`evt-${i}`)
        }
        const stored = JSON.parse(
            window.localStorage.getItem(STORAGE_KEYS.previewQuota) ?? '{}',
        ) as Record<string, unknown>

        expect(Object.keys(stored).length).toBeLessThanOrEqual(100)
        expect(stored['evt-119']).toBeTruthy()
        expect(stored['evt-0']).toBeUndefined()
    })
})

describe('clearPreviewQuota', () => {
    it('drops everything', () => {
        spendPreview('evt-1')
        clearPreviewQuota()
        expect(previewsLeft('evt-1')).toBe(PREVIEW_LIMIT)
    })
})
