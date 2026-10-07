// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    addRecentCreator,
    clearRecentCreators,
    getRecentCreators,
    MAX_RECENT_CREATORS,
    removeRecentCreator,
    subscribeRecentCreators,
} from './search-recent-creators'
import { STORAGE_KEYS } from './storage'

const creator = (slug: string) => ({
    slug,
    name: slug.toUpperCase(),
    thumb: null,
    verifiedImage: null,
    isPremium: false,
    isNsfw: false,
})

beforeEach(() => {
    localStorage.clear()
})

describe('addRecentCreator', () => {
    it('puts the newest first and moves a re-opened space back to the front', () => {
        addRecentCreator(creator('ada'), 'acc-1')
        addRecentCreator(creator('grace'), 'acc-1')
        addRecentCreator(creator('ADA'), 'acc-1')
        expect(getRecentCreators('acc-1').map(row => row.slug)).toEqual(['ADA', 'grace'])
    })

    it(`caps the list at ${MAX_RECENT_CREATORS}, dropping the oldest`, () => {
        for (let index = 0; index < 8; index += 1) addRecentCreator(creator(`c${index}`), 'acc-1')
        const slugs = getRecentCreators('acc-1').map(row => row.slug)
        expect(slugs).toEqual(['c7', 'c6', 'c5', 'c4', 'c3'])
    })

    it('ignores a blank slug and a missing account', () => {
        addRecentCreator(creator('   '), 'acc-1')
        addRecentCreator(creator('ada'), '')
        expect(getRecentCreators('acc-1')).toEqual([])
    })

    it('keeps accounts apart', () => {
        addRecentCreator(creator('ada'), 'acc-1')
        expect(getRecentCreators('acc-2')).toEqual([])
    })
})

describe('removeRecentCreator / clearRecentCreators', () => {
    it('removes one space, case-insensitively', () => {
        addRecentCreator(creator('ada'), 'acc-1')
        addRecentCreator(creator('grace'), 'acc-1')
        removeRecentCreator('ADA', 'acc-1')
        expect(getRecentCreators('acc-1').map(row => row.slug)).toEqual(['grace'])
    })

    it("clears one account's list and leaves the others", () => {
        addRecentCreator(creator('ada'), 'acc-1')
        addRecentCreator(creator('grace'), 'acc-2')
        clearRecentCreators('acc-1')
        expect(getRecentCreators('acc-1')).toEqual([])
        expect(getRecentCreators('acc-2')).toHaveLength(1)
    })
})

describe('as an external store', () => {
    it('notifies subscribers on write', () => {
        const listener = vi.fn()
        const unsubscribe = subscribeRecentCreators(listener)
        addRecentCreator(creator('ada'), 'acc-1')
        expect(listener).toHaveBeenCalledTimes(1)
        unsubscribe()
    })

    it('returns the same snapshot while the store is unchanged', () => {
        addRecentCreator(creator('ada'), 'acc-1')
        expect(getRecentCreators('acc-1')).toBe(getRecentCreators('acc-1'))
    })

    it('degrades corrupt JSON to an empty list', () => {
        localStorage.setItem(STORAGE_KEYS.searchRecentCreators, '{"acc-1": "nope"}')
        expect(getRecentCreators('acc-1')).toEqual([])
    })
})
