// @vitest-environment jsdom
import { eventBus } from '@shared/lib/event-bus'
import { STORAGE_KEYS } from '@shared/lib/storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    addOrUpdateAccount,
    canAddAccount,
    clearTokens,
    getAccessToken,
    getAccount,
    getAccounts,
    getActiveAccountId,
    MAX_ACCOUNTS,
    MaxAccountsError,
    mergeAccountUser,
    purgeAnonymousAccounts,
    removeAccount,
    setActiveAccount,
    setTokens,
    syncFromStorage,
    updateAccountUser,
} from './token'

function addAccount(id: string, opts: { anonymous?: boolean } = {}) {
    addOrUpdateAccount({
        id,
        access_token: `at-${id}`,
        refresh_token: `rt-${id}`,
        expires_in: 3600,
        user: { id, anonymous: opts.anonymous },
    })
}

beforeEach(() => {
    localStorage.clear()
    clearTokens()
})

describe('token store — multi-account', () => {
    it('adds an account and makes it active', () => {
        addAccount('1')
        expect(getActiveAccountId()).toBe('1')
        expect(getAccessToken()).toBe('at-1')
        expect(getAccounts()).toHaveLength(1)
    })

    it('a newly added account becomes active; both are kept', () => {
        addAccount('1')
        addAccount('2')
        expect(getAccounts()).toHaveLength(2)
        expect(getActiveAccountId()).toBe('2')
        expect(getAccessToken()).toBe('at-2')
    })

    it('switches the active account', () => {
        addAccount('1')
        addAccount('2')
        setActiveAccount('1')
        expect(getActiveAccountId()).toBe('1')
        expect(getAccessToken()).toBe('at-1')
    })

    it('setTokens updates only the active account', () => {
        addAccount('1')
        setTokens({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 7200 })
        expect(getAccessToken()).toBe('new-at')
    })

    it('setTokens writes to the named account, not whichever is active now', () => {
        addAccount('1')
        addAccount('2') // '2' is active — a refresh started for '1' must not land here
        expect(setTokens({ access_token: 'refreshed-1' }, '1')).toBe(true)
        expect(getAccount('1')?.access_token).toBe('refreshed-1')
        expect(getAccessToken()).toBe('at-2')
    })

    it('setTokens reports failure when the account went away mid-refresh', () => {
        addAccount('1')
        removeAccount('1')
        expect(setTokens({ access_token: 'too-late' }, '1')).toBe(false)
    })

    it('removing the active account falls back to another', () => {
        addAccount('1')
        addAccount('2')
        removeAccount('2')
        expect(getActiveAccountId()).toBe('1')
        expect(getAccounts()).toHaveLength(1)
    })

    it('promote:false leaves no active account — a dead session must not adopt another', () => {
        addAccount('1')
        addAccount('2') // '2' is active and its refresh token has just been rejected
        removeAccount('2', { promote: false })
        // '1' is still available to switch to, but nobody is acting as it.
        expect(getAccounts().map(a => a.id)).toEqual(['1'])
        expect(getActiveAccountId()).toBeNull()
        expect(getAccessToken()).toBeNull()
    })

    it('promote:false survives a reload — the fallback is not re-applied on hydrate', () => {
        addAccount('1')
        addAccount('2')
        removeAccount('2', { promote: false })
        // Same storage, fresh in-memory state.
        expect(syncFromStorage()).toBe(false)
        expect(getActiveAccountId()).toBeNull()
    })

    it('enforces MAX_ACCOUNTS', () => {
        for (let i = 0; i < MAX_ACCOUNTS; i++) addAccount(`u${i}`)
        expect(() => addAccount('overflow')).toThrow(MaxAccountsError)
    })
})

describe('cross-tab sync', () => {
    /** What another tab writing the shared store looks like from in here. */
    function otherTabWrites(accountsMap: Record<string, unknown>, active: string | null) {
        localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accountsMap))
        if (active) localStorage.setItem(STORAGE_KEYS.activeAccount, active)
        else localStorage.removeItem(STORAGE_KEYS.activeAccount)
        window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.accounts }))
    }

    it('picks up a sign-out that happened in another tab', () => {
        addAccount('1')
        const synced = vi.fn()
        eventBus.on('auth:accounts-synced', synced)

        otherTabWrites({}, null)

        expect(getAccounts()).toHaveLength(0)
        expect(getActiveAccountId()).toBeNull()
        expect(synced).toHaveBeenCalledTimes(1)
        eventBus.off('auth:accounts-synced', synced)
    })

    it('picks up an account switch that happened in another tab', () => {
        addAccount('1')
        addAccount('2')
        const map = JSON.parse(localStorage.getItem(STORAGE_KEYS.accounts) ?? '{}')

        otherTabWrites(map, '1')

        expect(getActiveAccountId()).toBe('1')
        expect(getAccessToken()).toBe('at-1')
    })

    it('ignores unrelated keys and no-op writes — no needless re-render', () => {
        addAccount('1')
        const synced = vi.fn()
        eventBus.on('auth:accounts-synced', synced)

        window.dispatchEvent(new StorageEvent('storage', { key: 'tevi.theme' }))
        // Same content, different write: nothing to tell anyone about.
        window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEYS.accounts }))

        expect(synced).not.toHaveBeenCalled()
        expect(getActiveAccountId()).toBe('1')
        eventBus.off('auth:accounts-synced', synced)
    })

    it('syncFromStorage reports whether anything moved', () => {
        addAccount('1')
        expect(syncFromStorage()).toBe(false)
        localStorage.removeItem(STORAGE_KEYS.accounts)
        expect(syncFromStorage()).toBe(true)
    })
})

describe('purgeAnonymousAccounts', () => {
    it('drops non-active anonymous accounts but keeps the active one', () => {
        addAccount('anon', { anonymous: true }) // active anon
        addAccount('real') // real becomes active
        // 'anon' is now a lingering non-active anonymous account
        purgeAnonymousAccounts()
        expect(getAccounts().map(a => a.id)).toEqual(['real'])
        expect(getActiveAccountId()).toBe('real')
    })

    it('keeps an active anonymous account (still browsing as guest)', () => {
        addAccount('anon', { anonymous: true })
        purgeAnonymousAccounts()
        expect(getAccounts()).toHaveLength(1)
    })
})

describe('mergeAccountUser — the `anonymous` flag survives a /me refresh', () => {
    it('keeps `anonymous` when the response simply omits it', () => {
        // The bug this exists for: /me answers with a profile, the profile has no
        // reason to mention `anonymous`, and replacing the stored user wholesale
        // therefore promoted a guest to "signed in".
        const merged = mergeAccountUser({ id: '1', anonymous: true }, { id: '1', name: 'Guest' })
        expect(merged.anonymous).toBe(true)
        expect(merged.name).toBe('Guest')
    })

    it('lets the backend correct us when it does state the flag', () => {
        expect(
            mergeAccountUser({ id: '1', anonymous: true }, { id: '1', anonymous: false }).anonymous,
        ).toBe(false)
    })

    it('adds nothing when neither side knows', () => {
        expect('anonymous' in mergeAccountUser({ id: '1' }, { id: '1' })).toBe(false)
        expect('anonymous' in mergeAccountUser(null, { id: '1' })).toBe(false)
    })

    it('updateAccountUser applies the merge, so a guest stays a guest', () => {
        addAccount('anon', { anonymous: true })
        updateAccountUser('anon', { id: 'anon', display_name: 'Guest 123' })
        expect(getAccount('anon')?.user?.anonymous).toBe(true)
        // …and purge still recognises it afterwards.
        addAccount('real')
        purgeAnonymousAccounts()
        expect(getAccounts().map(a => a.id)).toEqual(['real'])
    })
})

describe('hydrate — an unknown active id is never promoted', () => {
    it('leaves no active account rather than adopting another identity', () => {
        // Reachable for real: `migrateLegacyStorage` renames `user_id` even when the
        // account it names was dropped for having no access token. Promoting
        // `accounts[0]` there signs you in as a different real person.
        addAccount('a')
        addAccount('b')
        localStorage.setItem(STORAGE_KEYS.activeAccount, 'ghost')

        syncFromStorage()

        expect(getActiveAccountId()).toBeNull()
        expect(getAccessToken()).toBeNull()
        expect(
            getAccounts()
                .map(a => a.id)
                .sort(),
        ).toEqual(['a', 'b'])
    })
})

describe('canAddAccount', () => {
    it('is false only when the limit is reached by a genuinely new id', () => {
        for (let i = 0; i < MAX_ACCOUNTS; i++) addAccount(`acct-${i}`)
        expect(canAddAccount('acct-0')).toBe(true) // already held — an update
        expect(canAddAccount('brand-new')).toBe(false)
        // Which is what lets a sign-in find out *before* asking the backend for
        // tokens it would then have to throw away.
        expect(() => addAccount('brand-new')).toThrow(MaxAccountsError)
    })
})
