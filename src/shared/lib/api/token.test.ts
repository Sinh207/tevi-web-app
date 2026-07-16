// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
    addOrUpdateAccount,
    clearTokens,
    getAccessToken,
    getAccounts,
    getActiveAccountId,
    MAX_ACCOUNTS,
    MaxAccountsError,
    purgeAnonymousAccounts,
    removeAccount,
    setActiveAccount,
    setTokens,
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

    it('removing the active account falls back to another', () => {
        addAccount('1')
        addAccount('2')
        removeAccount('2')
        expect(getActiveAccountId()).toBe('1')
        expect(getAccounts()).toHaveLength(1)
    })

    it('enforces MAX_ACCOUNTS', () => {
        for (let i = 0; i < MAX_ACCOUNTS; i++) addAccount(`u${i}`)
        expect(() => addAccount('overflow')).toThrow(MaxAccountsError)
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
