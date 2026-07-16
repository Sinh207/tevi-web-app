import { getCookie, removeCookie, setCookie } from '@shared/lib/cookies'

/**
 * Multi-account token store (Bearer JWT), shared infrastructure consumed by the
 * axios client and the auth feature.
 *
 * Persistence (matches the legacy backend/SSO contract):
 *   - Cross-subdomain cookies for the ACTIVE account: t_uat / t_urt / t_uei / t_uid
 *   - localStorage `user_logged_list`: map of every logged-in account (multi-account)
 *   - localStorage `user_id`: the active account id
 *
 * Read priority on hydrate: `user_logged_list[user_id]` → cookies.
 * `useSyncExternalStore`-compatible (subscribe / getSnapshot).
 */

export const MAX_ACCOUNTS = 10

// Cookie keys (SSO contract — do not rename)
const CK_ACCESS = 't_uat'
const CK_REFRESH = 't_urt'
const CK_EXPIRES = 't_uei'
const CK_UID = 't_uid'
// localStorage keys
const LS_LIST = 'user_logged_list'
const LS_ACTIVE = 'user_id'

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

function readLS<T>(key: string): T | null {
    if (!isBrowser()) return null
    try {
        const raw = window.localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : null
    } catch {
        return null
    }
}

function persist() {
    if (!isBrowser()) return
    try {
        const map: Record<string, Account> = {}
        for (const a of accounts) map[a.id] = a
        window.localStorage.setItem(LS_LIST, JSON.stringify(map))
        if (activeId) window.localStorage.setItem(LS_ACTIVE, activeId)
        else window.localStorage.removeItem(LS_ACTIVE)
    } catch {
        // ignore quota / disabled storage
    }
    syncCookies()
}

/** Mirror the active account's tokens to cross-subdomain cookies (SSO). */
function syncCookies() {
    if (!isBrowser()) return
    const active = accounts.find(a => a.id === activeId)
    if (!active) {
        for (const c of [CK_ACCESS, CK_REFRESH, CK_EXPIRES, CK_UID]) removeCookie(c)
        return
    }
    setCookie(CK_ACCESS, active.access_token)
    if (active.refresh_token) setCookie(CK_REFRESH, active.refresh_token)
    if (active.expires_in != null) setCookie(CK_EXPIRES, String(active.expires_in))
    setCookie(CK_UID, active.id)
}

function notify() {
    snapshot = { accounts, activeId }
    for (const l of listeners) l()
}

function hydrate() {
    if (hydrated || !isBrowser()) return
    hydrated = true
    try {
        const map = readLS<Record<string, Account>>(LS_LIST)
        if (map) accounts = Object.values(map).filter(Boolean)
        activeId = window.localStorage.getItem(LS_ACTIVE)

        // Fall back to cookies if LS is empty (e.g. session set by another property).
        if (accounts.length === 0) {
            const access = getCookie(CK_ACCESS)
            const uid = getCookie(CK_UID)
            if (access && uid) {
                const expIn = getCookie(CK_EXPIRES)
                accounts = [
                    {
                        id: uid,
                        access_token: access,
                        refresh_token: getCookie(CK_REFRESH) ?? null,
                        expires_in: expIn ? Number(expIn) : null,
                        expires_at: expIn ? Date.now() + Number(expIn) * 1000 : null,
                        user: null,
                    },
                ]
                activeId = uid
            }
        }

        if (activeId && !accounts.find(a => a.id === activeId)) {
            activeId = accounts[0]?.id ?? null
        }
        snapshot = { accounts, activeId }
    } catch {
        // stay in-memory only
    }
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

/** Update tokens of the active account (used by the refresh flow). */
export function setTokens({ access_token, refresh_token, expires_in }: TokenInput) {
    hydrate()
    const idx = accounts.findIndex(a => a.id === activeId)
    if (idx === -1) return
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

export function updateAccountUser(id: string | number, user: AccountUser | null) {
    hydrate()
    const key = String(id)
    const idx = accounts.findIndex(a => a.id === key)
    if (idx === -1) return
    accounts = accounts.map((a, i) => (i === idx ? { ...a, user: user ?? a.user } : a))
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

export function removeAccount(id: string | number) {
    hydrate()
    const key = String(id)
    const wasActive = activeId === key
    accounts = accounts.filter(a => a.id !== key)
    if (wasActive) activeId = accounts[0]?.id ?? null
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
