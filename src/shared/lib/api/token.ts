/**
 * Multi-account token store (Bearer JWT), shared infrastructure consumed by the
 * axios client and the auth feature.
 *
 * Persistence (localStorage-only — accepts the XSS trade-off; the backend
 * authenticates via the Authorization header, not cookies). Keys are the
 * namespaced ones in STORAGE_KEYS (`tevi.auth.accounts` / `tevi.auth.active`);
 * legacy keys are migrated by storage.ts.
 *
 * `useSyncExternalStore`-compatible (subscribe / getSnapshot).
 */

import { eventBus } from '@shared/lib/event-bus'
import { STORAGE_KEYS, storage } from '@shared/lib/storage'

export const MAX_ACCOUNTS = 10

export class MaxAccountsError extends Error {
    code = 'ACCOUNT_LIMIT'
    constructor() {
        super('Account limit reached')
        this.name = 'MaxAccountsError'
    }
}

export interface AccountUser {
    id: string | number
    anonymous?: boolean
    [key: string]: unknown
}

export interface Account {
    id: string
    access_token: string
    refresh_token: string | null
    /** raw seconds-to-expiry as returned by the backend (cookie contract) */
    expires_in: number | null
    /** absolute expiry epoch in ms (computed at set time; used for refresh) */
    expires_at: number | null
    user: AccountUser | null
}

export interface TokenSnapshot {
    accounts: Account[]
    activeId: string | null
}

let accounts: Account[] = []
let activeId: string | null = null
let hydrated = false
let snapshot: TokenSnapshot = { accounts, activeId }
const EMPTY_SNAPSHOT: TokenSnapshot = { accounts: [], activeId: null }
const listeners = new Set<() => void>()

const isBrowser = () => typeof window !== 'undefined'

function persist() {
    const map: Record<string, Account> = {}
    for (const a of accounts) map[a.id] = a
    storage.setJSON(STORAGE_KEYS.accounts, map)
    if (activeId) storage.set(STORAGE_KEYS.activeAccount, activeId)
    else storage.remove(STORAGE_KEYS.activeAccount)
}

function notify() {
    snapshot = { accounts, activeId }
    for (const l of listeners) l()
}

function readFromStorage() {
    const map = storage.getJSON<Record<string, Account>>(STORAGE_KEYS.accounts)
    accounts = map ? Object.values(map).filter(Boolean) : []
    const stored = storage.get(STORAGE_KEYS.activeAccount)
    // An active id with no account behind it is a torn read, not an invitation to
    // act as somebody else. This used to fall back to `accounts[0]`, which quietly
    // undid the whole point of `removeAccount({ promote: false })` on the next
    // reload. Two ways to reach it, both real: `migrateLegacyStorage` renames
    // `user_id` unconditionally while dropping legacy accounts that carried no
    // access token, and the cross-tab `storage` event fires once per key, so
    // another tab writing `accounts` then `active` is observed mid-write.
    activeId = stored && accounts.some(a => a.id === stored) ? stored : null
}

function hydrate() {
    if (hydrated || !isBrowser()) return
    hydrated = true
    try {
        readFromStorage()
        snapshot = { accounts, activeId }
    } catch {
        // stay in-memory only
    }
    watchOtherTabs()
}

const serialize = () => JSON.stringify({ accounts, activeId })

/**
 * Re-read the store from localStorage; returns whether anything actually changed.
 *
 * Callers use this to stop trusting their own in-memory copy at the two moments
 * where another tab may have moved underneath them: a tab writes tokens, and
 * every other tab's module state is instantly a lie. Cheap enough to call before
 * any decision that depends on "does this device have a session".
 */
export function syncFromStorage(): boolean {
    if (!isBrowser()) return false
    // Not just for the initial read: this is what installs the tab watcher, and a
    // caller reaching for a fresh copy may well be the first thing to touch the store.
    hydrate()
    const before = serialize()
    try {
        readFromStorage()
    } catch {
        return false
    }
    if (serialize() === before) return false
    notify()
    return true
}

/**
 * Follow the store across tabs.
 *
 * Without this, signing out in one tab left every other tab holding tokens the
 * device no longer has — they kept rendering a signed-in shell until the next
 * request 401'd, and a switch of active account was invisible to them entirely.
 * The `storage` event only fires in *other* tabs, so there is no echo to guard
 * against; `key === null` is another tab calling `localStorage.clear()`.
 */
let watching = false
function watchOtherTabs() {
    if (watching || !isBrowser()) return
    watching = true
    window.addEventListener('storage', event => {
        const relevant =
            event.key === null ||
            event.key === STORAGE_KEYS.accounts ||
            event.key === STORAGE_KEYS.activeAccount
        if (!relevant) return
        if (syncFromStorage()) eventBus.emit('auth:accounts-synced')
    })
}

function getActiveAccount(): Account | null {
    hydrate()
    return accounts.find(a => a.id === activeId) ?? null
}

export function getAccessToken(): string | null {
    return getActiveAccount()?.access_token ?? null
}
export function getRefreshToken(): string | null {
    return getActiveAccount()?.refresh_token ?? null
}
export function getExpiresAt(): number | null {
    return getActiveAccount()?.expires_at ?? null
}
export function getAccounts(): Account[] {
    hydrate()
    return accounts
}
/** Look one account up by id — used where "the active account" is not good enough. */
export function getAccount(id: string | null | undefined): Account | null {
    if (!id) return null
    hydrate()
    return accounts.find(a => a.id === id) ?? null
}
export function getActiveAccountId(): string | null {
    hydrate()
    return activeId
}

interface TokenInput {
    access_token: string
    refresh_token?: string | null
    expires_in?: number | null
}

function computeExpiresAt(expires_in?: number | null): number | null {
    return expires_in != null ? Date.now() + expires_in * 1000 : null
}

/**
 * Update the tokens of one account — the active one unless `accountId` says
 * otherwise (the refresh flow always names its account explicitly, because the
 * account that was active when the refresh started may not be the one active
 * when it resolves).
 *
 * Returns whether an account was actually written: a refresh whose account was
 * removed mid-flight must not be reported as a success, or the caller replays a
 * request with a bearer that is in nobody's store.
 */
export function setTokens(
    { access_token, refresh_token, expires_in }: TokenInput,
    accountId?: string | null,
): boolean {
    hydrate()
    const id = accountId ?? activeId
    const idx = accounts.findIndex(a => a.id === id)
    if (idx === -1) return false
    accounts = accounts.map((a, i) =>
        i === idx
            ? {
                  ...a,
                  access_token,
                  refresh_token: refresh_token ?? a.refresh_token,
                  expires_in: expires_in ?? a.expires_in,
                  expires_at: computeExpiresAt(expires_in) ?? a.expires_at,
              }
            : a,
    )
    persist()
    notify()
    return true
}

/**
 * Whether `addOrUpdateAccount` would accept this id, i.e. whether it is an
 * account we already hold or there is room for another one.
 *
 * Exists so a sign-in can find out *before* it asks the backend for tokens.
 * `addOrUpdateAccount` throwing is the last line of defence, but by then the
 * server has already minted a session that nothing is going to store.
 */
export function canAddAccount(id: string | number): boolean {
    hydrate()
    const key = String(id)
    return accounts.length < MAX_ACCOUNTS || accounts.some(a => a.id === key)
}

export function addOrUpdateAccount(input: {
    id: string | number
    access_token: string
    refresh_token?: string | null
    expires_in?: number | null
    user?: AccountUser | null
}) {
    hydrate()
    const id = String(input.id)
    const idx = accounts.findIndex(a => a.id === id)
    const next: Account = {
        id,
        access_token: input.access_token,
        refresh_token: input.refresh_token ?? null,
        expires_in: input.expires_in ?? null,
        expires_at: computeExpiresAt(input.expires_in),
        user: input.user ?? null,
    }
    if (idx === -1) {
        if (accounts.length >= MAX_ACCOUNTS) throw new MaxAccountsError()
        accounts = [...accounts, next]
    } else {
        accounts = accounts.map((a, i) => (i === idx ? { ...next, user: input.user ?? a.user } : a))
    }
    activeId = id
    persist()
    notify()
}

/**
 * Fold a freshly-fetched profile into the one we hold, preserving `anonymous`.
 *
 * `anonymous` is a local fact about how this session was *minted* — it is not a
 * profile field, and `/me` has no reason to echo it. Replacing the stored user
 * wholesale with a `/me` body therefore erased it, and three separate consumers
 * read that flag off the stored user: `isAuthenticated` in the auth provider,
 * `purgeAnonymousAccounts` below, and `wasAnonymous` in the client's dead-account
 * handler. Losing it promoted a guest to "signed in" — which, among other things,
 * bounced them off `/login` and made signing in for real unreachable.
 *
 * A response that *does* state `anonymous` still wins: the backend is allowed to
 * correct us, silence is not.
 */
export function mergeAccountUser(prev: AccountUser | null, next: AccountUser): AccountUser {
    const anonymous = 'anonymous' in next ? next.anonymous : prev?.anonymous
    return anonymous === undefined ? next : { ...next, anonymous }
}

export function updateAccountUser(id: string | number, user: AccountUser | null) {
    hydrate()
    const key = String(id)
    const idx = accounts.findIndex(a => a.id === key)
    if (idx === -1) return
    accounts = accounts.map((a, i) =>
        i === idx ? { ...a, user: user ? mergeAccountUser(a.user, user) : a.user } : a,
    )
    persist()
    notify()
}

export function setActiveAccount(id: string | number) {
    hydrate()
    const key = String(id)
    if (!accounts.find(a => a.id === key)) return
    activeId = key
    persist()
    notify()
}

/**
 * Drop an account.
 *
 * `promote` decides what happens when the account being removed is the active
 * one. Signing out of it yourself should land you on the next account you have
 * (the default). A session that *died* must not: promoting there silently makes
 * you act as a different real person — posting, tipping, messaging as an
 * identity you never chose. Those callers pass `promote: false`, leaving no
 * active account, and the app falls back to anonymous with the other accounts
 * still listed in the switcher for the user to pick deliberately.
 */
export function removeAccount(id: string | number, { promote = true } = {}) {
    hydrate()
    const key = String(id)
    const wasActive = activeId === key
    accounts = accounts.filter(a => a.id !== key)
    if (wasActive) activeId = (promote ? accounts[0]?.id : null) ?? null
    persist()
    notify()
}

/** Drop lingering anonymous accounts (keeps the active one). Call after a real
 *  sign-in so the anon session left behind isn't offered in the switcher. */
export function purgeAnonymousAccounts() {
    hydrate()
    const before = accounts.length
    accounts = accounts.filter(a => a.id === activeId || !a.user?.anonymous)
    if (accounts.length !== before) {
        persist()
        notify()
    }
}

/** Full sign-out — wipe every account. */
export function clearTokens() {
    hydrate()
    accounts = []
    activeId = null
    persist()
    notify()
}

export function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}
export function getSnapshot(): TokenSnapshot {
    hydrate()
    return snapshot
}
export function getServerSnapshot(): TokenSnapshot {
    return EMPTY_SNAPSHOT
}
