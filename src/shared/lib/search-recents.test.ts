// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    addSearchRecent,
    clearSearchRecents,
    getSearchRecents,
    removeSearchRecent,
    subscribeSearchRecents,
} from './search-recents'
import { STORAGE_KEYS } from './storage'

/**
 * The recents store, and the things about it a comment cannot pin.
 *
 * Two are the departures from legacy that make this list worth having — **case-insensitive
 * de-duplication** and **no three-character floor** — and both are silent when wrong: the first
 * shows "ada" and "Ada" as two rows, which reads as a rendering bug, and the second means a
 * Korean or Chinese reader's searches are simply never remembered, with nothing on screen to say
 * so. Two more are the bounds: the cap, and per-account isolation on a device that holds up to
 * ten accounts.
 *
 * The last group is the **store contract** — notification on write, and a referentially stable
 * snapshot. Those exist because the search screen mounts `useSearchRecents` twice, and the version
 * of this module that did not have them let a write through one instance go unseen by the other.
 * `use-search-recents.test.tsx` states that at the React level; the `as an external store` block
 * below states the plumbing.
 */

const KEY = STORAGE_KEYS.searchRecents

beforeEach(() => {
    window.localStorage.clear()
})

describe('addSearchRecent', () => {
    it('puts the newest term first', () => {
        addSearchRecent('ada', 'acc-1')
        addSearchRecent('grace', 'acc-1')
        expect(getSearchRecents('acc-1')).toEqual(['grace', 'ada'])
    })

    it('trims, and ignores a term that is only whitespace', () => {
        addSearchRecent('  ada  ', 'acc-1')
        addSearchRecent('   ', 'acc-1')
        expect(getSearchRecents('acc-1')).toEqual(['ada'])
    })

    /**
     * Legacy refuses anything under three characters (`MIN_TERM_LENGTH = 3`), which is a locale
     * assumption rather than a threshold: this app ships `ko`, `zh-CN` and `zh-TW`, where a
     * space's name is frequently one or two characters.
     */
    it('records a one-character term, which legacy silently discards', () => {
        addSearchRecent('아', 'acc-1')
        addSearchRecent('小', 'acc-1')
        expect(getSearchRecents('acc-1')).toEqual(['小', '아'])
    })

    /**
     * Legacy dedupes with `prev.includes(term)`, so "Ada" after "ada" leaves both in the list.
     * The **new** spelling wins, because it is the one the reader just typed.
     */
    /**
     * The rule that makes recording-on-settle usable. `useChannelSearch` writes a term every time the
     * debounce fires, so one search arrives here as its own prefix chain — and without this the list
     * is four rows deep after typing one name, which is the defect legacy ships.
     */
    describe('a term that extends the head', () => {
        it('collapses a whole prefix chain to the term that was actually typed', () => {
            for (const term of ['a', 'ad', 'ada', 'adam']) addSearchRecent(term, 'acc-1')
            expect(getSearchRecents('acc-1')).toEqual(['adam'])
        })

        it('folds case, so a shifted first letter still counts as the same search', () => {
            addSearchRecent('Ad', 'acc-1')
            addSearchRecent('adam', 'acc-1')
            expect(getSearchRecents('acc-1')).toEqual(['adam'])
        })

        /**
         * Backspacing is a reader **narrowing** a search rather than continuing one, and the shorter
         * term is a real thing they looked at. It also cannot be collapsed by this rule even in
         * principle — "ada" does not extend "adam".
         */
        it('keeps both when the reader backspaces instead', () => {
            addSearchRecent('adam', 'acc-1')
            addSearchRecent('ada', 'acc-1')
            expect(getSearchRecents('acc-1')).toEqual(['ada', 'adam'])
        })

        /**
         * The reason the rule is scoped to the head. A blanket "drop every prefix" would delete a real
         * earlier search that happens to share a stem with today's.
         */
        it('leaves an older search alone even when the new term extends it', () => {
            addSearchRecent('ada', 'acc-1')
            addSearchRecent('grace', 'acc-1')
            addSearchRecent('adamsmith', 'acc-1')
            expect(getSearchRecents('acc-1')).toEqual(['adamsmith', 'grace', 'ada'])
        })

        it('does not treat an identical term as an extension — it is the ordinary re-date', () => {
            addSearchRecent('ada', 'acc-1')
            addSearchRecent('grace', 'acc-1')
            addSearchRecent('grace', 'acc-1')
            expect(getSearchRecents('acc-1')).toEqual(['grace', 'ada'])
        })

        it('collapses only the head, never a deeper entry it also extends', () => {
            addSearchRecent('ad', 'acc-1')
            addSearchRecent('grace', 'acc-1')
            addSearchRecent('gracehopper', 'acc-1')
            expect(getSearchRecents('acc-1')).toEqual(['gracehopper', 'ad'])
        })
    })

    it('folds case when de-duplicating, and keeps the newest spelling', () => {
        addSearchRecent('ada', 'acc-1')
        addSearchRecent('grace', 'acc-1')
        addSearchRecent('ADA', 'acc-1')
        expect(getSearchRecents('acc-1')).toEqual(['ADA', 'grace'])
    })

    it('caps the list at twenty, dropping the oldest', () => {
        for (let index = 0; index < 25; index += 1) addSearchRecent(`term-${index}`, 'acc-1')
        const recents = getSearchRecents('acc-1')
        expect(recents).toHaveLength(20)
        expect(recents[0]).toBe('term-24')
        expect(recents).not.toContain('term-4')
    })

    /** A pasted paragraph is a legitimate search; twenty of them in localStorage are not. */
    it('caps one stored term at 120 characters', () => {
        addSearchRecent('x'.repeat(500), 'acc-1')
        expect(getSearchRecents('acc-1')[0]).toHaveLength(120)
    })

    /**
     * This device can hold ten accounts, and a search history is a person's. Legacy writes one
     * unregistered key per account and none at all without a real user.
     */
    it('keeps each account’s history to itself', () => {
        addSearchRecent('ada', 'acc-1')
        addSearchRecent('grace', 'acc-2')
        expect(getSearchRecents('acc-1')).toEqual(['ada'])
        expect(getSearchRecents('acc-2')).toEqual(['grace'])
    })

    it('is a no-op without an account id, rather than filing under a placeholder', () => {
        expect(addSearchRecent('ada', '')).toEqual([])
        expect(window.localStorage.getItem(KEY)).toBeNull()
    })

    it('returns the resulting list, so a caller needs no second read', () => {
        expect(addSearchRecent('ada', 'acc-1')).toEqual(['ada'])
        expect(addSearchRecent('grace', 'acc-1')).toEqual(['grace', 'ada'])
    })
})

describe('removeSearchRecent', () => {
    it('removes what add would have folded', () => {
        addSearchRecent('Ada', 'acc-1')
        addSearchRecent('grace', 'acc-1')
        expect(removeSearchRecent('  ADA ', 'acc-1')).toEqual(['grace'])
    })

    it('leaves the list alone when the term is not there', () => {
        addSearchRecent('ada', 'acc-1')
        expect(removeSearchRecent('grace', 'acc-1')).toEqual(['ada'])
    })
})

describe('clearSearchRecents', () => {
    /**
     * The reason this module is in `shared/` at all: `AuthProvider.forgetAccount` calls it, and
     * `features/auth` may not import `features/search`. A search history left behind on a shared
     * device reads as the next person's.
     */
    it('drops one account’s history and leaves the others', () => {
        addSearchRecent('ada', 'acc-1')
        addSearchRecent('grace', 'acc-2')
        clearSearchRecents('acc-1')
        expect(getSearchRecents('acc-1')).toEqual([])
        expect(getSearchRecents('acc-2')).toEqual(['grace'])
    })
})

describe('as an external store', () => {
    /**
     * The `useSyncExternalStore` contract, and the reason this module is a store at all: the search
     * screen mounts `useSearchRecents` twice, and the version that mirrored into `useState` left a
     * write through one instance invisible to the other. `use-search-recents.test.tsx` asserts that
     * at the React level; these two are the plumbing underneath it.
     */
    it('notifies subscribers on every write', () => {
        const listener = vi.fn()
        const unsubscribe = subscribeSearchRecents(listener)

        addSearchRecent('ada', 'acc-1')
        expect(listener).toHaveBeenCalledTimes(1)
        removeSearchRecent('ada', 'acc-1')
        expect(listener).toHaveBeenCalledTimes(2)
        addSearchRecent('grace', 'acc-1')
        clearSearchRecents('acc-1')
        expect(listener).toHaveBeenCalledTimes(4)

        unsubscribe()
        addSearchRecent('hopper', 'acc-1')
        expect(listener).toHaveBeenCalledTimes(4)
    })

    /** A write that changed nothing must not wake every reader. */
    it('stays quiet when there was nothing to remove', () => {
        addSearchRecent('ada', 'acc-1')
        const listener = vi.fn()
        const unsubscribe = subscribeSearchRecents(listener)

        removeSearchRecent('grace', 'acc-1')
        clearSearchRecents('acc-2')
        expect(listener).not.toHaveBeenCalled()
        unsubscribe()
    })

    /**
     * `getSnapshot` returning a fresh array per call is the classic infinite re-render, so the
     * snapshot is cached — and cached against the **raw text**, which is what keeps it correct when
     * something outside this module changes the store (another tab, or the test below).
     */
    it('returns the same array until the stored text changes', () => {
        addSearchRecent('ada', 'acc-1')
        const first = getSearchRecents('acc-1')
        expect(getSearchRecents('acc-1')).toBe(first)

        addSearchRecent('grace', 'acc-1')
        expect(getSearchRecents('acc-1')).not.toBe(first)

        // Same empty answer, same array — the case that would loop.
        expect(getSearchRecents('acc-9')).toBe(getSearchRecents('acc-8'))
    })

    it('re-reads after the store is changed behind its back', () => {
        addSearchRecent('ada', 'acc-1')
        expect(getSearchRecents('acc-1')).toEqual(['ada'])

        window.localStorage.setItem(KEY, JSON.stringify({ 'acc-1': [{ term: 'grace', at: 1 }] }))
        expect(getSearchRecents('acc-1')).toEqual(['grace'])
    })
})

describe('reading a store somebody else wrote', () => {
    it('degrades to no history rather than throwing', () => {
        for (const raw of ['not json', '[]', '"nope"', '{"acc-1":"nope"}', 'null']) {
            window.localStorage.setItem(KEY, raw)
            expect(getSearchRecents('acc-1')).toEqual([])
        }
    })

    it('keeps the usable rows out of a partly-broken list', () => {
        window.localStorage.setItem(
            KEY,
            JSON.stringify({
                'acc-1': [
                    { term: 'ada', at: 1 },
                    { term: '', at: 2 },
                    { at: 3 },
                    'grace',
                    null,
                    { term: 'hopper', at: 'later' },
                ],
            }),
        )
        expect(getSearchRecents('acc-1')).toEqual(['ada', 'hopper'])
    })

    /** Namespaced under `tevi.*` and declared once in `STORAGE_KEYS`, unlike legacy's key. */
    it('writes to the registered namespaced key', () => {
        addSearchRecent('ada', 'acc-1')
        expect(KEY).toBe('tevi.search.recents')
        expect(window.localStorage.getItem(KEY)).toContain('ada')
    })
})
